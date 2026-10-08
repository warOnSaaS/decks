// The agent run: an AI app builds a 10-slide deck from nothing, over MCP only, then exports a PDF and a
// PowerPoint file and checks both. It signs in the way Claude or ChatGPT would: an email-link sign-in in
// the browser, then MCP OAuth (register, authorize with PKCE, token). Every deck change is an MCP call.
//   node scripts/agent-run.mjs              runs on a fresh SQLite database
//   PYTHON=/path/to/python node scripts/agent-run.mjs   also opens the .pptx with python-pptx
// Writes the PDF, the PPTX, slide previews and a log to .shots/agent-run/.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const OUT = path.resolve('.shots/agent-run');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decks-agent-'));
Object.assign(process.env, { SQLITE_FILE: path.join(dir, 'decks.db'), FILES_DIR: path.join(dir, 'files'), OAUTH_SECRET: 'agent-run', AUTH_PROVIDER: 'local', DECKS_EXAMPLES: '0' });
delete process.env.DATABASE_URL;

const { createServer } = await import('../server.mjs');
const server = createServer();
await new Promise((r) => server.listen(0, r));
const app = await server.ready;
const base = `http://localhost:${server.address().port}`;
const log = [];
const say = (s) => { log.push(s); console.log(s); };

// 1. A person signs in with an email link (the first person owns the team).
await fetch(`${base}/auth/email`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=sam%40acme-dental.example&next=%2Fapp' });
const link = /https?:\/\/\S+/.exec(app.mailer.sent.at(-1).text)[0];
const signed = await fetch(link, { method: 'POST', redirect: 'manual' });
const cookie = signed.headers.get('set-cookie').split(';')[0];

// 2. The AI app connects with MCP OAuth: discovery, registration, PKCE.
const meta = await fetch(`${base}/.well-known/oauth-authorization-server`).then((r) => r.json());
const reg = await fetch(meta.registration_endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Agent run', redirect_uris: ['http://localhost:9/cb'] }) }).then((r) => r.json());
const verifier = crypto.randomBytes(32).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
const auth = new URL(meta.authorization_endpoint);
for (const [k, v] of Object.entries({ client_id: reg.client_id, redirect_uri: 'http://localhost:9/cb', response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 'x' })) auth.searchParams.set(k, v);
const back = await fetch(auth, { headers: { cookie }, redirect: 'manual' });
const code = new URL(back.headers.get('location')).searchParams.get('code');
const tok = await fetch(meta.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: reg.client_id, redirect_uri: 'http://localhost:9/cb' }) }).then((r) => r.json());
say(`signed in and connected over MCP OAuth (scopes: ${tok.scope})`);

const client = new Client({ name: 'agent-run', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${tok.access_token}` } } }));
const { tools } = await client.listTools();
say(`tools/list: ${tools.length} tools, e.g. ${tools.slice(0, 4).map((t) => t.name).join(', ')}`);
let calls = 0;
const call = async (name, args = {}) => {
  calls++;
  const r = await client.callTool({ name, arguments: args });
  if (r.isError) throw new Error(`${name}: ${r.content?.[0]?.text}`);
  return r.structuredContent ?? JSON.parse(r.content.find((c) => c.type === 'text')?.text ?? '{}');
};

// 3. Build the deck, the way an agent would: read the vocabulary, then make it.
await call('decks_list_layouts');
await call('decks_list_themes');
const deck = await call('decks_create_deck', { title: 'Oak Clinic: board meeting, October', theme: { preset: 'calm' } });
const D = deck.id;
await call('decks_set_brand', { deck: D, footer: 'Oak Clinic · Board meeting', accent: '#0f766e' });
const slides = [
  { layout: 'title', kicker: 'Board meeting · October 2026', title: 'A strong first year at Oak Clinic', subtitle: 'Patients, money, people, and the plan for year two.', notes: 'Welcome the board. Forty minutes, questions at the end.' },
  { layout: 'big_number', kicker: 'In one number', title: '3,180', subtitle: 'Patients seen in our first twelve months, 20% ahead of plan.', notes: 'Ahead of plan every quarter.' },
  { layout: 'content', kicker: 'The year', title: 'Ahead of plan on every measure that matters', blocks: [{ t: 'stats', items: [{ value: '$1.9M', label: 'Revenue', note: 'Plan: $1.6M' }, { value: '82%', label: 'Chair use' }, { value: '4.9', label: 'Review score', note: '612 reviews' }] }], notes: 'Revenue beat plan by $300k.' },
  { layout: 'two_column', kicker: 'Growth', title: 'Patients grew every quarter', blocks: [{ t: 'text', slot: 'right', size: 'lg', text: 'Word of mouth did most of the work. **Referrals are 46%** of new patients.' }], notes: 'Chart on the left comes next.' },
  { layout: 'image_right', kicker: 'The team', title: 'Eleven people, nobody has left', image: { url: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=1600&q=80&auto=format&fit=crop', alt: 'A team meeting' }, blocks: [{ t: 'bullets', items: ['Two dentists, three hygienists', 'Front desk of two, with the assistant', 'Zero staff turnover in year one'] }] },
  { layout: 'content', kicker: 'Costs', title: 'Where the money went', notes: 'Rent is the biggest fixed cost.' },
  { layout: 'section', kicker: 'Year two', title: 'Grow without losing what works' },
  { layout: 'content', kicker: 'The plan', title: 'Four moves for year two', blocks: [{ t: 'timeline', items: [{ when: 'Q1', title: 'Evening hours', text: 'Two nights a week' }, { when: 'Q2', title: 'Second hygiene room', text: 'Build-out in March' }, { when: 'Q3', title: 'Kids program', text: 'With two local schools' }, { when: 'Q4', title: 'Review pricing', text: 'First change since opening' }] }] },
  { layout: 'quote', title: 'The front desk knew my name before I said it.', subtitle: 'A patient, in a September review' },
  { layout: 'closing', kicker: 'Thank you', title: 'Questions', subtitle: 'Riley Chen, clinic lead · riley@oak-clinic.example' },
];
for (const s of slides) await call('decks_add_slide', { deck: D, ...s });
await call('decks_add_chart', { deck: D, slide: 4, slot: 'left', kind: 'column', labels: ['Q4 25', 'Q1 26', 'Q2 26', 'Q3 26'], series: [{ name: 'Patients', values: [610, 740, 860, 970] }] });
await call('decks_add_chart', { deck: D, slide: 6, kind: 'donut', labels: ['Staff', 'Rent', 'Supplies', 'Software', 'Other'], series: [{ name: 'Spend', values: [58, 18, 12, 5, 7] }], unit: '%' });
await call('decks_set_notes', { deck: D, slide: 10, notes: 'Thank the board. Hand out the printed PDF.' });
const got = await call('decks_get_deck', { deck: D });
say(`built "${got.title}": ${got.slides.length} slides (${got.slides.map((s) => s.layout).join(', ')})`);
if (got.slides.length !== 10) throw new Error('expected 10 slides');

// 4. Look at the work, as an agent should.
for (const n of [1, 4, 6]) {
  const r = await client.callTool({ name: 'decks_preview_slide', arguments: { deck: D, slide: n } });
  const img = r.content.find((c) => c.type === 'image');
  if (!img) throw new Error('no preview image');
  fs.writeFileSync(path.join(OUT, `preview-${n}.png`), Buffer.from(img.data, 'base64'));
}
say('previewed slides 1, 4 and 6 as PNG images');

// 5. Export both ways and fetch the files with the same token.
const get = async (url) => Buffer.from(await (await fetch(url, { headers: { authorization: `Bearer ${tok.access_token}` } })).arrayBuffer());
const pdf = await call('decks_export_pdf', { deck: D });
const pdfBuf = await get(pdf.file.url);
fs.writeFileSync(path.join(OUT, 'deck.pdf'), pdfBuf);
const pages = (pdfBuf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
say(`PDF: ${pdfBuf.length} bytes, ${pages} pages, starts with ${pdfBuf.subarray(0, 5).toString()}`);
if (!pdfBuf.subarray(0, 5).toString().startsWith('%PDF') || pages !== 10) throw new Error('PDF is not right');
const pptx = await call('decks_export_pptx', { deck: D });
const pptxBuf = await get(pptx.file.url);
fs.writeFileSync(path.join(OUT, 'deck.pptx'), pptxBuf);
say(`PPTX: ${pptxBuf.length} bytes, ${pptx.slides} slides`);

// 6. Open the PowerPoint file with python-pptx.
const py = process.env.PYTHON || 'python3';
try {
  const out = execFileSync(py, ['-I', '-c', `
import sys
from pptx import Presentation
from pptx.util import Emu
p = Presentation(sys.argv[1])
kinds = {}
for s in p.slides:
    for sh in s.shapes:
        k = 'chart' if sh.has_chart else 'table' if sh.has_table else 'picture' if sh.shape_type == 13 else 'text' if sh.has_text_frame and sh.text_frame.text.strip() else 'shape'
        kinds[k] = kinds.get(k, 0) + 1
notes = sum(1 for s in p.slides if s.has_notes_slide and s.notes_slide.notes_text_frame.text.strip())
print(f"slides={len(p.slides)} size={Emu(p.slide_width).inches:.2f}x{Emu(p.slide_height).inches:.3f}in notes={notes} " + " ".join(f"{k}={v}" for k, v in sorted(kinds.items())))
`, path.join(OUT, 'deck.pptx')], { encoding: 'utf8' }).trim();
  say(`python-pptx opened it: ${out}`);
  if (!/slides=10/.test(out)) throw new Error('python-pptx did not see 10 slides');
} catch (e) {
  if (e.code === 'ENOENT' || /No module named 'pptx'/.test(String(e.stderr ?? e.message))) say('python-pptx is not installed here (set PYTHON to a Python that has it); skipped opening the file');
  else throw e;
}
say(`done: ${calls} MCP tool calls, nothing done outside MCP after sign-in`);
fs.writeFileSync(path.join(OUT, 'log.txt'), `${log.join('\n')}\n`);
await client.close();
const { closeBrowser } = await import('../lib/export-pdf.mjs');
await closeBrowser();
server.closeAllConnections?.();
server.close();
await app.close();
process.exit(0);
