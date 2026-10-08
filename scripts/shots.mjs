// Screenshots of every screen at 1440 and 390 wide, light and dark where the screen has both, into
// .shots/ (git-ignored). Runs its own server on a fresh SQLite database with the example decks.
//   node scripts/shots.mjs            all of them
//   node scripts/shots.mjs editor     only names containing "editor"
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const only = process.argv[2] ?? '';
const OUT = path.resolve('.shots');
fs.mkdirSync(OUT, { recursive: true });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decks-shots-'));
Object.assign(process.env, { SQLITE_FILE: path.join(dir, 'd.db'), FILES_DIR: path.join(dir, 'files'), OAUTH_SECRET: 'shots', DECKS_EXAMPLES: '1', AUTH_PROVIDER: 'local' });
delete process.env.DATABASE_URL;
const { createServer } = await import('../server.mjs');
const { issueTokens } = await import('../lib/auth.mjs');
const server = createServer();
await new Promise((r) => server.listen(0, r));
const app = await server.ready;
const base = `http://localhost:${server.address().port}`;
const sam = await app.decks.addPerson(app.teamId, { name: 'Sam Rivera', email: 'sam@acme-dental.example', role: 'owner' });
for (const t of ['Acme Dental: investor update', 'Birch Law: client pitch', 'Relay: product launch']) await app.run(sam, 'decks.create_deck', { title: t, from_example: t });
const decks = (await app.run(sam, 'decks.list_decks', {})).decks;
const acme = decks.find((d) => d.title.startsWith('Acme')).id;
await app.run(sam, 'decks.add_comment', { deck: acme, slide: 3, body: 'Can we show missed calls as a before and after?' });
const share = await app.run(sam, 'decks.share_deck', { deck: acme, kind: 'embed' });
const cookie = { name: 'decks_session', value: issueTokens(sam).access_token, url: base };

const browser = await chromium.launch({ args: ['--mute-audio'] });
const shots = [];
async function shot(name, url, { w, mode = 'light', signed = true, full = false, before } = {}) {
  if (only && !name.includes(only)) return;
  const ctx = await browser.newContext({ viewport: { width: w, height: w > 600 ? 900 : 844 }, colorScheme: mode, deviceScaleFactor: w > 600 ? 1 : 2, isMobile: w < 600, hasTouch: w < 600 });
  if (signed) await ctx.addCookies([cookie]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}${url}`, { waitUntil: 'networkidle' });
  if (before) await before(page);
  await page.waitForTimeout(400);
  const file = path.join(OUT, `${name}-${w}${mode === 'dark' ? '-dark' : ''}.png`);
  await page.screenshot({ path: file, fullPage: full });
  shots.push(file);
  if (errors.length) console.log(`${name} ${w}: page errors: ${errors.join('; ')}`);
  await ctx.close();
}

for (const w of [1440, 390]) {
  for (const mode of ['light', 'dark']) {
    await shot('home', '/', { w, mode, signed: false, full: true });
    await shot('decks', '/app#/', { w, mode, before: (p) => p.waitForSelector('.dl-card') });
    await shot('editor', `/app#/d/${acme}?slide=4`, { w, mode, before: (p) => p.waitForSelector('.ed-thumb') });
  }
  await shot('example', '/examples/relay-product-launch', { w, signed: false });
  await shot('connect', '/connect', { w, signed: false, full: true });
  await shot('login', '/login', { w, signed: false });
  await shot('editor-block', `/app#/d/${acme}?slide=3`, { w, before: async (p) => { await p.waitForSelector('.ed-thumb'); if (w < 600) await p.click('[data-open=sheet]'); await p.click('#ed-canvas .dk-b-stats'); } });
  await shot('editor-theme', `/app#/d/${acme}`, { w, before: async (p) => { await p.waitForSelector('.ed-thumb'); if (w < 600) await p.click('[data-open=sheet]'); await p.click('.ed-tabs [data-tab=theme]'); } });
  await shot('editor-comments', `/app#/d/${acme}?slide=3`, { w, before: async (p) => { await p.waitForSelector('.ed-thumb'); if (w < 600) await p.click('[data-open=sheet]'); await p.click('.ed-tabs [data-tab=comments]'); await p.waitForTimeout(300); } });
  await shot('editor-share', `/app#/d/${acme}`, { w, before: async (p) => { await p.waitForSelector('.ed-thumb'); if (w < 600) await p.click('[data-open=sheet]'); await p.click('.ed-tabs [data-tab=share]'); await p.waitForTimeout(500); } });
  await shot('palette', `/app#/d/${acme}`, { w, before: async (p) => { await p.waitForSelector('.ed-thumb'); await p.keyboard.press('Control+k'); await p.keyboard.press('Meta+k'); await p.keyboard.type('chart'); } });
  await shot('present', `/app#/d/${acme}/present?at=3`, { w, before: (p) => p.waitForSelector('.pr-stage .dk-box') });
  await shot('presenter', `/app#/d/${acme}/presenter?at=4`, { w, before: (p) => p.waitForSelector('#pv-now .dk-box') });
  await shot('settings', '/app#/settings', { w, full: true, before: (p) => p.waitForSelector('.st-sect') });
  await shot('app-connect', '/app#/connect', { w, before: (p) => p.waitForSelector('.cx-tile') });
  await shot('new-deck', '/app#/', { w, before: async (p) => { await p.waitForSelector('.dl-card'); await p.click('[data-open=new]'); } });
  await shot('embed', share.url.replace(/^https?:\/\/[^/]+/, ''), { w: w === 1440 ? 960 : 390, signed: false });
}
console.log(`${shots.length} screenshots in .shots/`);
await browser.close();
const { closeBrowser } = await import('../lib/export-pdf.mjs');
await closeBrowser();
server.closeAllConnections?.();
server.close();
await app.close();
process.exit(0);
