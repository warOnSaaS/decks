// PDF export and slide pictures, drawn by a headless Chromium through Playwright from the same HTML
// as present mode. The page never leaves the server: its styles, fonts and uploaded images are served
// from here through request interception; images on other sites load as usual.
// Chromium comes from @sparticuz/chromium on serverless hosts (Vercel), from CHROMIUM_PATH when set,
// and otherwise from Playwright's own download (npx playwright-core install chromium).
import fs from 'node:fs';
import path from 'node:path';
import { printPage } from './pages.mjs';
import { VERSION } from './app.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PUBLIC = path.join(ROOT, 'public');
const ORIGIN = 'http://decks.local';
const TYPES = { '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };

let browserP = null;
async function browser() {
  if (browserP) {
    const b = await browserP.catch(() => null);
    if (b?.isConnected()) return b;
  }
  browserP = (async () => {
    const { chromium } = await import('playwright-core');
    if (process.env.CHROMIUM_PATH) return chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox', '--mute-audio'] });
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      const sp = (await import('@sparticuz/chromium')).default;
      return chromium.launch({ executablePath: await sp.executablePath(), args: [...sp.args, '--mute-audio'], headless: true });
    }
    return chromium.launch({ headless: true, args: ['--mute-audio'] });
  })();
  return browserP;
}

async function withPage(app, me, html, { width = 960, height = 540, scale = 1 }, fn) {
  const b = await browser();
  const context = await b.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  try {
    const page = await context.newPage();
    await page.route(`${ORIGIN}/**`, async (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === '/print') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      if (u.pathname.startsWith('/files/decks/')) {
        const id = /f_[\w-]+/.exec(u.pathname)?.[0];
        const row = id ? await app.files.row(id) : null;
        if (!row || (row.team_id !== me.team_id && !Number(row.public))) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ status: 200, contentType: row.type, body: await app.files.read(row) });
      }
      const file = path.join(PUBLIC, path.normalize(u.pathname));
      if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] ?? 'application/octet-stream', body: fs.readFileSync(file) });
    });
    await page.goto(`${ORIGIN}/print`, { waitUntil: 'load', timeout: 45000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 8000); }))));
    });
    return await fn(page);
  } finally {
    await context.close().catch(() => {});
  }
}

export async function exportPdf(app, me, deck, { notes = false } = {}) {
  const slides = deck.slides.filter((s) => !s.hidden);
  if (!slides.length) throw Object.assign(new Error('The deck has no slides to export.'), { status: 400 });
  const html = printPage({ deck, version: VERSION, slides, notes });
  const pdf = await withPage(app, me, html, {}, (page) => page.pdf({ width: '960px', height: '540px', printBackground: true, pageRanges: '', margin: { top: 0, right: 0, bottom: 0, left: 0 } }));
  return { pdf, pages: slides.length * (notes ? 2 : 1) };
}

export async function previewPng(app, me, deck, index) {
  const slide = deck.slides[index];
  const html = printPage({ deck, version: VERSION, slides: [slide] }).replace('<body class="print">', `<body class="print" data-number="${index + 1}">`);
  return withPage(app, me, html, { scale: 1.5 }, (page) => page.locator('.dk-slide').first().screenshot({ type: 'png' }));
}

export async function closeBrowser() {
  const b = await browserP?.catch(() => null);
  browserP = null;
  await b?.close().catch(() => {});
}
