import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after } from 'node:test';
import { createApp } from '../lib/app.mjs';

const open = [];
after(async () => { for (const a of open) await a.close().catch(() => {}); });

process.env.OAUTH_SECRET = 'test-secret';

// A fresh app on an in-memory SQLite database (or DECKS_TEST_PG_ALL when given), with a team of three
// people. Files go to a temp folder.
export async function makeApp(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decks-test-'));
  const env = { ...(process.env.DECKS_TEST_PG_ALL ? { DATABASE_URL: process.env.DECKS_TEST_PG_ALL } : {}), SQLITE_FILE: ':memory:', FILES_DIR: path.join(dir, 'files'), DECKS_TEAM_ID: `t${Math.random().toString(36).slice(2, 8)}`, DECKS_TEAM_NAME: 'Birch Law', DECKS_EXAMPLES: '1', ...extra };
  const app = await createApp(env);
  app.publicUrl = 'http://decks.test';
  open.push(app);
  const add = (p) => app.decks.addPerson(app.teamId, p);
  const sam = await add({ name: 'Sam Rivera', email: 'sam@birch-law.example', role: 'owner' });
  const jordan = await add({ name: 'Jordan Lee', email: 'jordan@birch-law.example', role: 'member' });
  const casey = await add({ name: 'Casey Morgan', email: 'casey@birch-law.example', role: 'member' });
  app.dir = dir;
  return { app, sam, jordan, casey, run: (me, name, input, o) => app.run(me, name, input, o) };
}
