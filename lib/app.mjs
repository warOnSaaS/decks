import fs from 'node:fs';
import path from 'node:path';
import { openDb, migrate } from './db.mjs';
import { Live } from './live.mjs';
import { Decks } from './decks.mjs';
import { Files } from './files.mjs';
import { provider } from './auth.mjs';
import { listTools, runTool } from './tools.mjs';
import { EXAMPLES } from './examples.mjs';
import { newId } from './ids.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
export const EXAMPLES_TEAM = 'examples';

// Everything the server needs, wired once: the database (migrated on start), live editing, the decks
// store and files. server.mjs serves it; tests make their own on an in-memory database.
export async function createApp(env = process.env) {
  const db = await openDb({ url: env.DATABASE_URL, file: env.SQLITE_FILE });
  const applied = await migrate(db);
  if (applied.length) console.log(`decks: database updated (${applied.join(', ')})`);
  const live = new Live(db);
  await live.start();
  const decks = new Decks({ db, live });
  const files = new Files(db, env);
  const app = {
    env, db, live, decks, files, version: VERSION,
    teamId: env.DECKS_TEAM_ID || 'default',
    teamName: env.DECKS_TEAM_NAME || 'Our decks',
    openSignup: env.DECKS_OPEN_SIGNUP === '1',
    authProvider: provider(),
    publicUrl: (env.PUBLIC_URL || '').replace(/\/$/, ''),
  };
  app.run = (me, name, input, o) => runTool(app, me, name, input, o);
  app.tools = listTools;

  // The example decks anyone may look at, kept in a team of their own.
  app.exampleRows = () => db.all('select * from decks_decks where team_id = $1 and deleted_at is null order by created_at', [EXAMPLES_TEAM]);
  app.exampleDeck = async (ref) => {
    const rows = await app.exampleRows();
    const r = rows.find((x) => x.id === ref || x.title.toLowerCase() === String(ref).toLowerCase() || slugOf(x.title) === ref);
    return r ? decks.json(r.id) : null;
  };

  // Open sign-up (the hosted demo): a new person gets a team of their own with copies of the examples.
  app.newWorkspace = async ({ name, email, github, account_sub }) => {
    const teamId = newId('t');
    await decks.ensureTeam(teamId, `${String(name).split(' ')[0]}'s decks`);
    const me = await decks.addPerson(teamId, { name, email, github, account_sub, role: 'owner' });
    for (const r of await app.exampleRows()) {
      const d = await decks.json(r.id);
      await decks.create(me, d, { via: 'system', example: true });
    }
    return me;
  };

  await decks.ensureTeam(app.teamId, app.teamName);
  if (env.DECKS_EXAMPLES !== '0') await seedExamples(app);
  app.close = async () => { await live.stop(); await db.close(); };
  return app;
}

export const slugOf = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// The three example decks, made once (and again when their content in lib/examples.mjs changes).
export async function seedExamples(app) {
  const { decks, db } = app;
  await decks.ensureTeam(EXAMPLES_TEAM, 'Examples');
  const owner = { id: 'p_examples', team_id: EXAMPLES_TEAM, name: 'Decks examples', role: 'owner' };
  await db.run(`insert into decks_people (id, team_id, name, role, created_at) values ($1, $2, $3, 'owner', $4) on conflict (id) do nothing`, [owner.id, EXAMPLES_TEAM, owner.name, new Date().toISOString()]);
  const have = await app.exampleRows();
  for (const ex of EXAMPLES) {
    const id = `d_ex_${ex.key}_${ex.version}`;
    if (have.some((r) => r.id === id)) continue;
    for (const r of have.filter((x) => x.id.startsWith(`d_ex_${ex.key}_`))) await db.run('update decks_decks set deleted_at = $2 where id = $1', [r.id, new Date().toISOString()]);
    // Two server copies starting at once may both try: the second insert fails on the id and is fine.
    await decks.create(owner, ex.deck, { via: 'system', example: true, id }).catch((e) => { if (!/unique|duplicate/i.test(e.message)) throw e; });
  }
}
