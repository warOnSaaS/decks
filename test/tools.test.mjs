import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// The catalogue test (ROADMAP 3.2): every tool is fully described, tools.json matches the code, wire
// names fit model APIs, and an agent reaches every single tool over MCP alone.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decks-tools-'));
Object.assign(process.env, { SQLITE_FILE: path.join(dir, 'd.db'), FILES_DIR: path.join(dir, 'files'), OAUTH_SECRET: 'tools-secret', DECKS_EXAMPLES: '1', AUTH_PROVIDER: 'local' });
delete process.env.DATABASE_URL;
delete process.env.WOS_ACCOUNT_CLIENT_ID;

let server, app, base, mod, sam;
before(async () => {
  mod = await import('../server.mjs');
  server = mod.createServer();
  await new Promise((r) => server.listen(0, r));
  app = await server.ready;
  base = `http://localhost:${server.address().port}`;
  sam = await app.decks.addPerson(app.teamId, { name: 'Sam Rivera', email: 'sam@acme-dental.example', role: 'owner' });
});
after(async () => { (await import('../lib/export-pdf.mjs')).closeBrowser(); server?.closeAllConnections?.(); server?.close(); await app?.close(); });

test('every tool has a name, title, plain description, schemas, scope, confirm and fits model APIs', () => {
  const cat = mod.catalogue();
  const json = JSON.parse(fs.readFileSync('tools.json', 'utf8'));
  assert.deepEqual(json.tools.map((t) => t.name), cat.map((t) => t.name), 'tools.json is current (npm run tools:json)');
  for (const t of cat) {
    assert.match(t.name, /^decks\.[a-z]+(_[a-z]+)*$/, t.name);
    assert.ok(mod.toWire(t.name).length <= 64 && /^[A-Za-z0-9_-]+$/.test(mod.toWire(t.name)), `${t.name} wire name`);
    assert.ok(t.title && t.description.length > 20, `${t.name} describes itself`);
    assert.ok(!/—|–/.test(t.description + t.title), `${t.name}: no dashes`);
    assert.equal(t.input.type, 'object');
    assert.ok(t.output);
    assert.ok(['read', 'write', 'delete', 'admin'].includes(t.scope));
    assert.ok(['none', 'human'].includes(t.confirm));
  }
});

test('an agent reaches every tool over MCP alone', async () => {
  const { issueTokens } = await import('../lib/auth.mjs');
  const token = issueTokens(sam, { app: 'tools test' }).access_token;
  const client = new Client({ name: 'tools-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
  const { tools } = await client.listTools();
  const names = new Set(tools.map((t) => t.name));
  const reached = new Set();
  const call = async (name, args = {}, { error = false } = {}) => {
    const r = await client.callTool({ name, arguments: args });
    reached.add(name);
    if (!error && r.isError) throw new Error(`${name}: ${r.content[0].text}`);
    return r.isError ? r : r.structuredContent ?? JSON.parse(r.content.find((c) => c.type === 'text').text);
  };
  await call('decks_list_layouts'); await call('decks_list_themes'); await call('decks_get_settings'); await call('decks_list_people');
  const d = await call('decks_create_deck', { title: 'Every tool', theme: { preset: 'clean' } });
  const D = d.id;
  await call('decks_update_deck', { deck: D, title: 'Every tool, renamed' });
  await call('decks_list_decks', { query: 'renamed' });
  const s1 = await call('decks_add_slide', { deck: D, layout: 'title', title: 'Hello' });
  const s2 = await call('decks_add_slide', { deck: D, layout: 'content', title: 'Body' });
  await call('decks_get_deck', { deck: D }); await call('decks_get_slide', { deck: D, slide: 2 });
  await call('decks_set_slide_content', { deck: D, slide: s2.id, subtitle: 'A lede' });
  await call('decks_set_notes', { deck: D, slide: 1, notes: 'Hi' });
  const b = await call('decks_add_block', { deck: D, slide: 2, block: { t: 'text', text: 'One' } });
  await call('decks_add_block', { deck: D, slide: 2, block: { t: 'bullets', items: ['a', 'b'] } });
  await call('decks_update_block', { deck: D, slide: 2, block: b.id, set: { text: 'Uno' } });
  await call('decks_move_block', { deck: D, slide: 2, block: b.id, to: 2 });
  await call('decks_remove_block', { deck: D, slide: 2, block: b.id });
  await call('decks_add_chart', { deck: D, slide: 2, labels: ['a', 'b'], series: [{ name: 'n', values: [1, 2] }] });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const f = await call('decks_upload_file', { name: 'dot.png', type: 'image/png', content_base64: png.toString('base64') });
  await call('decks_add_image', { deck: D, slide: 2, file: f.id, alt: 'A dot' });
  await call('decks_duplicate_slide', { deck: D, slide: s1.id });
  await call('decks_reorder_slides', { deck: D, slide: s2.id, to: 1 });
  await call('decks_delete_slide', { deck: D, slide: 3 });
  await call('decks_apply_theme', { deck: D, scheme: 'sage' });
  await call('decks_set_brand', { deck: D, footer: 'Acme Dental', logo: f.url });
  const team = await call('decks_apply_team_brand', { deck: D, team: 'acme-dental' }, { error: true });
  assert.match(team.content[0].text, /does not use the warOnSaaS account/);
  const c = await call('decks_add_comment', { deck: D, slide: 1, body: 'Nice' });
  await call('decks_resolve_comment', { comment: c.id });
  await call('decks_list_comments', { deck: D });
  await call('decks_delete_comment', { comment: c.id });
  await call('decks_list_activity', { deck: D });
  const ch = await call('decks_get_changes', { deck: D });
  await call('decks_sync_doc', { deck: D, update: ch.update });
  await call('decks_set_preferences', { theme: 'dark' });
  const pend = await call('decks_share_deck', { deck: D });
  assert.ok(pend.pending, 'sharing from an app waits for a yes');
  const { approvals } = await call('decks_list_approvals');
  assert.equal(approvals[0].tool, 'decks.share_deck');
  const no = await call('decks_decide_approval', { approval: approvals[0].id, approve: true }, { error: true });
  assert.match(no.content[0].text, /Only a person/);
  await app.run(sam, 'decks.decide_approval', { approval: approvals[0].id, approve: true }, { via: 'web' });
  await call('decks_list_shares', { deck: D });
  await call('decks_unshare_deck', { deck: D });
  await call('decks_link_record', { deck: D, record: 'd_acme01', label: 'Acme Dental, expansion' });
  const rev = await call('decks_request_review', { deck: D, assignee: 'Jordan', due: '2026-10-20' });
  assert.equal(rev.where, 'deck');
  const links = (await call('decks_get_deck', { deck: D })).links;
  await call('decks_unlink_record', { deck: D, link: links[0].id });
  const prev = await client.callTool({ name: 'decks_preview_slide', arguments: { deck: D, slide: 1 } });
  reached.add('decks_preview_slide');
  assert.ok(prev.content.some((x) => x.type === 'image' && x.mimeType === 'image/png'), 'the preview is an image an agent can see');
  const pdf = await call('decks_export_pdf', { deck: D, with_notes: true });
  assert.equal(pdf.pages, 4);
  const pptx = await call('decks_export_pptx', { deck: D });
  const imp = await call('decks_import_pptx', { file: pptx.file.id, title: 'Back again' });
  assert.equal(imp.deck.slides.length, 2);
  await call('decks_export_data');
  const dup = await call('decks_duplicate_deck', { deck: D });
  await call('decks_archive_deck', { deck: dup.id });
  const del = await call('decks_delete_deck', { deck: dup.id });
  assert.ok(del.pending, 'deleting from an app waits for a yes');
  const p = await call('decks_add_person', { email: 'casey@acme-dental.example', name: 'Casey Morgan' });
  const rm = await call('decks_remove_person', { person: p.id });
  assert.ok(rm.pending);
  // Approved deletes run as the person, from the app.
  for (const a of (await app.run(sam, 'decks.list_approvals', {})).approvals) await app.run(sam, 'decks.decide_approval', { approval: a.id, approve: true });
  await client.close();
  const missing = [...names].filter((n) => !reached.has(n));
  assert.deepEqual(missing, [], 'every tool was reached over MCP');
});

test('REST answers like the suite: result, pending, error with code and message', async () => {
  const { issueTokens } = await import('../lib/auth.mjs');
  const h = { authorization: `Bearer ${issueTokens(sam).access_token}`, 'content-type': 'application/json' };
  const ok = await fetch(`${base}/api/tools/decks_list_decks`, { method: 'POST', headers: h, body: '{}' }).then((r) => r.json());
  assert.ok(Array.isArray(ok.result.decks), 'wire names work over REST');
  const bad = await fetch(`${base}/api/tools/decks.get_deck`, { method: 'POST', headers: h, body: '{}' });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, 'invalid_input');
  const anon = await fetch(`${base}/api/tools/decks.list_decks`, { method: 'POST', body: '{}' });
  assert.equal(anon.status, 401);
  const oa = await fetch(`${base}/api/openapi.json`).then((r) => r.json());
  assert.ok(oa.paths['/api/tools/decks_create_deck']);
});

test('public pages: the front page, examples, share links and embeds need no account', async () => {
  const home = await fetch(`${base}/`).then((r) => r.text());
  assert.match(home, /Host it yourself, free/);
  assert.match(home, /\/examples\/acme-dental-investor-update/);
  const ex = await fetch(`${base}/examples/birch-law-client-pitch`);
  assert.equal(ex.status, 200);
  assert.match(await ex.text(), /dk-slide/);
  const d = await app.run(sam, 'decks.create_deck', { title: 'Shared', slides: [{ layout: 'title', title: 'Look' }, { layout: 'content', title: 'Hidden one', hidden: true }] });
  const v = await app.run(sam, 'decks.share_deck', { deck: d.id });
  const page = await fetch(v.url.replace('http://decks.test', base).replace(/^https?:\/\/[^/]+/, base)).then((r) => r.text());
  assert.match(page, /Look/);
  assert.ok(!/Hidden one/.test(page), 'hidden slides are not shared');
  const e = await app.run(sam, 'decks.share_deck', { deck: d.id, kind: 'embed' });
  const er = await fetch(e.url.replace(/^https?:\/\/[^/]+/, base));
  assert.equal(er.status, 200);
  assert.match(er.headers.get('content-security-policy'), /frame-ancestors \*/);
  assert.equal((await fetch(`${base}/s/notarealtoken123`)).status, 404);
  const app404 = await fetch(`${base}/app`, { redirect: 'manual' });
  assert.equal(app404.status, 302, 'editing needs an account');
});
