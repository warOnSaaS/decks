// PowerPoint import, best effort. What comes across: slide titles and subtitles, text and bullet points,
// pictures (PNG, JPEG, GIF), tables, bar, column, line, area, pie and doughnut charts (from the numbers
// saved in the file), speaker notes, and the theme's accent colour. Each slide gets the closest layout.
// What does not is listed, slide by slide, in the report: exact positions and sizes, animations and
// transitions, drawn shapes and SmartArt, video and audio, other chart kinds and picture formats, and
// the file's own fonts and colours (the deck uses a Decks theme instead).
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { DeckError } from './decks.mjs';

const ARR = new Set(['p:sp', 'p:pic', 'p:graphicFrame', 'p:grpSp', 'a:p', 'a:r', 'a:fld', 'a:br', 'a:tr', 'a:tc', 'c:ser', 'c:pt', 'Relationship', 'p:sldId', 'p:cxnSp']);
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', removeNSPrefix: false, isArray: (name) => ARR.has(name), trimValues: false });
const MAX_SLIDES = 120;

export async function importPptx(app, me, buf, { name = 'Imported deck' } = {}) {
  let zip;
  try { zip = await JSZip.loadAsync(buf); } catch { throw new DeckError('That file is not a PowerPoint (.pptx) file.'); }
  const read = async (p) => { const f = zip.file(p); return f ? parser.parse(await f.async('string')) : null; };
  const pres = await read('ppt/presentation.xml');
  if (!pres) throw new DeckError('That file has no slides we can read. Is it a .pptx file (not .ppt or .key)?');
  const presRels = rels(await read('ppt/_rels/presentation.xml.rels'));
  const size = pres['p:presentation']['p:sldSz'] ?? {};
  const W = Number(size['@cx'] ?? 12192000), H = Number(size['@cy'] ?? 6858000);
  const ids = pres['p:presentation']['p:sldIdLst']?.['p:sldId'] ?? [];
  const missing = new Map();
  const miss = (what, n) => missing.set(what, (missing.get(what) ?? new Set()).add(n));
  const got = { titles: 0, text: 0, images: 0, tables: 0, charts: 0, notes: 0 };
  const slides = [];
  const media = new Map();

  for (const [k, sid] of ids.slice(0, MAX_SLIDES).entries()) {
    const n = k + 1;
    const target = presRels[sid['@r:id']];
    if (!target) continue;
    const path = `ppt/${target.replace(/^\/?ppt\//, '')}`;
    const xml = await read(path);
    if (!xml) continue;
    const srels = rels(await read(path.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels')));
    const sld = xml['p:sld'];
    if (sld['p:transition']) miss('Slide transitions', n);
    if (sld['p:timing']) miss('Animations', n);
    const shapes = collect(sld['p:cSld']?.['p:spTree'], () => miss('Grouped shapes (taken apart)', n));
    let title = '', subtitle = '', kicker = '';
    const texts = [], pics = [], blocks = [];
    for (const sh of shapes) {
      if (sh.kind === 'sp') {
        const ph = sh.node['p:nvSpPr']?.['p:nvPr']?.['p:ph'];
        const type = ph?.['@type'];
        // Shapes named by Decks' own export (Title, Subtitle, Kicker) go back where they came from.
        const named = String(sh.node['p:nvSpPr']?.['p:cNvPr']?.['@name'] ?? '');
        const paras = paragraphs(sh.node['p:txBody']);
        if (['Footer', 'Slide number', 'Quote mark'].includes(named)) continue;
        if (named === 'Kicker' && paras.length) { kicker = paras.map((p) => p.text).join(' '); continue; }
        if (named === 'Title' && paras.length && !title) { title = paras.map((p) => p.text).join(' '); got.titles++; continue; }
        if (named === 'Subtitle' && paras.length && !subtitle) { subtitle = paras.map((p) => p.text).join(' '); continue; }
        if (!paras.length) { if (!ph) miss('Drawn shapes and lines', n); continue; }
        if (['title', 'ctrTitle'].includes(type) && !title) { title = paras.map((p) => p.text).join(' '); got.titles++; continue; }
        if (type === 'subTitle' && !subtitle) { subtitle = paras.map((p) => p.text).join(' '); continue; }
        if (['dt', 'ftr', 'sldNum'].includes(type)) continue;
        texts.push({ ...sh.box, paras });
      } else if (sh.kind === 'pic') {
        const rid = sh.node['p:blipFill']?.['a:blip']?.['@r:embed'];
        if (sh.node['p:nvPicPr']?.['p:nvPr']?.['a:videoFile'] || sh.node['p:nvPicPr']?.['p:nvPr']?.['a:audioFile']) { miss('Video and audio', n); continue; }
        const file = rid && srels[rid] ? resolve(path, srels[rid]) : null;
        const url = file ? await mediaUrl(app, me, zip, file, media) : null;
        if (!url) { miss('Pictures in formats other than PNG, JPEG or GIF', n); continue; }
        pics.push({ ...sh.box, url, alt: sh.node['p:nvPicPr']?.['p:cNvPr']?.['@descr'] ?? '' });
        got.images++;
      } else if (sh.kind === 'frame') {
        const g = sh.node['a:graphic']?.['a:graphicData'];
        if (g?.['a:tbl']) {
          const rows = (g['a:tbl']['a:tr'] ?? []).map((tr) => (tr['a:tc'] ?? []).map((tc) => paragraphs(tc['a:txBody']).map((p) => p.text).join(' ')));
          if (rows.length) { blocks.push({ ...sh.box, block: { t: 'table', head: rows[0], rows: rows.slice(1, 14) } }); got.tables++; }
          if (rows.length > 14) miss('Table rows past the thirteenth', n);
        } else if (g?.['c:chart']) {
          const file = resolve(path, srels[g['c:chart']['@r:id']] ?? '');
          const ch = await chart(await read(file));
          if (ch) { blocks.push({ ...sh.box, block: ch }); got.charts++; } else miss('Charts of other kinds', n);
        } else if (String(g?.['@uri'] ?? '').includes('diagram')) miss('SmartArt', n);
        else miss('Embedded objects', n);
      }
    }
    if (shapes.some((s) => s.kind === 'cxn')) miss('Drawn shapes and lines', n);

    // Text boxes become blocks: several short paragraphs read as bullets, otherwise as text.
    texts.sort((a, b) => a.y - b.y || a.x - b.x);
    if (!title && texts.length && texts[0].paras.length === 1 && texts[0].paras[0].text.length < 90) { title = texts.shift().paras[0].text; got.titles++; }
    for (const t of texts) {
      const lines = t.paras.map((p) => p.text).filter(Boolean);
      const bulleted = t.paras.some((p) => p.bullet) || (lines.length > 1 && lines.every((l) => l.length < 140));
      blocks.push({ ...t, block: bulleted && lines.length > 1 ? { t: 'bullets', items: lines.slice(0, 30), ...(t.paras.some((p) => p.numbered) ? { numbered: true } : {}) } : { t: 'text', text: lines.join('\n\n') } });
      got.text++;
    }

    // The closest layout.
    const big = pics.find((p) => p.w * p.h > W * H * 0.3);
    let layout = 'content', image = null;
    if (big) {
      image = { url: big.url, alt: big.alt };
      const cx = big.x + big.w / 2;
      layout = big.w * big.h > W * H * 0.8 ? 'full_image' : cx < W / 2 ? 'image_left' : 'image_right';
    }
    for (const p of pics.filter((p) => p !== big)) blocks.push({ ...p, block: { t: 'image', url: p.url, alt: p.alt, fit: 'contain' } });
    blocks.sort((a, b) => a.y - b.y || a.x - b.x);
    if (!big) {
      const cols = blocks.length >= 2 && blocks.every((b) => b.w < W * 0.55) && blocks.some((b) => b.x + b.w / 2 < W / 2) && blocks.some((b) => b.x + b.w / 2 > W / 2);
      if (cols) { layout = 'two_column'; for (const b of blocks) b.block.slot = b.x + b.w / 2 < W / 2 ? 'left' : 'right'; }
      else if (!blocks.length && (title || subtitle)) layout = n === 1 ? 'title' : subtitle ? 'title' : 'section';
      else if (n === 1 && subtitle && blocks.length <= 1) layout = 'title';
    }
    if (layout === 'full_image' && blocks.length) miss('Words over full-slide pictures (kept as a title)', n);
    if (blocks.length > 12) miss('Blocks past the twelfth on a slide', n);
    if (shapes.length) miss('Exact positions and sizes', n);

    // Speaker notes.
    let notes = '';
    const notesRel = Object.values(srels).find((t) => /notesSlide/.test(t));
    if (notesRel) {
      const nx = await read(resolve(path, notesRel));
      const sps = collect(nx?.['p:notes']?.['p:cSld']?.['p:spTree'], () => {});
      notes = sps.filter((s) => s.kind === 'sp' && s.node['p:nvSpPr']?.['p:nvPr']?.['p:ph']?.['@type'] === 'body').map((s) => paragraphs(s.node['p:txBody']).map((p) => p.text).join('\n')).join('\n').trim();
      if (notes) got.notes++;
    }
    slides.push({ layout, kicker: kicker.slice(0, 200), title: title.slice(0, 600), subtitle: subtitle.slice(0, 600), image, notes, blocks: blocks.slice(0, 12).map((b) => b.block) });
  }
  if (ids.length > MAX_SLIDES) miss(`Slides past the ${MAX_SLIDES}th`, MAX_SLIDES + 1);
  if (!slides.length) throw new DeckError('We could not find any slides in that file.');

  // The theme's accent colour carries over as the brand accent.
  const theme = await read('ppt/theme/theme1.xml');
  const accent = theme?.['a:theme']?.['a:themeElements']?.['a:clrScheme']?.['a:accent1']?.['a:srgbClr']?.['@val'];
  const core = await read('docProps/core.xml');
  const docTitle = core?.['cp:coreProperties']?.['dc:title'];
  const title = (typeof docTitle === 'string' && docTitle.trim()) || slides[0].title || name.replace(/\.pptx$/i, '');

  const carried = [
    `${slides.length} slides`,
    got.titles && `${got.titles} titles`, got.text && `${got.text} text boxes, as text or bullets`, got.images && `${got.images} pictures`,
    got.tables && `${got.tables} tables`, got.charts && `${got.charts} charts, from the numbers in the file`, got.notes && `speaker notes on ${got.notes} slides`,
    accent && `the accent colour #${accent}`,
  ].filter(Boolean);
  const listSlides = (s) => { const a = [...s].sort((x, y) => x - y); return a.length > 6 ? `${a.length} slides` : `slide${a.length > 1 ? 's' : ''} ${a.join(', ')}`; };
  const not_carried = [...missing.entries()].map(([what, s]) => `${what} (${listSlides(s)})`);
  not_carried.push('The file\'s own fonts, colours and backgrounds: the deck uses a Decks theme instead');
  return {
    deck: { title: String(title).slice(0, 200), description: `Imported from ${name}`, theme: { preset: 'clean' }, brand: accent && /^[0-9a-f]{6}$/i.test(accent) ? { accent: `#${accent}` } : {}, slides },
    report: { slides: slides.length, carried, not_carried },
  };
}

function rels(x) {
  const out = {};
  for (const r of x?.Relationships?.Relationship ?? []) out[r['@Id']] = r['@Target'];
  return out;
}

function resolve(from, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = from.split('/').slice(0, -1);
  for (const p of target.split('/')) { if (p === '..') parts.pop(); else if (p !== '.') parts.push(p); }
  return parts.join('/');
}

// Every shape on a slide, groups flattened, with its box in the slide's own units.
function collect(tree, onGroup, out = []) {
  if (!tree) return out;
  const box = (node, key) => {
    const x = node[key]?.['a:xfrm'] ?? node['p:xfrm'] ?? {};
    return { x: Number(x['a:off']?.['@x'] ?? 0), y: Number(x['a:off']?.['@y'] ?? 0), w: Number(x['a:ext']?.['@cx'] ?? 0), h: Number(x['a:ext']?.['@cy'] ?? 0) };
  };
  for (const n of tree['p:sp'] ?? []) out.push({ kind: 'sp', node: n, box: box(n, 'p:spPr') });
  for (const n of tree['p:pic'] ?? []) out.push({ kind: 'pic', node: n, box: box(n, 'p:spPr') });
  for (const n of tree['p:graphicFrame'] ?? []) out.push({ kind: 'frame', node: n, box: box(n, 'p:xfrm') });
  for (const n of tree['p:cxnSp'] ?? []) out.push({ kind: 'cxn', node: n, box: box(n, 'p:spPr') });
  for (const g of tree['p:grpSp'] ?? []) { onGroup(); collect(g, onGroup, out); }
  return out.map((s) => ({ ...s, ...s.box }));
}

function paragraphs(body) {
  const out = [];
  for (const p of body?.['a:p'] ?? []) {
    const runs = [...(p['a:r'] ?? []), ...(p['a:fld'] ?? [])].map((r) => (typeof r['a:t'] === 'object' ? r['a:t']['#text'] ?? '' : r['a:t'] ?? '')).join('');
    const text = String(runs).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const pPr = p['a:pPr'] ?? {};
    out.push({ text, bullet: !!(pPr['a:buChar'] || pPr['a:buAutoNum'] || Number(pPr['@lvl'] ?? 0) > 0), numbered: !!pPr['a:buAutoNum'] });
  }
  return out;
}

async function mediaUrl(app, me, zip, file, cache) {
  if (cache.has(file)) return cache.get(file);
  const ext = file.split('.').pop().toLowerCase();
  const type = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif' }[ext];
  const f = zip.file(file);
  let url = null;
  if (type && f) {
    const data = Buffer.from(await f.async('uint8array'));
    if (data.length <= app.files.max) url = (await app.files.put(me, { name: file.split('/').pop(), type, data })).url;
  }
  cache.set(file, url);
  return url;
}

const KINDS = { 'c:barChart': 'bar', 'c:bar3DChart': 'bar', 'c:lineChart': 'line', 'c:line3DChart': 'line', 'c:areaChart': 'area', 'c:pieChart': 'donut', 'c:doughnutChart': 'donut', 'c:pie3DChart': 'donut' };
async function chart(x) {
  const plot = x?.['c:chartSpace']?.['c:chart']?.['c:plotArea'];
  if (!plot) return null;
  const key = Object.keys(KINDS).find((k) => plot[k]);
  if (!key) return null;
  const node = plot[key];
  let kind = KINDS[key];
  if (kind === 'bar') kind = node['c:barDir']?.['@val'] === 'bar' ? 'bar' : 'column';
  const pts = (cache) => (cache?.['c:pt'] ?? []).sort((a, b) => Number(a['@idx']) - Number(b['@idx'])).map((p) => (typeof p['c:v'] === 'object' ? p['c:v']['#text'] : p['c:v']));
  const series = (node['c:ser'] ?? []).map((s, i) => ({
    name: String(pts(s['c:tx']?.['c:strRef']?.['c:strCache'])[0] ?? s['c:tx']?.['c:v'] ?? `Series ${i + 1}`),
    labels: pts(s['c:cat']?.['c:strRef']?.['c:strCache'] ?? s['c:cat']?.['c:numRef']?.['c:numCache'] ?? s['c:cat']?.['c:strLit']),
    values: pts(s['c:val']?.['c:numRef']?.['c:numCache'] ?? s['c:val']?.['c:numLit']).map(Number),
  })).filter((s) => s.values.length);
  if (!series.length) return null;
  const title = x['c:chartSpace']['c:chart']['c:title']?.['c:tx']?.['c:rich']?.['a:p']?.map?.((p) => (p['a:r'] ?? []).map((r) => r['a:t']).join('')).join(' ');
  return { t: 'chart', kind, labels: series[0].labels.map(String).slice(0, 24), series: series.slice(0, 6).map((s) => ({ name: s.name, values: s.values.slice(0, 24) })), ...(title ? { title: String(title).slice(0, 120) } : {}) };
}
