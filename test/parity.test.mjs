import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

// Agent parity (ROADMAP 3.2), enforced:
// 1. Screen-to-tool: open every screen, panel and dialog, at desk and phone width, and collect every
//    button, link, menu item, form, field, file picker and editable text. Each must name a tool from the
//    catalogue (data-tool), be the submit button or a field of a form that does, or say data-tool="none"
//    with the reason in data-why when it only moves around, opens, closes or copies.
// 2. No side doors: screen code only talks to /api/tools/*, /files/decks (upload streams) and /ws.
// 3. A parity report: actions per screen, the tools the screens use, and tools with no screen.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decks-parity-'));
Object.assign(process.env, { SQLITE_FILE: path.join(dir, 'd.db'), FILES_DIR: path.join(dir, 'files'), OAUTH_SECRET: 'parity', DECKS_EXAMPLES: '1', AUTH_PROVIDER: 'local' });
delete process.env.DATABASE_URL;
delete process.env.WOS_ACCOUNT_CLIENT_ID;

let server, app, base, browser, catalogue, sam, token;
before(async () => {
  const mod = await import('../server.mjs');
  catalogue = new Set(mod.catalogue().map((t) => t.name));
  server = mod.createServer();
  await new Promise((r) => server.listen(0, r));
  app = await server.ready;
  base = `http://localhost:${server.address().port}`;
  sam = await app.decks.addPerson(app.teamId, { name: 'Sam Rivera', email: 'sam@acme-dental.example', role: 'owner' });
  await app.decks.addPerson(app.teamId, { name: 'Jordan Lee', email: 'jordan@acme-dental.example', role: 'member' });
  token = (await import('../lib/auth.mjs')).issueTokens(sam).access_token;
  browser = await chromium.launch({ args: ['--mute-audio'] });
});
after(async () => { await browser?.close(); (await import('../lib/export-pdf.mjs')).closeBrowser(); server?.closeAllConnections?.(); server?.close(); await app?.close(); });

const collect = (page) => page.evaluate(() => {
  const out = [];
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) || el.type === 'file';
  for (const el of document.querySelectorAll('button, a[href], [role=menuitem], [role=option], form, input, select, textarea, [contenteditable]')) {
    if (el.tagName !== 'FORM' && !visible(el)) continue;
    if (el.closest('[data-auth]') || el.closest('.pub-top, .pub-foot, .view-foot, .pub-main, .gate-card')) continue; // public pages: plain links
    if (el.type === 'hidden') continue;
    const form = el.closest('form');
    let tool = el.getAttribute('data-tool');
    let how = tool ? 'tool' : null;
    if (tool === 'none') { how = el.getAttribute('data-why') ? `page helper: ${el.getAttribute('data-why')}` : null; tool = null; }
    if (!how && el.tagName === 'BUTTON' && el.type === 'submit' && form?.dataset.tool) { tool = form.dataset.tool; how = 'submit'; }
    if (!how && /^(SELECT|INPUT|TEXTAREA)$/.test(el.tagName) && form?.dataset.tool) { tool = form.dataset.tool; how = 'form field'; }
    if (!how && el.closest('label[data-tool]') && el.type === 'file') { tool = el.closest('label').dataset.tool; how = 'file picker'; }
    if (!how && el.tagName === 'A' && el.closest('.dk-slide')) continue;
    out.push({ tag: el.tagName.toLowerCase(), text: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().slice(0, 50), tool, how });
  }
  return out;
});

test('every action on every screen has a tool, at desk and phone width', async () => {
  const report = { screens: {}, toolsOnScreens: new Set(), problems: [] };
  const deck = await app.run(sam, 'decks.create_deck', { title: 'Parity deck', from_example: 'Acme Dental: investor update' });
  await app.run(sam, 'decks.add_comment', { deck: deck.id, slide: 3, body: 'A comment' });
  await app.run(sam, 'decks.link_record', { deck: deck.id, record: 'd_acme01', label: 'Acme expansion', url: 'https://crm.example/d_acme01' });
  const emb = await app.run(sam, 'decks.share_deck', { deck: deck.id, kind: 'embed' });
  const view = await app.run(sam, 'decks.share_deck', { deck: deck.id, kind: 'view' });
  for (const [w, h, tag] of [[1440, 900, 'desk'], [390, 844, 'phone']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: tag === 'phone', isMobile: tag === 'phone' });
    await ctx.addCookies([{ name: 'decks_session', value: token, url: base }]);
    const page = await ctx.newPage();
    page.on('dialog', (d) => d.dismiss());
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Something waiting for a yes, asked by an app over the API.
    await fetch(`${base}/api/tools/decks.delete_deck`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ deck: 'Parity deck' }) });
    const check = async (name) => {
      await page.waitForTimeout(250);
      const found = await collect(page);
      report.screens[`${tag} ${name}`] = found.length;
      for (const f of found) {
        if (f.tool) report.toolsOnScreens.add(f.tool);
        if (!f.how) report.problems.push(`${tag} ${name}: <${f.tag}> "${f.text}" names no tool`);
        else if (f.tool && !catalogue.has(f.tool)) report.problems.push(`${tag} ${name}: <${f.tag}> "${f.text}" names ${f.tool}, which is not in the catalogue`);
      }
    };
    const go = async (hash, wait) => { await page.goto(`${base}/app${hash}`); await page.waitForSelector(wait); };
    const sheet = async () => { if (tag === 'phone' && !(await page.locator('#ed-panel.is-open').count())) await page.click('[data-open=sheet]'); };
    const unsheet = async () => { if (tag === 'phone' && (await page.locator('#ed-panel.is-open').count())) { await page.click('[data-open=sheet]'); await page.waitForTimeout(400); } };
    const close = async () => { await page.keyboard.press('Escape'); await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close())); };

    await go('#/', '.dl-card'); await check('decks');
    await page.click('[data-open=new]'); await check('new deck dialog'); await close();
    await page.setInputFiles('#imp', fileURLToPathSafe('fixtures/sample.pptx'));
    await page.waitForSelector('dialog[open] .dlg-miss', { timeout: 60000 }); await check('import report'); await close();
    await go(`#/d/${deck.id}`, '.ed-thumb'); await check('editor slide panel');
    for (const n of [1, 3, 4, 5, 6, 7, 8, 11]) {
      await unsheet();
      await page.click(`.ed-thumb:nth-child(${n}) .ed-thumb-b`);
      await page.waitForTimeout(150);
      await check(`editor slide ${n}`);
      for (let b = 0; b < 3; b++) {
        const blocks = page.locator('#ed-canvas .dk-block');
        if ((await blocks.count()) <= b) break;
        await unsheet();
        await blocks.nth(b).click({ position: { x: 4, y: 4 } });
        await sheet();
        await check(`editor slide ${n} block ${b + 1}`);
      }
    }
    await sheet(); await page.click('.ed-tabs [data-tab=theme]'); await check('editor theme');
    await page.click('.ed-tabs [data-tab=comments]'); await check('editor comments');
    await page.click('[data-call=all]'); await check('editor all comments');
    await page.click('.ed-tabs [data-tab=share]'); await page.waitForSelector('.ed-copy'); await check('editor share');
    await page.click('[data-activity]'); await page.waitForSelector('.ed-act'); await check('editor activity');
    await page.click('.ed-tabs [data-tab=slide]');
    if (tag === 'desk') {
      await page.click('[data-open=keys]'); await check('keys dialog'); await close();
      await page.click('#ed-canvas', { position: { x: 2, y: 2 } }).catch(() => {});
      await page.keyboard.press('Escape');
      await page.keyboard.press('ControlOrMeta+k'); await page.waitForSelector('.pal-i'); await check('action palette'); await close();
    }
    await go(`#/d/${deck.id}/present?at=2`, '.pr-stage .dk-box'); await check('present');
    await go(`#/d/${deck.id}/presenter?at=2`, '#pv-now .dk-box'); await check('presenter view');
    await go('#/settings', '.st-sect'); await check('settings');
    await go('#/connect', '.cx-tile'); await check('connect your AI');
    // Public pages: they only show, so every control is a page helper.
    await page.goto(base + new URL(view.url, base).pathname); await page.waitForSelector('.dk-box'); await check('share link');
    await page.click('[data-present]'); await check('share link presenting'); await close();
    await page.goto(base + new URL(emb.url, base).pathname); await page.waitForSelector('.dk-box'); await check('embed');
    assert.deepEqual(errors, [], `${tag}: no script errors`);
    await ctx.close();
  }
  const used = [...report.toolsOnScreens].sort();
  const unused = [...catalogue].filter((t) => !report.toolsOnScreens.has(t)).sort();
  const actions = Object.values(report.screens).reduce((a, b) => a + b, 0);
  const summary = { screens: report.screens, actions, covered: actions - report.problems.length, parity: `${Math.round(((actions - report.problems.length) / actions) * 100)}%`, tools_on_screens: used, tools_without_a_screen: unused, problems: report.problems };
  fs.mkdirSync('.shots', { recursive: true });
  fs.writeFileSync('.shots/parity-report.json', JSON.stringify(summary, null, 2));
  console.log(`parity ${summary.parity}: ${actions} screen actions on ${Object.keys(report.screens).length} screens, ${used.length} tools used by screens, ${unused.length} tools with no screen (${unused.join(', ')})`);
  assert.deepEqual(report.problems, []);
});

function fileURLToPathSafe(rel) { return new URL(rel, import.meta.url).pathname; }

test('no side doors: screen code only calls tools, file uploads and the live socket', () => {
  for (const f of ['src/client/app.mjs', 'src/client/editor.mjs', 'src/client/present.mjs', 'src/client/sync.mjs', 'src/client/util.mjs', 'src/client/page.mjs', 'src/client/screens-entry.mjs']) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bfetch\(\s*(`[^`]*`|'[^']*'|"[^"]*")/g)) {
      const target = m[1].slice(1, -1);
      assert.ok(/^\/api\/tools\/|^\/files\/decks(\?|\/|$)/.test(target), `${f}: fetch(${m[1]}) is a side door`);
      if (!/page\.mjs|screens-entry/.test(f)) assert.ok(!/^\/api\/tools\//.test(target), `${f}: screens call tools only through ctx.callTool`);
    }
    assert.ok(!/\bfetch\(\s*[a-zA-Z_$]/.test(src), `${f}: fetch with a computed address`);
    assert.ok(!/XMLHttpRequest|sendBeacon|EventSource/.test(src), `${f}: another way to the server`);
    for (const m of src.matchAll(/new WebSocket\(([^)]*)\)/g)) assert.match(m[1], /\/ws\?deck=/, `${f}: a socket to somewhere other than /ws`);
  }
});
