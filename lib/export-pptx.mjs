// PowerPoint export with PptxGenJS (MIT). Slides become real, editable PowerPoint objects: text boxes,
// bullet lists, native tables and native charts, shapes for cards and stats, images, and speaker notes.
// Geometry follows the same 960 by 540 slide as the HTML (PowerPoint's 16:9 is 10 by 5.625 inches).
import fs from 'node:fs';
import path from 'node:path';
import PptxGenJS from 'pptxgenjs';
import { palette, faces } from './shared/themes.mjs';
import { LAYOUTS } from './shared/layouts.mjs';
import { fmt } from './shared/chart.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const IN = (px) => px / 96;
const PT = (px) => Math.round(px * 0.75 * 10) / 10;

export async function exportPptx(app, me, deck) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = deck.title;
  pptx.author = me.name;
  pptx.company = deck.brand?.footer ?? '';
  const notes = new Set();
  const imgCache = new Map();
  const image = async (url) => {
    if (!url) return null;
    if (!imgCache.has(url)) imgCache.set(url, loadImage(app, me, url).catch(() => null));
    const r = await imgCache.get(url);
    if (!r) notes.add('An image could not be fetched and was left out.');
    return r;
  };
  const F = faces(deck.theme, deck.brand);
  const slides = deck.slides.filter((s) => !s.hidden);
  for (const [i, s] of slides.entries()) {
    const bg = s.bg && s.bg !== 'default' ? s.bg : s.layout === 'section' ? 'accent' : 'default';
    const theme = bg === 'inverse' ? { ...deck.theme, mode: deck.theme.mode === 'dark' ? 'light' : 'dark' } : deck.theme;
    const P = palette(theme, deck.brand);
    const C = bg === 'accent' ? { ...P, bg: P.accent, ink: P.onAccent, ink2: P.onAccent, ink3: P.onAccent, kick: P.onAccent } : { ...P, kick: P.ink3 };
    if (bg === 'alt') C.bg = P.raised;
    const slide = pptx.addSlide();
    slide.background = { color: C.bg };
    const ctx = { pptx, slide, C, P, F, deck, notes, image, theme };
    await drawSlide(ctx, s, i + 1);
    if (s.notes) slide.addNotes(s.notes);
  }
  if (deck.slides.some((s) => s.hidden)) notes.add('Hidden slides were left out.');
  notes.add('Charts are PowerPoint charts you can edit; fonts fall back to ones PowerPoint has when the theme uses faces it does not.');
  const data = await pptx.write({ outputType: 'nodebuffer' });
  return { data: Buffer.from(data), slides: slides.length, notes: [...notes] };
}

async function drawSlide(ctx, s, n) {
  const { slide, C, F } = ctx;
  const L = LAYOUTS[s.layout] ? s.layout : 'content';
  const text = (t, x, y, w, h, o = {}) => t && slide.addText(t, { x: IN(x), y: IN(y), w: IN(w), h: IN(h), fontFace: F.body, color: C.ink, margin: 0, valign: 'top', fit: 'shrink', ...o });
  const kicker = (x, y, w) => s.kicker && (slide.addShape(ctx.pptx.ShapeType.rect, { x: IN(x), y: IN(y + 7), w: IN(18), h: IN(2), fill: { color: C.kick === C.ink3 ? ctx.P.accent : C.kick }, line: { type: 'none' } }), text(s.kicker.toUpperCase(), x + 28, y, w - 28, 18, { fontSize: 9.5, color: C.kick, charSpacing: 1.5, fontFace: F.body, bold: true }));
  const head = async (x, y, w, { big = false } = {}) => {
    let yy = y;
    if (s.kicker) { kicker(x, yy, w); yy += 30; }
    const tSize = big ? 60 : 38;
    const lines = Math.min(3, Math.ceil((s.title.length * tSize * 0.5) / w) || 1);
    const th = lines * tSize * 1.12;
    if (s.title) { text(s.title, x, yy, w, th, { fontSize: PT(tSize), fontFace: F.head, bold: true, color: C.ink }); yy += th + 10; }
    if (s.subtitle) { const sh = Math.min(3, Math.ceil((s.subtitle.length * (big ? 22 : 19) * 0.5) / w)) * (big ? 22 : 19) * 1.4; text(s.subtitle, x, yy, w, sh, { fontSize: PT(big ? 22 : 19), color: C.ink2 }); yy += sh + 8; }
    return yy;
  };
  const logo = async (x, y, h) => { if (!ctx.deck.brand?.logo) return; const img = await ctx.image(ctx.deck.brand.logo); if (img) slide.addImage({ data: img.data, x: IN(x), y: IN(y), h: IN(h), w: IN(h * (img.w / img.h)) }); };
  const foot = async () => {
    const b = ctx.deck.brand ?? {};
    if (b.logo) await logo(56, 512, 14);
    if (b.footer) text(b.footer, b.logo ? 160 : 56, 513, 600, 14, { fontSize: 8.5, color: C.ink3 });
    text(String(n), 820, 513, 84, 14, { fontSize: 8.5, color: C.ink3, align: 'right' });
  };
  const blocks = (slot) => s.blocks.filter((b) => (b.slot ?? 'main') === slot || (slot === 'main' && !LAYOUTS[L].slots.includes(b.slot ?? 'main')));
  switch (L) {
    case 'title': case 'closing': {
      await logo(72, 46, 34);
      const bh = blocks('main').length ? 90 : 0;
      const y = await head(72, L === 'title' ? 200 - bh : 150, 816, { big: true });
      await stack(ctx, blocks('main'), 72, y + 10, 816, 470 - y);
      if (L === 'title') slide.addShape(ctx.pptx.ShapeType.line, { x: IN(72), y: IN(496), w: IN(816), h: 0, line: { color: C.line, width: 0.75 } });
      break;
    }
    case 'section': await head(72, 180, 816, { big: true }); break;
    case 'big_number': {
      let y = 70;
      if (s.kicker) { kicker(72, y, 816); y += 34; }
      text(s.title, 72, y, 816, 150, { fontSize: PT(140), fontFace: F.head, bold: true, color: ctx.P.accent });
      y += 160;
      if (s.subtitle) { text(s.subtitle, 72, y, 760, 80, { fontSize: PT(26), color: C.ink }); y += 84; }
      await stack(ctx, blocks('main'), 72, y, 816, 486 - y);
      await foot();
      break;
    }
    case 'quote': {
      let y = 80;
      if (s.kicker) { kicker(96, y, 768); y += 40; }
      text('“', 92, y - 10, 80, 80, { fontSize: 110, color: ctx.P.accent, fontFace: F.head });
      text(s.title, 96, y + 62, 768, 220, { fontSize: PT(36), fontFace: F.head, color: C.ink });
      text(s.subtitle, 96, y + 300, 768, 30, { fontSize: PT(17), color: C.ink3 });
      await foot();
      break;
    }
    case 'two_column': {
      const y = await head(56, 46, 848);
      await stack(ctx, blocks('left'), 56, y + 14, 406, 486 - y - 14);
      await stack(ctx, blocks('right'), 498, y + 14, 406, 486 - y - 14);
      await foot();
      break;
    }
    case 'image_left': case 'image_right': {
      const left = L === 'image_left';
      await picture(ctx, s.image, left ? 0 : 538, 0, 422, 540);
      const x = left ? 474 : 52;
      const y = await head(x, 70, 434);
      await stack(ctx, blocks('main'), x, y + 10, 434, 482 - y - 10);
      text(String(n), left ? 820 : 52, 513, 84, 14, { fontSize: 8.5, color: C.ink3, align: left ? 'right' : 'left' });
      break;
    }
    case 'full_image': {
      await picture(ctx, s.image, 0, 0, 960, 540);
      slide.addShape(ctx.pptx.ShapeType.rect, { x: 0, y: IN(250), w: IN(960), h: IN(290), fill: { color: '000000', transparency: 35 }, line: { type: 'none' } });
      const save = ctx.C; ctx.C = { ...C, ink: 'FFFFFF', ink2: 'EEEEEE', ink3: 'DDDDDD', kick: 'FFFFFF' };
      await head(72, 300, 816, { big: true });
      ctx.C = save;
      break;
    }
    case 'blank': await stack(ctx, blocks('main'), 56, 48, 848, 440); await foot(); break;
    default: {
      const y = await head(56, 46, 848);
      await stack(ctx, blocks('main'), 56, y + 14, 848, 486 - y - 14);
      await foot();
    }
  }
}

// Blocks one under another in a box, sharing its height by how much each needs.
const WEIGHT = { chart: 3, image: 3, table: 2.4, cards: 1.8, stats: 1.4, steps: 1.6, timeline: 2.4, bullets: 1.6, text: 1, heading: 0.5, quote: 1.2, checklist: 1.6, callout: 0.7, chat: 2.4, score: 1.8, kv: 1.8, button: 0.5 };
async function stack(ctx, list, x, y, w, h) {
  if (!list.length || h < 30) return;
  const gap = 16;
  const total = list.reduce((a, b) => a + (WEIGHT[b.t] ?? 1), 0);
  const avail = h - gap * (list.length - 1);
  let yy = y;
  for (const b of list) {
    const bh = Math.max(36, (avail * (WEIGHT[b.t] ?? 1)) / total);
    await block(ctx, b, x, yy, w, bh);
    yy += bh + gap;
  }
}

async function block(ctx, b, x, y, w, h) {
  const { slide, C, F, P, pptx } = ctx;
  const S = pptx.ShapeType;
  const T = (t, xx, yy, ww, hh, o = {}) => t != null && t !== '' && slide.addText(String(t), { x: IN(xx), y: IN(yy), w: IN(ww), h: IN(hh), fontFace: F.body, color: C.ink, margin: 0, valign: 'top', fit: 'shrink', ...o });
  const card = (xx, yy, ww, hh, o = {}) => slide.addShape(S.roundRect, { x: IN(xx), y: IN(yy), w: IN(ww), h: IN(hh), rectRadius: 0.08, fill: { color: o.fill ?? P.surface }, line: { color: o.line ?? P.line, width: 0.75 } });
  const runs = (t) => String(t).split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((p) => (p.startsWith('**') ? { text: p.slice(2, -2), options: { bold: true, color: C.ink } } : { text: p }));
  switch (b.t) {
    case 'text': { const size = b.size === 'lg' ? 23 : b.size === 'sm' ? 15 : 18; T(runs(b.text.replace(/\n{2,}/g, '\n')), x, y, w, h, { fontSize: PT(size), color: b.size === 'lg' ? C.ink : C.ink2, lineSpacingMultiple: 1.2 }); break; }
    case 'heading': T(b.text, x, y, w, h, { fontSize: PT(23), bold: true, fontFace: F.head }); break;
    case 'bullets': slide.addText(b.items.map((t) => ({ text: t, options: { bullet: b.numbered ? { type: 'number' } : { code: '25A0' }, paraSpaceAfter: 6 } })), { x: IN(x), y: IN(y), w: IN(w), h: IN(h), fontFace: F.body, fontSize: PT(19), color: C.ink, margin: 0, valign: 'top', fit: 'shrink' }); break;
    case 'quote':
      slide.addShape(S.rect, { x: IN(x), y: IN(y), w: IN(3), h: IN(h), fill: { color: P.accent }, line: { type: 'none' } });
      T(b.text, x + 22, y, w - 22, h - 26, { fontSize: PT(25), fontFace: F.head });
      T(b.by, x + 22, y + h - 20, w - 22, 20, { fontSize: PT(14), color: C.ink3 });
      break;
    case 'stats': {
      const n = Math.max(1, b.items.length); const g = 14; const cw = (w - g * (n - 1)) / n; const ch = Math.min(h, 130);
      b.items.forEach((it, i) => {
        const xx = x + i * (cw + g);
        card(xx, y, cw, ch);
        slide.addShape(S.rect, { x: IN(xx), y: IN(y), w: IN(cw), h: IN(3), fill: { color: P.accent }, line: { type: 'none' } });
        T(it.value, xx + 18, y + 18, cw - 36, 50, { fontSize: PT(40), fontFace: F.head });
        T(it.label, xx + 18, y + 72, cw - 36, 22, { fontSize: PT(14), color: C.ink2 });
        if (it.note) T(it.note, xx + 18, y + 96, cw - 36, 20, { fontSize: PT(12), color: C.ink3 });
      });
      break;
    }
    case 'cards': {
      const n = Math.max(1, b.items.length); const cols = n === 4 ? 2 : Math.min(3, n); const rows = Math.ceil(n / cols); const g = 14;
      const cw = (w - g * (cols - 1)) / cols; const ch = (h - g * (rows - 1)) / rows;
      b.items.forEach((it, i) => {
        const xx = x + (i % cols) * (cw + g), yy = y + Math.floor(i / cols) * (ch + g);
        card(xx, yy, cw, ch);
        T(it.title, xx + 18, yy + 16, cw - 36 - (it.tag ? 60 : 0), 26, { fontSize: PT(18), bold: true });
        if (it.tag) T(it.tag, xx + cw - 76, yy + 18, 60, 18, { fontSize: 8.5, color: P.good, align: 'right', bold: true });
        T(it.text, xx + 18, yy + 48, cw - 36, ch - 60, { fontSize: PT(15), color: C.ink2 });
      });
      break;
    }
    case 'table': {
      const cols = Math.max(b.head.length, ...b.rows.map((r) => r.length), 1);
      const cell = (t, head) => ({ text: String(t ?? ''), options: { bold: head, color: head ? C.ink2 : C.ink, fill: { color: head ? P.raised : P.surface }, fontSize: head ? 9.5 : 11 } });
      const rows = [...(b.head.length ? [Array.from({ length: cols }, (_, k) => cell(b.head[k], true))] : []), ...b.rows.map((r) => Array.from({ length: cols }, (_, k) => cell(r[k], false)))];
      const first = 1.6, rest = (cols - 1) || 1;
      const colW = Array.from({ length: cols }, (_, k) => IN(w) * (k === 0 ? first : 1) / (first + rest));
      slide.addTable(rows, { x: IN(x), y: IN(y), w: IN(w), colW, fontFace: F.body, border: { type: 'solid', color: P.line, pt: 0.75 }, margin: 0.08, rowH: Math.min(0.42, IN(h) / Math.max(1, rows.length)) });
      break;
    }
    case 'chart': {
      const colors = [P.accent, P.pop[1], P.pop[2], P.ink3, P.good, P.warn].filter(Boolean);
      const type = { column: pptx.ChartType.bar, bar: pptx.ChartType.bar, line: pptx.ChartType.line, area: pptx.ChartType.area, donut: pptx.ChartType.doughnut }[b.kind];
      const data = b.kind === 'donut' ? [{ name: b.series[0]?.name ?? '', labels: b.labels, values: b.series[0]?.values ?? [] }] : b.series.map((s) => ({ name: s.name, labels: b.labels, values: s.values }));
      const fmtCode = b.unit ? (/^[$€£]/.test(b.unit) ? `"${b.unit[0]}"#,##0"${b.unit.slice(1)}"` : `#,##0"${b.unit}"`) : '#,##0';
      slide.addChart(type, data, {
        x: IN(x), y: IN(y), w: IN(w), h: IN(h), barDir: b.kind === 'bar' ? 'bar' : 'col', barGapWidthPct: 60,
        chartColors: b.kind === 'donut' ? colors : colors.slice(0, Math.max(1, b.series.length)), holeSize: 62,
        showLegend: b.series.length > 1 || b.kind === 'donut', legendPos: b.kind === 'donut' ? 'r' : 'b', legendFontSize: 10, legendColor: C.ink2, legendFontFace: F.body,
        catAxisLabelColor: C.ink3, valAxisLabelColor: C.ink3, catAxisLabelFontSize: 10, valAxisLabelFontSize: 10, catAxisLabelFontFace: F.body, valAxisLabelFontFace: F.body,
        valGridLine: { color: P.line, size: 0.5 }, catGridLine: { style: 'none' }, valAxisLineShow: false, catAxisLineShow: true,
        valAxisLabelFormatCode: fmtCode, dataLabelFormatCode: b.kind === 'donut' ? '0%' : fmtCode,
        showValue: b.series.length === 1 && b.kind !== 'line' && b.kind !== 'area' && b.kind !== 'donut', showPercent: b.kind === 'donut', dataLabelColor: C.ink2, dataLabelFontSize: 9, dataLabelPosition: b.kind === 'donut' ? 'bestFit' : 'outEnd',
        lineSize: 2, lineDataSymbolSize: 6, showTitle: !!b.title, title: b.title ?? '', titleFontSize: 11, titleColor: C.ink2, titleFontFace: F.body,
      });
      break;
    }
    case 'image': await picture(ctx, b, x, y, w, h - (b.caption ? 22 : 0), b.fit); if (b.caption) T(b.caption, x, y + h - 18, w, 18, { fontSize: PT(13), color: C.ink3 }); break;
    case 'steps': {
      const n = Math.max(1, b.items.length); const g = 14; const cw = (w - g * (n - 1)) / n;
      b.items.forEach((it, i) => {
        const xx = x + i * (cw + g);
        slide.addShape(S.ellipse, { x: IN(xx), y: IN(y), w: IN(36), h: IN(36), fill: { color: P.accent }, line: { type: 'none' } });
        T(String(i + 1), xx, y + 8, 36, 20, { fontSize: 11, bold: true, color: P.onAccent, align: 'center' });
        if (i < n - 1) slide.addShape(S.line, { x: IN(xx + 46), y: IN(y + 18), w: IN(cw - 40), h: 0, line: { color: P.line2, width: 1.25 } });
        T(it.title, xx, y + 48, cw, 26, { fontSize: PT(18), bold: true });
        T(it.text, xx, y + 76, cw, h - 80, { fontSize: PT(14.5), color: C.ink2 });
      });
      break;
    }
    case 'timeline': {
      const n = Math.max(1, b.items.length); const rh = h / n;
      b.items.forEach((it, i) => {
        const yy = y + i * rh;
        slide.addShape(S.ellipse, { x: IN(x), y: IN(yy + 4), w: IN(10), h: IN(10), fill: { color: i === 0 ? P.accent : P.surface }, line: { color: P.accent, width: 1.5 } });
        T(it.when, x + 22, yy, 100, 20, { fontSize: PT(13), color: P.accent, fontFace: F.body, bold: true });
        T(it.title, x + 130, yy, w - 130, 22, { fontSize: PT(16), bold: true });
        T(it.text, x + 130, yy + 22, w - 130, rh - 24, { fontSize: PT(14.5), color: C.ink2 });
      });
      break;
    }
    case 'checklist': slide.addText(b.items.map((it) => ({ text: `${it.done ? '✓' : '○'}  ${it.text}`, options: { color: it.done ? C.ink : C.ink2, paraSpaceAfter: 8 } })), { x: IN(x), y: IN(y), w: IN(w), h: IN(h), fontFace: F.body, fontSize: PT(17), margin: 0, valign: 'top', fit: 'shrink' }); break;
    case 'callout': {
      const tone = b.tone === 'good' ? P.good : b.tone === 'warn' ? P.warn : P.accent;
      slide.addShape(S.roundRect, { x: IN(x), y: IN(y), w: IN(w), h: IN(Math.min(h, 70)), rectRadius: 0.08, fill: { color: tone, transparency: 88 }, line: { color: tone, width: 0.75, transparency: 40 } });
      T(b.text, x + 20, y + 14, w - 40, Math.min(h, 70) - 20, { fontSize: PT(18), valign: 'middle' });
      break;
    }
    case 'chat': {
      card(x, y, w, h);
      T(b.prompt, x + w * 0.35, y + 14, w * 0.65 - 18, 40, { fontSize: PT(15), align: 'right', color: C.ink });
      let yy = y + 60;
      for (const t of b.tools) { T(`${t.name}   ${t.arg}   ${t.out}`, x + 52, yy, w - 70, 20, { fontSize: 9, fontFace: 'Consolas', color: C.ink3 }); yy += 24; }
      slide.addShape(S.ellipse, { x: IN(x + 18), y: IN(y + 60), w: IN(24), h: IN(24), fill: { color: P.accent }, line: { type: 'none' } });
      T(b.answer, x + 52, yy + 4, w - 70, y + h - yy - 10, { fontSize: PT(15.5) });
      break;
    }
    case 'score': {
      card(x, y, w, h);
      T(`${b.grade}`, x + 22, y + 18, 120, 70, { fontSize: 44, fontFace: F.head, bold: true });
      T('/100', x + 22, y + 82, 120, 18, { fontSize: 10, color: C.ink3 });
      T(b.title, x + 160, y + 16, w - 180, 22, { fontSize: 12, bold: true });
      b.areas.forEach((a, i) => {
        const yy = y + 48 + i * 26; const bw = w - 180 - 140;
        T(a.label, x + 160, yy, 130, 18, { fontSize: 10.5, color: C.ink2 });
        slide.addShape(S.rect, { x: IN(x + 300), y: IN(yy + 6), w: IN(bw), h: IN(4), fill: { color: P.line }, line: { type: 'none' } });
        slide.addShape(S.rect, { x: IN(x + 300), y: IN(yy + 6), w: IN((bw * a.value) / 100), h: IN(4), fill: { color: a.value >= 75 ? P.good : a.value >= 50 ? P.warn : P.bad }, line: { type: 'none' } });
        T(String(a.value), x + 300 + bw + 6, yy, 30, 18, { fontSize: 10.5 });
      });
      break;
    }
    case 'kv': {
      const rh = Math.min(38, h / Math.max(1, b.items.length));
      b.items.forEach((it, i) => {
        const yy = y + i * rh;
        slide.addShape(S.line, { x: IN(x), y: IN(yy), w: IN(w), h: 0, line: { color: P.line, width: 0.75 } });
        T(it.label, x, yy + 8, w * 0.38, rh - 8, { fontSize: PT(16), color: C.ink3 });
        T(it.value, x + w * 0.4, yy + 8, w * 0.6, rh - 8, { fontSize: PT(16) });
      });
      break;
    }
    case 'button': slide.addText(b.text, { x: IN(x), y: IN(y), w: IN(Math.min(w, 40 + b.text.length * 10)), h: IN(44), shape: S.roundRect, rectRadius: 0.1, fill: { color: P.accent }, color: P.onAccent, fontFace: F.body, fontSize: 12, bold: true, align: 'center', valign: 'middle', hyperlink: b.url ? { url: b.url } : undefined }); break;
  }
}

// An image filling a box, cropped to cover it (or fitted whole, with contain).
async function picture(ctx, img, x, y, w, h, fit) {
  if (!img?.url) { ctx.slide.addShape(ctx.pptx.ShapeType.rect, { x: IN(x), y: IN(y), w: IN(w), h: IN(h), fill: { color: ctx.P.raised }, line: { type: 'none' } }); return; }
  const r = await ctx.image(img.url);
  if (!r) { ctx.slide.addShape(ctx.pptx.ShapeType.rect, { x: IN(x), y: IN(y), w: IN(w), h: IN(h), fill: { color: ctx.P.raised }, line: { type: 'none' } }); return; }
  const contain = (fit ?? img.fit) === 'contain';
  const box = w / h, ar = r.w / r.h;
  if (contain) {
    const ww = ar > box ? w : h * ar, hh = ar > box ? w / ar : h;
    ctx.slide.addImage({ data: r.data, x: IN(x + (w - ww) / 2), y: IN(y + (h - hh) / 2), w: IN(ww), h: IN(hh) });
  } else {
    ctx.slide.addImage({ data: r.data, x: IN(x), y: IN(y), w: IN(w), h: IN(w) / ar, sizing: { type: 'cover', w: IN(w), h: IN(h) } });
  }
}

async function loadImage(app, me, url) {
  let buf, type;
  if (url.startsWith('/files/decks/')) {
    const id = /f_[\w-]+/.exec(url)?.[0];
    const row = id ? await app.files.row(id) : null;
    if (!row || (row.team_id !== me.team_id && !Number(row.public))) return null;
    buf = await app.files.read(row); type = row.type;
  } else if (url.startsWith('/app/examples/')) {
    const f = path.join(ROOT, 'public', path.normalize(url));
    buf = fs.readFileSync(f); type = f.endsWith('.png') ? 'image/png' : 'image/jpeg';
  } else {
    const r = await fetch(url, { headers: { accept: 'image/jpeg,image/png;q=0.9,image/gif;q=0.5' }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    buf = Buffer.from(await r.arrayBuffer()); type = r.headers.get('content-type') ?? '';
  }
  const dim = size(buf);
  if (!dim) return null;
  return { data: `data:${dim.type};base64,${buf.toString('base64')}`, w: dim.w, h: dim.h };
}

// Width and height from a PNG, JPEG or GIF header.
function size(b) {
  if (b[0] === 0x89 && b[1] === 0x50) return { type: 'image/png', w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0x47 && b[1] === 0x49) return { type: 'image/gif', w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) return { type: 'image/jpeg', h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

export { fmt };
