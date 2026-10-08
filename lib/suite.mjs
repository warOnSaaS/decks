import { Decks } from './decks.mjs';
import { Files, view as fileView } from './files.mjs';
import { listTools, runTool, exportTeam } from './tools.mjs';
import { json } from './auth.mjs';
import { EXAMPLES } from './examples.mjs';
import { newDoc, deckFromDoc } from './shared/model.mjs';

// Decks inside the wOS suite (warOnSaaS/suite CONTRACTS.md). The suite calls register(ctx) once, runs
// migrations/ itself, checks sign-in, team, scope and input before any handler, asks for a person's yes
// on confirm: human tools, and serves /api/tools/<name> and /mcp from these handlers. The decks code
// is the same as standalone; this file only translates the suite's ctx and call into it.

// The suite's db speaks ? placeholders; the decks code writes $1, $2. Convert, repeating values used twice.
export function fromSuiteDb(sdb) {
  const conv = (sql, params = []) => {
    const out = [];
    const text = sql.replace(/\$(\d+)/g, (_, n) => { out.push(params[Number(n) - 1]); return '?'; });
    return [text, /\$\d/.test(sql) ? out : params];
  };
  const wrap = (q) => ({
    dialect: sdb.dialect === 'postgres' ? 'pg' : 'sqlite',
    async all(sql, params) { const [t, p] = conv(sql, params); return q.query(t, p); },
    async get(sql, params) { const [t, p] = conv(sql, params); return (await q.get(t, p)) ?? null; },
    async run(sql, params) {
      const [t, p] = conv(sql, params);
      if (/\breturning\b/i.test(t)) { const rows = await q.query(t, p); return { changes: rows.length, rows }; }
      const r = await q.run(t, p);
      return { changes: r?.changes ?? 0, rows: [] };
    },
  });
  return {
    ...wrap(sdb),
    kind: sdb.dialect === 'postgres' ? 'postgres' : 'sqlite',
    tx: (fn) => sdb.tx((t) => fn(wrap(t))),
    async notify() {}, async listen() { return async () => {}; }, async close() {},
  };
}

export async function register(ctx) {
  const env = (name) => ctx.env?.(name) ?? undefined;
  const envObj = new Proxy({}, { get: (_, k) => (typeof k === 'string' ? env(k) : undefined) });
  const db = fromSuiteDb(ctx.db);
  // In the suite, open editors hear about changes through the suite's live events and then catch up
  // with decks.get_changes.
  const live = {
    publish(m) { if (m.team && m.deck && m.type !== 'presence') ctx.events?.publish(m.team, 'decks.deck.changed', { deck: m.deck, kind: m.type, by: m.by ?? null }); },
    present() { return []; },
  };
  const decks = new Decks({ db, live });
  const files = new Files(db, { FILES_STORAGE: env('FILES_STORAGE') ?? 'db', FILES_DIR: env('FILES_DIR'), FILES_MAX_MB: env('FILES_MAX_MB') });
  const app = { env: envObj, db, live, decks, files, suite: true, version: '0.1.0', authProvider: 'suite', publicUrl: String(ctx.publicUrl ?? '').replace(/\/$/, '') };
  app.exampleRows = async () => [];
  app.exampleDeck = async (ref) => {
    const ex = EXAMPLES.find((e) => e.key === ref || e.deck.title.toLowerCase() === String(ref).toLowerCase());
    return ex ? deckFromDoc(newDoc(ex.deck)) : null;
  };

  // In the suite's demo, a team's first visit gets the three example decks to look at and change.
  const seeded = new Set();
  async function seedDemo(me) {
    if (seeded.has(me.team_id) || env('WOS_DEMO') !== '1') return;
    seeded.add(me.team_id);
    if (await db.get('select id from decks_decks where team_id = $1 limit 1', [me.team_id])) return;
    for (const ex of EXAMPLES) await decks.create(me, ex.deck, { via: 'system', example: true });
  }

  // The suite's person (or the person an agent works for) as a decks person on that team.
  async function personFor(call) {
    const team = call.team;
    await decks.ensureTeam(team.id, team.name ?? 'Decks');
    const id = call.actor.kind === 'agent' && call.actor.personId ? call.actor.personId : call.actor.id;
    let p = await decks.personRow(id);
    if (!p) p = await decks.addPerson(team.id, { id, name: call.actor.name ?? 'Someone', role: call.scopes.includes('admin') ? 'admin' : 'member' });
    await seedDemo(p);
    return p;
  }

  const VIA = { screen: 'web', rest: 'rest', mcp: 'mcp', agent: 'agent', email: 'rest', system: 'rest' };
  const handlers = {};
  for (const t of listTools()) {
    handlers[t.name] = async (input, call) => runTool(app, await personFor(call), t.name, input ?? {}, { via: VIA[call.via] ?? 'rest', scopes: call.scopes, approved: true, client: call.actor.kind === 'agent' ? call.actor.name : null, call });
  }

  return {
    handlers,
    async routes(req, res, url, call) {
      if (!url.pathname.startsWith('/files/decks')) return false;
      if (req.method === 'POST' && url.pathname === '/files/decks') {
        if (!call) { json(res, 401, { error: { code: 'sign_in', message: 'Sign in first.' } }); return true; }
        const me = await personFor(call);
        const chunks = [];
        for await (const c of req) chunks.push(c);
        json(res, 200, { result: await files.put(me, { name: url.searchParams.get('name') ?? 'file', type: req.headers['content-type'], data: Buffer.concat(chunks) }) });
        return true;
      }
      const id = /^\/files\/decks\/(f_[\w-]+)/.exec(url.pathname)?.[1];
      const row = id ? await files.row(id) : null;
      if (!row) { json(res, 404, { error: { code: 'not_found', message: 'No such file.' } }); return true; }
      if (!Number(row.public) && (!call || call.team.id !== row.team_id)) { json(res, 401, { error: { code: 'sign_in', message: 'Sign in first.' } }); return true; }
      const data = await files.read(row);
      res.writeHead(200, { 'content-type': row.type, 'content-length': data.length, 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox", 'x-content-type-options': 'nosniff' }).end(data);
      return true;
    },
    exportTeam: (team) => exportTeam(app, team.id),
  };
}

export { fileView };
