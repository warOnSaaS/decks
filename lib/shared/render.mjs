// One slide in, one HTML string out. Used everywhere a slide is drawn: the editor canvas and its
// thumbnails, present mode, share links, embeds, the PDF export and slide previews for agents.
// Slides are 960 by 540 and scale to fit; inside, they are built from ui-design kit blocks
// (ui-stats, ui-cards, ui-table, ui-steps, ui-timeline, ui-checks, ui-kv, ui-notice, ui-score and the
// agent blocks ui-you, ui-ai and ui-tool), themed per deck with the kit's schemes and styles.
import { LAYOUTS } from './layouts.mjs';
import { normalTheme, brandStyle } from './themes.mjs';
import { chartSvg } from './chart.mjs';

export const W = 960, H = 540;
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// **bold** and paragraphs, nothing else; everything is escaped first.
function rich(s) {
  return String(s ?? '').split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')}</p>`).join('');
}

// A text field: editable in the editor (plain text, merged letter by letter), finished elsewhere.
function field(o, tag, cls, path, value, ph, { multi = false, richText = false } = {}) {
  if (o.editable) return `<${tag} class="${cls} dk-ed" data-edit="${esc(path)}" data-ph="${esc(ph)}" contenteditable="plaintext-only" spellcheck="true" data-tool="decks.sync_doc"${multi ? ' data-multi="1"' : ''}>${esc(value)}</${tag}>`;
  if (!value) return '';
  return richText ? `<div class="${cls}">${rich(value)}</div>` : `<${tag} class="${cls}">${esc(value).replace(/\n/g, '<br>')}</${tag}>`;
}

function blockHtml(b, o) {
  const ed = (k, v, ph, tag = 'span', cls = '') => field(o, tag, cls, `b:${b.id}:${k}`, v, ph);
  const many = (k, v, ph, tag = 'span', cls = '') => (o.editable || v ? field(o, tag, cls, `b:${b.id}:${k}`, v, ph) : '');
  switch (b.t) {
    case 'text': return o.editable ? field(o, 'div', `dk-text is-${b.size ?? 'md'}`, `b:${b.id}:text`, b.text, 'Type something', { multi: true }) : `<div class="dk-text is-${b.size ?? 'md'}">${rich(b.text)}</div>`;
    case 'heading': return ed('text', b.text, 'Heading', 'h3', 'dk-h3');
    case 'bullets': {
      const tag = b.numbered ? 'ol' : 'ul';
      return `<${tag} class="dk-bullets">${(b.items ?? []).map((x, i) => `<li>${ed(`items.${i}`, x, 'A point')}</li>`).join('')}</${tag}>`;
    }
    case 'quote': return `<figure class="dk-quote">${field(o, 'blockquote', '', `b:${b.id}:text`, b.text, 'The quote', { multi: true })}${many('by', b.by, 'Who said it', 'figcaption')}</figure>`;
    case 'stats': return `<div class="ui-stats dk-stats" data-n="${(b.items ?? []).length}">${(b.items ?? []).map((x, i) => `<div>${ed(`items.${i}.value`, x.value, '0', 'b')}${ed(`items.${i}.label`, x.label, 'What it counts')}${x.note || o.editable ? many(`items.${i}.note`, x.note, 'A note', 'small') : ''}</div>`).join('')}</div>`;
    case 'cards': return `<ul class="ui-cards dk-cards" data-n="${(b.items ?? []).length}">${(b.items ?? []).map((x, i) => `<li><div class="ui-card-t">${ed(`items.${i}.title`, x.title, 'Title')}${x.tag || o.editable ? many(`items.${i}.tag`, x.tag, 'tag', 'span', 'ui-tag') : ''}</div>${many(`items.${i}.text`, x.text, 'A line or two', 'p')}</li>`).join('')}</ul>`;
    case 'table': {
      const cols = Math.max(b.head?.length ?? 0, ...(b.rows ?? []).map((r) => r.length), 1);
      const row = (r, ri, head) => `<div class="ui-table-r${head ? ' ui-table-h' : ''}">${Array.from({ length: cols }, (_, k) => `<span>${ed(head ? `head.${k}` : `rows.${ri}.${k}`, r[k] ?? '', head ? 'Column' : '')}</span>`).join('')}</div>`;
      return `<div class="ui-table dk-table"><div class="ui-table-b" style="grid-template-columns:minmax(0,1.6fr) repeat(${cols - 1},minmax(0,1fr))">${b.head?.length ? row(b.head, 0, true) : ''}${(b.rows ?? []).map((r, i) => row(r, i, false)).join('')}</div></div>`;
    }
    case 'chart': return `<div class="dk-chart-wrap">${chartSvg(b, { w: o.chartW ?? 560, h: o.chartH ?? 280 })}</div>`;
    case 'image': return b.url ? `<figure class="dk-image is-${b.fit}"><img src="${esc(b.url)}" alt="${esc(b.alt)}" loading="lazy" decoding="async">${b.caption || o.editable ? many('caption', b.caption, 'Caption', 'figcaption') : ''}</figure>` : `<div class="dk-image is-empty"><span>${o.editable ? 'Add an image address in the panel' : ''}</span></div>`;
    case 'steps': return `<ol class="dk-steps">${(b.items ?? []).map((x, i) => `<li><i>${i + 1}</i><div>${ed(`items.${i}.title`, x.title, 'Step', 'b')}${many(`items.${i}.text`, x.text, 'What happens', 'span')}</div></li>`).join('')}</ol>`;
    case 'timeline': return `<ol class="ui-timeline dk-timeline">${(b.items ?? []).map((x, i) => `<li>${ed(`items.${i}.when`, x.when, 'When', 'small')}${ed(`items.${i}.title`, x.title, 'What', 'b')}${many(`items.${i}.text`, x.text, 'Detail', 'span')}</li>`).join('')}</ol>`;
    case 'checklist': return `<ul class="ui-checks dk-checks">${(b.items ?? []).map((x, i) => `<li class="${x.done ? '' : 'is-open'}">${ed(`items.${i}.text`, x.text, 'An item')}</li>`).join('')}</ul>`;
    case 'callout': return `<div class="ui-notice dk-callout is-${b.tone}"><span class="dk-callout-i" aria-hidden="true"></span>${ed('text', b.text, 'One line to stand out', 'div')}</div>`;
    case 'chat': return `<div class="dk-agent"><div class="ui-you"><p>${ed('prompt', b.prompt, 'A question')}</p></div><div class="ui-ai"><div class="ui-av" aria-hidden="true">${SPARK}</div><div class="ui-body">${(b.tools ?? []).map((t) => `<div class="ui-tool"><b>${esc(t.name)}</b><span>${esc(t.arg)}</span><em>${esc(t.out)}</em></div>`).join('')}${ed('answer', b.answer, 'The answer', 'p')}</div></div></div>`;
    case 'score': return `<div class="ui-score dk-score"><div class="ui-score-g">${esc(b.grade)}<small>/100</small></div><div><div class="ui-score-h">${ed('title', b.title, 'What it scores')}</div><ul>${(b.areas ?? []).map((a) => `<li><span>${esc(a.label)}</span><i class="is-${a.value >= 75 ? 'good' : a.value >= 50 ? 'mid' : 'low'}" style="--w:${a.value}%"></i><b>${esc(a.value)}</b></li>`).join('')}</ul></div></div>`;
    case 'kv': return `<dl class="ui-kv is-rows dk-kv">${(b.items ?? []).map((x, i) => `<div><dt>${ed(`items.${i}.label`, x.label, 'Label')}</dt><dd>${ed(`items.${i}.value`, x.value, 'Value')}</dd></div>`).join('')}</dl>`;
    case 'button': return `<span class="ui-btn is-accent is-lg dk-button">${ed('text', b.text, 'Button')}</span>`;
    default: return '';
  }
}

const SPARK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.5 13.8 10.2 20.5 12l-6.7 1.8L12 20.5l-1.8-6.7L3.5 12l6.7-1.8z"/></svg>';

function slotHtml(slide, name, o) {
  const blocks = (slide.blocks ?? []).filter((b) => (b.slot ?? 'main') === name || (name === 'main' && !LAYOUTS[slide.layout]?.slots?.includes(b.slot ?? 'main') && (LAYOUTS[slide.layout]?.slots?.[0] ?? 'main') === 'main'));
  const n = blocks.length;
  const inner = blocks.map((b) => `<div class="dk-block dk-b-${b.t}${o.selected === b.id ? ' is-sel' : ''}" data-block="${esc(b.id)}">${blockHtml(b, o)}</div>`).join('');
  return `<div class="dk-slot" data-slot="${name}" data-count="${n}">${inner}${o.editable && !n ? `<div class="dk-slot-empty">${name === 'main' ? 'Add blocks from the panel' : `Add blocks to the ${name} column`}</div>` : ''}</div>`;
}

function head(slide, o, { big = false } = {}) {
  const L = LAYOUTS[slide.layout] ?? LAYOUTS.content;
  const f = (k, tag, cls, ph) => (L.fields.includes(k) ? field(o, tag, cls, k, slide[k], ph, { multi: k !== 'kicker' }) : '');
  return `${f('kicker', 'div', 'dk-kicker', 'Kicker')}${f('title', big ? 'h1' : 'h2', 'dk-title', 'Title')}${f('subtitle', 'p', 'dk-sub', 'Subtitle')}`;
}

function imageHtml(slide, o, cls = 'dk-img') {
  const img = slide.image;
  if (!img?.url) return `<div class="${cls} is-empty">${o.editable ? '<span>Add an image in the panel</span>' : ''}</div>`;
  return `<div class="${cls}"><img src="${esc(img.url)}" alt="${esc(img.alt)}" style="object-fit:${img.fit === 'contain' ? 'contain' : 'cover'}${img.position ? `;object-position:${esc(img.position)}` : ''}" decoding="async"></div>`;
}

function body(slide, o) {
  switch (slide.layout) {
    case 'title': return `<div class="dk-in dk-hero">${logo(o, 'dk-logo-top')}<div class="dk-hero-t">${head(slide, o, { big: true })}</div>${slotHtml(slide, 'main', o)}</div>`;
    case 'section': return `<div class="dk-in dk-hero dk-section">${head(slide, o, { big: true })}</div>`;
    case 'two_column': return `<div class="dk-in"><header class="dk-head">${head(slide, o)}</header><div class="dk-cols">${slotHtml(slide, 'left', o)}${slotHtml(slide, 'right', o)}</div></div>`;
    case 'image_left':
    case 'image_right': return `<div class="dk-split">${imageHtml(slide, o)}<div class="dk-side"><header class="dk-head">${head(slide, o)}</header>${slotHtml(slide, 'main', o)}</div></div>`;
    case 'full_image': return `${imageHtml(slide, o, 'dk-bgimg')}<div class="dk-scrim"></div><div class="dk-in dk-hero dk-over">${head(slide, o, { big: true })}</div>`;
    case 'big_number': return `<div class="dk-in dk-bignum">${head(slide, o, { big: true })}${slotHtml(slide, 'main', o)}</div>`;
    case 'quote': return `<div class="dk-in dk-quoteslide">${field(o, 'div', 'dk-kicker', 'kicker', slide.kicker, 'Kicker')}<span class="dk-qmark" aria-hidden="true">“</span>${field(o, 'blockquote', 'dk-title', 'title', slide.title, 'The quote', { multi: true })}${field(o, 'p', 'dk-sub', 'subtitle', slide.subtitle, 'Who said it')}</div>`;
    case 'closing': return `<div class="dk-in dk-hero dk-closing">${logo(o, 'dk-logo-top')}${head(slide, o, { big: true })}${slotHtml(slide, 'main', o)}</div>`;
    case 'blank': return `<div class="dk-in dk-blank">${slotHtml(slide, 'main', o)}</div>`;
    default: return `<div class="dk-in"><header class="dk-head">${head(slide, o)}</header>${slotHtml(slide, 'main', o)}</div>`;
  }
}

function logo(o, cls) {
  const b = o.brand ?? {};
  if (!b.logo) return '';
  return `<img class="${cls}" src="${esc(b.logo)}" alt="" decoding="async">`;
}

// The attributes that put a deck's theme on any element (a slide, a thumbnail list, the present stage).
export function themeAttrs(theme, brand = {}, bg = 'default') {
  const t = normalTheme(theme);
  const mode = bg === 'inverse' ? (t.mode === 'dark' ? 'light' : 'dark') : t.mode;
  const style = brandStyle(brand);
  return `data-scheme="${t.scheme}" data-mode="${mode}" data-shape="${t.shape}" data-type="${t.type}" data-surface="${t.surface}" data-density="${t.density}"${style ? ` style="${esc(style)}"` : ''}`;
}

// opts: { editable, number, total, selected (block id), brand, theme }
// The size a chart is drawn at in each place, so its words come out at their real size.
const CHART = { content: [848, 300], blank: [848, 380], two_column: [406, 300], image_left: [420, 250], image_right: [420, 250], big_number: [816, 160], title: [816, 160], closing: [816, 160] };

export function renderSlide(slide, deck, opts = {}) {
  const [chartW, chartH] = CHART[slide.layout] ?? CHART.content;
  const n = (slide.blocks ?? []).filter((b) => (b.slot ?? 'main') === (slide.blocks?.find((x) => x.t === 'chart')?.slot ?? 'main')).length;
  const o = { ...opts, brand: deck.brand ?? {}, chartW, chartH: n > 1 ? Math.round(chartH * 0.7) : chartH };
  const bg = slide.bg && slide.bg !== 'default' ? slide.bg : slide.layout === 'section' ? 'accent' : 'default';
  const L = LAYOUTS[slide.layout] ? slide.layout : 'content';
  const b = deck.brand ?? {};
  const showFoot = !['title', 'section', 'full_image', 'closing'].includes(L);
  const foot = showFoot ? `<footer class="dk-foot">${b.logo ? `<img class="dk-logo" src="${esc(b.logo)}" alt="" decoding="async">` : ''}<span class="dk-foot-t">${esc(b.footer ?? '')}</span>${opts.number ? `<span class="dk-num">${opts.number}</span>` : ''}</footer>` : '';
  return `<section class="dk-slide dk-theme dk-l-${L} dk-bg-${bg}${slide.hidden ? ' is-hidden' : ''}" ${themeAttrs(deck.theme, b, bg)} data-slide="${esc(slide.id)}" aria-label="Slide ${opts.number ?? ''}">${body({ ...slide, layout: L }, o)}${foot}</section>`;
}

// A slide scaled into a box of any width: the outer box keeps 16:9 and the slide scales with it
// (container query units, so no script is needed).
export function slideBox(slide, deck, opts = {}) {
  return `<div class="dk-box${opts.cls ? ` ${opts.cls}` : ''}"><div class="dk-scale">${renderSlide(slide, deck, opts)}</div></div>`;
}

// The fonts a brand asks for, as a stylesheet link (Google Fonts only).
export function brandFontsLink(brand = {}) {
  const h = String(brand.fonts_href ?? '');
  return /^https:\/\/fonts\.googleapis\.com\/css2?\?/.test(h) ? `<link rel="stylesheet" href="${esc(h)}">` : '';
}

// Plain text of a slide, for search, the slide list and accessibility.
export function slideText(slide) {
  const t = [slide.kicker, slide.title, slide.subtitle];
  for (const b of slide.blocks ?? []) {
    for (const k of ['text', 'by', 'title', 'prompt', 'answer']) if (b[k]) t.push(b[k]);
    for (const it of b.items ?? []) t.push(typeof it === 'string' ? it : Object.values(it).join(' '));
    for (const r of b.rows ?? []) t.push(r.join(' '));
  }
  return t.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
