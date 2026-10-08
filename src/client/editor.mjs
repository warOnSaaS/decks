// The deck editor: the slide list, the canvas and the properties panel. Keyboard-first (press ? for keys,
// Cmd+K for every action). Typing on a slide changes the live Yjs copy and goes to the server through
// decks.sync_doc; every other button calls its own tool, then catches up with decks.get_changes.
import { $, $$, esc, ic, ago, fitAll, fitBox, toast, dialog, download, copyText, mobile, mod, peerColor, initials, tone } from './util.mjs';
import { DeckSync } from './sync.mjs';
import { renderSlide, slideBox, slideText } from '../../lib/shared/render.mjs';
import { LAYOUTS, LAYOUT_NAMES, BLOCKS, BLOCK_TYPES, BACKGROUNDS } from '../../lib/shared/layouts.mjs';
import { PRESETS, SCHEMES, SCHEME_NAMES, SHAPES, TYPES, SURFACES, DENSITIES } from '../../lib/shared/themes.mjs';
import { findSlide, setPath } from '../../lib/shared/model.mjs';

const nav = (why = 'moves to another screen') => `data-tool="none" data-why="${why}"`;
const help = (why) => `data-tool="none" data-why="${why}"`;
const LAYOUT_ICON = {
  title: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M6 14h9M6 17h6"/>',
  section: '<rect x="3" y="4" width="18" height="16" rx="2" fill="currentColor" fill-opacity=".18"/><path d="M6 12h10"/>',
  content: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M6 8h8M6 12h12M6 15h12"/>',
  two_column: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M6 8h8M6 12h5M13 12h5M6 15h5M13 15h5"/>',
  image_left: '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="3" y="4" width="8" height="16" fill="currentColor" fill-opacity=".25"/><path d="M13.5 9h5M13.5 12h5"/>',
  image_right: '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="13" y="4" width="8" height="16" fill="currentColor" fill-opacity=".25"/><path d="M5.5 9h5M5.5 12h5"/>',
  full_image: '<rect x="3" y="4" width="18" height="16" rx="2" fill="currentColor" fill-opacity=".25"/><path d="M6 16h8"/>',
  big_number: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 15V9l-1.5 1M10.5 9h3l-3 6h3M16 9v6"/>',
  quote: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9.5h2v2.5H7zM11 9.5h2v2.5h-2zM6 16h10"/>',
  closing: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M6 11h10M6 14h7"/>',
  blank: '<rect x="3" y="4" width="18" height="16" rx="2"/>',
};
const licon = (l) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">${LAYOUT_ICON[l]}</svg>`;

export async function openEditor(host, S, deckId, path) {
  const ctx = S.ctx;
  const E = { slideId: null, blockId: null, tab: 'slide', commentsAll: false, comments: [], peers: new Map(), shares: null, activity: null, raf: 0, gone: false, sheet: false };
  host.innerHTML = `<div class="ed" id="ed">
    <header class="ed-top">
      <a ${nav()} class="ui-btn is-ghost is-icon is-sm" href="#/" title="All decks" aria-label="All decks">${ic('back', 18)}</a>
      <form class="ed-title" data-tool="decks.update_deck"><input class="ed-title-i" name="title" aria-label="Deck title" maxlength="200" autocomplete="off"></form>
      <div class="ed-peers" id="ed-peers" aria-label="Also here"></div>
      <div class="ed-top-acts">
        <button type="button" class="ui-btn is-ghost is-sm hide-sm" ${help('opens the list of keys')} data-open="keys" title="Keys (?)" aria-label="Keyboard keys">${ic('keyboard')}</button>
        <button type="button" class="ui-btn is-quiet is-sm" ${help('opens sharing and export')} data-tab="share" title="Share (s)">${ic('share')}<span class="hide-sm">Share</span></button>
        <a ${nav('starts present mode')} class="ui-btn is-accent is-sm" id="ed-present" href="#/d/${esc(deckId)}/present" title="Present (p)">${ic('play')}<span class="hide-sm">Present</span></a>
        <button type="button" class="ui-btn is-ghost is-icon is-sm ed-sheet-btn" ${help('opens the slide panel')} data-open="sheet" aria-label="Edit panel">${ic('menu', 18)}</button>
      </div>
    </header>
    <div class="ed-body">
      <nav class="ed-list" id="ed-list" aria-label="Slides" tabindex="-1"></nav>
      <main class="ed-main">
        <div class="ed-stage"><div class="ed-canvas" id="ed-canvas"></div></div>
        <div class="ed-notes"><span class="ui-label">Speaker notes</span><div class="ed-notes-t" id="ed-notes" contenteditable="plaintext-only" data-edit="notes" data-multi="1" data-ph="What to say on this slide. Only you see it when presenting." data-tool="decks.sync_doc" spellcheck="true"></div></div>
      </main>
      <aside class="ed-panel" id="ed-panel" aria-label="Slide panel">
        <div class="ui-tabs ed-tabs" role="tablist">${[['slide', 'Slide', 'l'], ['theme', 'Theme', 't'], ['comments', 'Comments', 'c'], ['share', 'Share', 's']].map(([k, l, key]) => `<button type="button" role="tab" ${help(`shows the ${l.toLowerCase()} panel`)} data-tab="${k}" title="${l} (${key})">${l}<em data-count="${k}"></em></button>`).join('')}</div>
        <div class="ed-pane" id="ed-pane"></div>
      </aside>
    </div>
  </div>`;
  const ed = $('#ed', host);
  const sync = new DeckSync(ctx, deckId, () => schedule());
  try { await sync.load(); } catch (e) {
    host.innerHTML = `<main class="ui-page"><div class="ui-card dl-empty"><h2>This deck cannot be opened</h2><p>${esc(e.message)}</p><a ${nav()} class="ui-btn is-quiet" href="#/">All decks</a></div></main>`;
    return { unmount() {} };
  }
  const deck = () => sync.deck;
  const slides = () => deck().slides;
  const cur = () => slides().find((s) => s.id === E.slideId) ?? slides()[0];
  const idx = () => Math.max(0, slides().findIndex((s) => s.id === cur()?.id));
  const at = new URLSearchParams(path.split('?')[1] ?? '').get('slide');
  E.slideId = slides()[Math.max(0, Number(at || 1) - 1)]?.id ?? slides()[0]?.id;

  const tool = async (name, input = {}, { quiet = false } = {}) => {
    try {
      const out = await sync.tool(name, input);
      if (out?.pending) toast(esc(out.pending.message));
      return out;
    } catch (e) { if (!quiet) toast(esc(e.message)); throw e; }
  };

  // ---------- live ----------
  const live = ctx.live ? ctx.live(deckId, {
    onUpdate: (u) => sync.applyRemote(u),
    onStale: () => sync.pull().catch(() => {}),
    onHello: (h) => { for (const p of h.present) if (p.who !== h.you) E.peers.set(p.who, p); renderPeers(); },
    onPresence: (p) => { if (p.gone) E.peers.delete(p.who); else E.peers.set(p.who, p); renderPeers(); markPeers(); },
    onActivity: (a) => { if (/comment/.test(a.event)) loadComments(); },
  }) : null;
  const offSuite = !ctx.live && ctx.on ? ctx.on('decks.deck.changed', (e) => { if (!e || e.deck === deckId || e.data?.deck === deckId) { sync.pull().catch(() => {}); if (/activity/.test(e?.kind ?? e?.data?.kind ?? '')) loadComments(); } }) : null;
  const poll = !ctx.live ? setInterval(() => sync.pull().catch(() => {}), 4000) : null;
  const tellWhere = () => live?.presence({ slide: E.slideId, block: E.blockId });

  // ---------- drawing ----------
  function schedule() { cancelAnimationFrame(E.raf); E.raf = requestAnimationFrame(renderAll); }

  function renderAll() {
    if (E.gone) return;
    if (!slides().some((s) => s.id === E.slideId)) E.slideId = slides()[Math.min(idx(), slides().length - 1)]?.id ?? null;
    const t = $('.ed-title-i', ed);
    if (document.activeElement !== t) t.value = deck().title;
    renderList();
    renderCanvas();
    renderNotes();
    renderPanel();
    markPeers();
  }

  function renderList() {
    const list = $('#ed-list', ed);
    const d = deck();
    const counts = {};
    for (const c of E.comments) if (!c.resolved && c.slide) counts[c.slide] = (counts[c.slide] ?? 0) + 1;
    list.innerHTML = `${d.slides.map((s, i) => `<div class="ed-thumb${s.id === E.slideId ? ' is-cur' : ''}${s.hidden ? ' is-hidden' : ''}" data-slide="${esc(s.id)}" draggable="true">
      <span class="ed-thumb-n">${i + 1}</span>
      <button type="button" class="ed-thumb-b" ${help('shows this slide')} data-go="${esc(s.id)}" aria-label="Slide ${i + 1}: ${esc(s.title || LAYOUTS[s.layout]?.label)}"${s.id === E.slideId ? ' aria-current="true"' : ''}>${slideBox(s, d, { cls: 'is-thumb', number: i + 1 })}</button>
      ${counts[s.id] ? `<em class="ed-thumb-c" title="${counts[s.id]} open comments">${counts[s.id]}</em>` : ''}${s.hidden ? `<em class="ed-thumb-h" title="Hidden">${ic('eyeOff', 12)}</em>` : ''}
    </div>`).join('')}
    <div class="ed-list-add"><button type="button" class="ui-btn is-quiet is-block" data-tool="decks.add_slide" data-add-slide title="New slide (n)">${ic('plus')}<span>Slide</span></button></div>`;
    fitAll(list);
    const curEl = $('.ed-thumb.is-cur', list);
    if (curEl && !E.listScrolled) { curEl.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    E.listScrolled = false;
  }

  function renderCanvas() {
    const c = $('#ed-canvas', ed);
    const s = cur();
    if (!s) {
      c.innerHTML = `<div class="ed-none"><p>No slides yet.</p><button type="button" class="ui-btn is-accent" data-tool="decks.add_slide" data-add-slide>${ic('plus')}<span>Add a slide</span></button></div>`;
      return;
    }
    // Keep the caret where it was if someone else's change redraws the slide under it.
    const a = document.activeElement;
    const keep = a?.matches?.('#ed-canvas [data-edit]') ? { path: a.dataset.edit, off: caretOffset(a) } : null;
    c.innerHTML = slideBox(s, deck(), { editable: true, selected: E.blockId, number: idx() + 1, cls: 'is-canvas' });
    fitAll(c);
    if (keep) { const el = $(`[data-edit="${CSS.escape(keep.path)}"]`, c); if (el) { el.focus(); setCaret(el, keep.off); } }
  }

  function renderNotes() {
    const n = $('#ed-notes', ed);
    const s = cur();
    if (document.activeElement === n) return;
    n.textContent = s?.notes ?? '';
  }

  function renderPeers() {
    const el = $('#ed-peers', ed);
    const people = [...E.peers.values()];
    el.innerHTML = people.slice(0, 5).map((p) => `<span class="ui-avatar is-sm ed-peer" style="--peer:${peerColor(p.id)}" title="${esc(p.name)}${p.slide ? `, on slide ${slides().findIndex((s) => s.id === p.slide) + 1}` : ''}">${esc(initials(p.name))}</span>`).join('') + (people.length > 5 ? `<span class="ed-peer-more">+${people.length - 5}</span>` : '');
  }
  function markPeers() {
    for (const b of $$('[data-peer]', ed)) { b.removeAttribute('data-peer'); b.style.removeProperty('--peer'); }
    for (const p of E.peers.values()) {
      const th = $(`.ed-thumb[data-slide="${CSS.escape(p.slide ?? '')}"]`, ed);
      if (th) { th.dataset.peer = initials(p.name); th.style.setProperty('--peer', peerColor(p.id)); }
      if (p.slide === E.slideId && p.block) { const b = $(`#ed-canvas [data-block="${CSS.escape(p.block)}"]`, ed); if (b) { b.dataset.peer = p.name.split(' ')[0]; b.style.setProperty('--peer', peerColor(p.id)); } }
    }
  }

  // ---------- the panel ----------
  function renderPanel() {
    for (const b of $$('.ed-tabs [data-tab]', ed)) b.setAttribute('aria-selected', String(b.dataset.tab === E.tab));
    const open = E.comments.filter((c) => !c.resolved).length;
    $('.ed-tabs [data-count=comments]', ed).textContent = open ? String(open) : '';
    const pane = $('#ed-pane', ed);
    if (pane.contains(document.activeElement) && document.activeElement.matches('input,textarea,select')) return;
    pane.innerHTML = E.tab === 'theme' ? themePane() : E.tab === 'comments' ? commentsPane() : E.tab === 'share' ? sharePane() : slidePane();
    if (E.tab === 'share' && !E.shares) loadShares();
  }

  function slidePane() {
    const s = cur();
    if (!s) return '<p class="ed-muted">Add a slide to start.</p>';
    const L = LAYOUTS[s.layout];
    const b = s.blocks.find((x) => x.id === E.blockId);
    return `
    <section class="ed-sect"><h3 class="ui-label">Layout</h3><div class="ed-layouts">${LAYOUT_NAMES.map((l) => `<button type="button" data-tool="decks.set_slide_content" data-layout="${l}" aria-pressed="${s.layout === l}" title="${esc(LAYOUTS[l].about)}">${licon(l)}<span>${esc(LAYOUTS[l].label)}</span></button>`).join('')}</div></section>
    <section class="ed-sect"><h3 class="ui-label">Background</h3><div class="ui-seg ed-seg">${BACKGROUNDS.map((g) => `<button type="button" data-tool="decks.set_slide_content" data-bg="${g}" aria-pressed="${(s.bg || 'default') === g}">${g === 'default' ? 'Page' : g === 'alt' ? 'Card' : g === 'accent' ? 'Accent' : 'Inverse'}</button>`).join('')}</div></section>
    ${L.image ? `<section class="ed-sect"><h3 class="ui-label">Picture</h3><form class="ed-form" data-tool="decks.add_image" data-as="slide"><input class="ui-input" name="url" placeholder="https://… image address" value="${esc(s.image?.url ?? '')}" aria-label="Image address"><div class="ed-row"><select class="ui-select" name="fit" aria-label="Fit"><option value="cover"${s.image?.fit !== 'contain' ? ' selected' : ''}>Fill</option><option value="contain"${s.image?.fit === 'contain' ? ' selected' : ''}>Whole image</option></select><label class="ui-btn is-quiet is-sm" data-tool="decks.add_image">${ic('upload')}<span>Upload</span><input type="file" accept="image/*" hidden data-tool="decks.add_image" data-upload="slide"></label><button class="ui-btn is-quiet is-sm" type="submit">Set</button></div><input class="ui-input" name="alt" placeholder="What it shows" value="${esc(s.image?.alt ?? '')}" aria-label="What it shows"></form></section>` : ''}
    ${L.slots.length ? `<section class="ed-sect"><h3 class="ui-label">Add a block${s.layout === 'two_column' ? ` to the <select class="ed-inline-sel" id="ed-slot" data-tool="decks.add_block" aria-label="Column"><option value="left">left</option><option value="right"${b?.slot === 'right' ? ' selected' : ''}>right</option></select> column` : ''}</h3><div class="ed-blocks">${BLOCK_TYPES.map((t) => `<button type="button" data-tool="decks.add_block" data-add="${t}" title="${esc(Object.entries(BLOCKS[t].fields).map(([k, v]) => `${k}: ${v}`).join('\n'))}">${esc(BLOCKS[t].label)}</button>`).join('')}</div></section>` : ''}
    ${b ? blockPanel(s, b) : (s.blocks.length ? '<p class="ed-muted ed-hint">Click a block on the slide to change it.</p>' : '')}
    <section class="ed-sect ed-slide-acts"><h3 class="ui-label">This slide</h3><div class="ed-row">
      <button type="button" class="ui-btn is-quiet is-sm" data-tool="decks.reorder_slides" data-move="-1" title="Move up (Alt+↑)" aria-label="Move slide up">${ic('up')}</button>
      <button type="button" class="ui-btn is-quiet is-sm" data-tool="decks.reorder_slides" data-move="1" title="Move down (Alt+↓)" aria-label="Move slide down">${ic('down')}</button>
      <button type="button" class="ui-btn is-quiet is-sm" data-tool="decks.duplicate_slide" data-dup title="Duplicate (${mac()}D)">${ic('copy')}<span>Duplicate</span></button>
      <button type="button" class="ui-btn is-quiet is-sm" data-tool="decks.set_slide_content" data-hide title="Hidden slides are skipped when presenting">${ic(s.hidden ? 'eye' : 'eyeOff')}<span>${s.hidden ? 'Show' : 'Hide'}</span></button>
      <button type="button" class="ui-btn is-danger is-sm" data-tool="decks.delete_slide" data-del-slide title="Delete (Shift+Delete)">${ic('trash')}<span>Delete</span></button></div></section>`;
  }

  function blockPanel(s, b) {
    const lines = (rows) => esc(rows.join('\n'));
    let f = '';
    switch (b.t) {
      case 'text': f = sel('size', [['lg', 'Large'], ['md', 'Normal'], ['sm', 'Small']], b.size ?? 'md', 'Size'); break;
      case 'bullets': f = area('items', lines(b.items), 'One point per line', 6) + check('numbered', b.numbered, 'Numbered'); break;
      case 'stats': f = area('items', lines(b.items.map((x) => [x.value, x.label, x.note].filter((v, i) => i < 2 || v).join(' | '))), 'value | label | note, one per line', 4); break;
      case 'cards': f = area('items', lines(b.items.map((x) => [x.title, x.text, x.tag].filter((v, i) => i < 2 || v).join(' | '))), 'title | text | tag, one per line', 5); break;
      case 'table': f = area('table', lines([b.head.join(' | '), ...b.rows.map((r) => r.join(' | '))]), 'First line: column names. Cells split by |', 7); break;
      case 'chart': f = sel('kind', [['column', 'Columns'], ['bar', 'Bars'], ['line', 'Line'], ['area', 'Area'], ['donut', 'Donut']], b.kind, 'Kind') + inp('unit', b.unit, 'Unit, like $ or %') + inp('title', b.title, 'Title (optional)') + area('data', lines([['', ...b.series.map((x) => x.name)].join(' | '), ...b.labels.map((l, i) => [l, ...b.series.map((x) => x.values[i] ?? 0)].join(' | '))]), 'First line: | series names. Then label | numbers', 7); break;
      case 'image': f = inp('url', b.url, 'https://… image address') + `<label class="ui-btn is-quiet is-sm" data-tool="decks.update_block">${ic('upload')}<span>Upload</span><input type="file" accept="image/*" hidden data-tool="decks.update_block" data-upload="block"></label>` + inp('alt', b.alt, 'What it shows') + sel('fit', [['cover', 'Fill'], ['contain', 'Whole image']], b.fit, 'Fit') + inp('caption', b.caption, 'Caption'); break;
      case 'steps': f = area('items', lines(b.items.map((x) => `${x.title} | ${x.text}`)), 'title | text, one per line', 5); break;
      case 'timeline': f = area('items', lines(b.items.map((x) => `${x.when} | ${x.title} | ${x.text}`)), 'when | title | text, one per line', 5); break;
      case 'checklist': f = area('items', lines(b.items.map((x) => `${x.done ? '[x]' : '[ ]'} ${x.text}`)), '[x] done, [ ] open, one per line', 5); break;
      case 'callout': f = sel('tone', [['info', 'Accent'], ['good', 'Good'], ['warn', 'Careful']], b.tone, 'Tone'); break;
      case 'chat': f = area('tools', lines(b.tools.map((x) => `${x.name} | ${x.arg} | ${x.out}`)), 'Tool steps: name | what | result', 3); break;
      case 'score': f = inp('grade', String(b.grade), 'Score out of 100') + area('areas', lines(b.areas.map((x) => `${x.label} | ${x.value}`)), 'label | value, one per line', 4); break;
      case 'kv': f = area('items', lines(b.items.map((x) => `${x.label} | ${x.value}`)), 'label | value, one per line', 5); break;
      case 'button': f = inp('url', b.url, 'Where it goes'); break;
      default: f = '';
    }
    const pos = s.blocks.findIndex((x) => x.id === b.id);
    return `<section class="ed-sect ed-block-sect"><h3 class="ui-label">${esc(BLOCKS[b.t].label)} block</h3>
      ${f ? `<form class="ed-form" data-tool="decks.update_block" data-block="${esc(b.id)}" data-t="${b.t}">${f}<button class="ui-btn is-quiet is-sm" type="submit">Apply</button></form>` : '<p class="ed-muted">Type on the slide to change its words.</p>'}
      <div class="ed-row">
        <button type="button" class="ui-btn is-quiet is-sm" data-tool="decks.move_block" data-bmove="-1" ${pos === 0 ? 'disabled' : ''} aria-label="Move block up">${ic('up')}</button>
        <button type="button" class="ui-btn is-quiet is-sm" data-tool="decks.move_block" data-bmove="1" ${pos === s.blocks.length - 1 ? 'disabled' : ''} aria-label="Move block down">${ic('down')}</button>
        ${s.layout === 'two_column' ? `<button type="button" class="ui-btn is-quiet is-sm" data-tool="decks.move_block" data-bslot="${b.slot === 'right' ? 'left' : 'right'}">To the ${b.slot === 'right' ? 'left' : 'right'}</button>` : ''}
        <button type="button" class="ui-btn is-danger is-sm" data-tool="decks.remove_block" data-bdel title="Remove (Delete)">${ic('trash')}<span>Remove</span></button>
      </div></section>`;
  }
  const inp = (n, v, ph) => `<input class="ui-input" name="${n}" value="${esc(v ?? '')}" placeholder="${esc(ph)}" aria-label="${esc(ph)}">`;
  const area = (n, v, ph, rows) => `<textarea class="ui-textarea ed-mono" name="${n}" rows="${rows}" placeholder="${esc(ph)}" aria-label="${esc(ph)}">${v}</textarea>`;
  const sel = (n, opts, v, label) => `<label class="ed-sel"><span>${esc(label)}</span><select class="ui-select" name="${n}">${opts.map(([k, l]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const check = (n, v, label) => `<label class="ui-check"><input type="checkbox" name="${n}"${v ? ' checked' : ''}><span>${esc(label)}</span></label>`;

  function readBlockForm(form) {
    const f = new FormData(form);
    const t = form.dataset.t;
    const rows = (k) => String(f.get(k) ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.split('|').map((x) => x.trim()));
    const num = (v) => parseFloat(String(v).replace(/[^0-9.+-eE]/g, '')) || 0;
    switch (t) {
      case 'text': return { size: f.get('size') };
      case 'bullets': return { items: rows('items').map((r) => r.join(' | ')), numbered: !!f.get('numbered') };
      case 'stats': return { items: rows('items').map(([value, label, note]) => ({ value, label: label ?? '', ...(note ? { note } : {}) })) };
      case 'cards': return { items: rows('items').map(([title, text, tag]) => ({ title, text: text ?? '', ...(tag ? { tag } : {}) })) };
      case 'table': { const r = rows('table'); return { head: r[0] ?? [], rows: r.slice(1) }; }
      case 'chart': {
        const r = String(f.get('data') ?? '').split('\n').filter((l) => l.trim()).map((l) => l.split('|').map((x) => x.trim()));
        const names = (r[0] ?? []).slice(1);
        const body = r.slice(1);
        return { kind: f.get('kind'), unit: f.get('unit') || undefined, title: f.get('title') || undefined, labels: body.map((x) => x[0]), series: names.map((name, k) => ({ name, values: body.map((x) => num(x[k + 1])) })) };
      }
      case 'image': return { url: f.get('url'), alt: f.get('alt'), fit: f.get('fit'), caption: f.get('caption') || undefined };
      case 'steps': return { items: rows('items').map(([title, text]) => ({ title, text: text ?? '' })) };
      case 'timeline': return { items: rows('items').map(([when, title, text]) => ({ when, title: title ?? '', text: text ?? '' })) };
      case 'checklist': return { items: String(f.get('items') ?? '').split('\n').filter((l) => l.trim()).map((l) => ({ done: /^\s*\[x\]/i.test(l), text: l.replace(/^\s*\[[ x]?\]\s*/i, '') })) };
      case 'callout': return { tone: f.get('tone') };
      case 'chat': return { tools: rows('tools').map(([name, arg, out]) => ({ name, arg: arg ?? '', out: out ?? '' })) };
      case 'score': return { grade: num(f.get('grade')), areas: rows('areas').map(([label, value]) => ({ label, value: num(value) })) };
      case 'kv': return { items: rows('items').map(([label, value]) => ({ label, value: value ?? '' })) };
      case 'button': return { url: f.get('url') };
      default: return {};
    }
  }

  function themePane() {
    const d = deck();
    const t = d.theme, br = d.brand ?? {};
    const seg = (name, list, val, label) => `<section class="ed-sect"><h3 class="ui-label">${label}</h3><div class="ui-seg ed-seg">${list.map((x) => `<button type="button" data-tool="decks.apply_theme" data-k="${name}" data-v="${x}" aria-pressed="${val === x}">${esc(x[0].toUpperCase() + x.slice(1))}</button>`).join('')}</div></section>`;
    const sw = (p) => { const c = SCHEMES[p.scheme][p.mode]; return `background:${c.bg};color:${c.ink};--sw:${c.accent}`; };
    return `
    <section class="ed-sect"><h3 class="ui-label">Looks</h3><div class="ed-looks">${Object.entries(PRESETS).map(([id, p]) => `<button type="button" data-tool="decks.apply_theme" data-preset="${id}" title="${esc(id)}"><span class="ed-look" style="${sw(p)}" data-type="${p.type}">Aa<i></i></span><small>${esc(id.replace('_', ' '))}</small></button>`).join('')}</div></section>
    <section class="ed-sect"><h3 class="ui-label">Colours</h3><div class="ed-schemes">${SCHEME_NAMES.map((id) => { const c = SCHEMES[id][t.mode]; return `<button type="button" data-tool="decks.apply_theme" data-k="scheme" data-v="${id}" aria-pressed="${t.scheme === id}" title="${esc(SCHEMES[id].note)}"><span style="background:${c.bg};border-color:${c.line2}"><i style="background:${c.accent}"></i><i style="background:${c.pop[1]}"></i><i style="background:${c.ink}"></i></span><small>${esc(SCHEMES[id].label)}</small></button>`; }).join('')}</div></section>
    ${seg('mode', ['light', 'dark'], t.mode, 'Mode')}
    <section class="ed-sect"><h3 class="ui-label">Faces</h3><select class="ui-select" data-tool="decks.apply_theme" data-k="type" aria-label="Faces">${TYPES.map((x) => `<option value="${x}"${t.type === x ? ' selected' : ''}>${esc({ grotesk: 'Grotesk (Geist)', mono: 'Mono (JetBrains Mono)', editorial: 'Editorial (Fraunces, Source Serif)', humanist: 'Humanist (Instrument Sans)', pixel: 'Pixel (Departure Mono)', system: 'System' }[x])}</option>`).join('')}</select></section>
    ${seg('shape', SHAPES, t.shape, 'Corners')}
    ${seg('surface', SURFACES, t.surface, 'Cards')}
    ${seg('density', DENSITIES, t.density, 'Spacing')}
    <section class="ed-sect"><h3 class="ui-label">Brand</h3><form class="ed-form" data-tool="decks.set_brand">
      <div class="ed-row ed-logo-row">${br.logo ? `<img class="ed-logo" src="${esc(br.logo)}" alt="Logo">` : ''}<input class="ui-input" name="logo" placeholder="Logo image address" value="${esc(br.logo ?? '')}" aria-label="Logo address"><label class="ui-btn is-quiet is-sm" data-tool="decks.set_brand">${ic('upload')}<span>Upload</span><input type="file" accept="image/*" hidden data-tool="decks.set_brand" data-upload="logo"></label></div>
      <div class="ed-row"><label class="ed-color"><span>Accent</span><input type="color" name="accent_pick" value="${esc(br.accent ?? SCHEMES[t.scheme][t.mode].accent)}" aria-label="Accent colour"></label><input class="ui-input" name="accent" placeholder="#rrggbb (empty: the scheme's)" value="${esc(br.accent ?? '')}" aria-label="Accent colour code"></div>
      <input class="ui-input" name="footer" placeholder="Footer, like the company name" value="${esc(br.footer ?? '')}" aria-label="Footer">
      <input class="ui-input" name="display" placeholder="Title font, like Poppins, sans-serif" value="${esc(br.display ?? '')}" aria-label="Title font">
      <input class="ui-input" name="font" placeholder="Body font" value="${esc(br.font ?? '')}" aria-label="Body font">
      <input class="ui-input" name="fonts_href" placeholder="Google Fonts stylesheet address" value="${esc(br.fonts_href ?? '')}" aria-label="Fonts stylesheet">
      <button class="ui-btn is-quiet is-sm" type="submit">Save brand</button></form></section>`;
  }

  function commentsPane() {
    const s = cur();
    const list = E.commentsAll ? E.comments : E.comments.filter((c) => c.slide === s?.id);
    const n = (id) => slides().findIndex((x) => x.id === id) + 1;
    const one = (c, reply = false) => `<div class="ed-cm${c.resolved ? ' is-done' : ''}${reply ? ' is-reply' : ''}" data-cm="${esc(c.id)}">
      <div class="ed-cm-h"><span class="ui-avatar is-xs" data-tone="${tone(c.author.name)}">${esc(initials(c.author.name))}</span><b>${esc(c.author.name)}</b>${c.via && c.via !== 'web' ? `<span class="ui-chip is-soft">via ${esc(c.via === 'mcp' ? 'AI app' : c.via)}</span>` : ''}<small>${ago(c.created_at)}${E.commentsAll && c.slide && !reply ? ` · slide ${n(c.slide)}` : ''}</small></div>
      <p>${esc(c.body)}</p>
      <div class="ed-cm-a">${reply ? '' : `<button type="button" class="ui-btn is-ghost is-sm" data-tool="decks.resolve_comment" data-resolve="${c.resolved ? '0' : '1'}">${c.resolved ? 'Open again' : 'Resolve'}</button>`}${c.author.id === S.settings?.me?.id || ['owner', 'admin'].includes(S.settings?.me?.role) ? '<button type="button" class="ui-btn is-ghost is-sm" data-tool="decks.delete_comment" data-cdel>Delete</button>' : ''}</div>
      ${reply ? '' : `${(c.replies ?? []).map((r) => one(r, true)).join('')}<form class="ed-reply" data-tool="decks.add_comment" data-reply="${esc(c.id)}"><input class="ui-input" name="body" placeholder="Reply" aria-label="Reply" autocomplete="off"></form>`}
    </div>`;
    return `<section class="ed-sect"><div class="ui-seg ed-seg"><button type="button" ${help('shows this slide\'s comments')} data-call="slide" aria-pressed="${!E.commentsAll}">This slide</button><button type="button" ${help('shows every comment')} data-call="all" aria-pressed="${E.commentsAll}">Whole deck</button></div></section>
      <div class="ed-cms">${list.map((c) => one(c)).join('') || '<p class="ed-muted">No comments here yet.</p>'}</div>
      <form class="ed-form ed-cm-new" data-tool="decks.add_comment"><textarea class="ui-textarea" name="body" rows="3" required placeholder="${E.commentsAll ? 'A comment on the deck' : `A comment on slide ${idx() + 1}`}" aria-label="New comment"></textarea><button class="ui-btn is-quiet is-sm" type="submit">Comment</button></form>`;
  }

  function sharePane() {
    const d = deck();
    const sh = E.shares ?? [];
    const view = sh.find((x) => x.kind === 'view'), emb = sh.find((x) => x.kind === 'embed');
    return `
    <section class="ed-sect"><h3 class="ui-label">Present</h3><div class="ed-row"><a ${nav('starts present mode')} class="ui-btn is-accent is-sm" href="#/d/${esc(deckId)}/present?at=${idx()}">${ic('play')}<span>Present</span></a><button type="button" class="ui-btn is-quiet is-sm" ${help('opens presenter view in a new window')} data-presenter>${ic('screen')}<span>Presenter view</span></button></div><p class="ed-muted">Presenter view opens in its own window with your notes, a timer and the next slide; the slides follow it.</p></section>
    <section class="ed-sect"><h3 class="ui-label">View link</h3>${view ? `<div class="ui-copy ed-copy"><code>${esc(view.url)}</code><button type="button" class="ui-btn is-quiet is-sm" ${help('copies the link')} data-copy="${esc(view.url)}">Copy</button></div><div class="ed-row"><small class="ed-muted">${view.views} views. Anyone with the link can look; no account needed.</small><button type="button" class="ui-btn is-ghost is-sm" data-tool="decks.unshare_deck" data-unshare="${esc(view.id)}">Turn off</button></div>` : `<p class="ed-muted">A link anyone can open to look, without an account. They cannot edit.</p><button type="button" class="ui-btn is-quiet is-sm" data-tool="decks.share_deck" data-share="view">${ic('link')}<span>Make a view link</span></button>`}</section>
    <section class="ed-sect"><h3 class="ui-label">Embed</h3>${emb ? `<div class="ui-copy ed-copy"><code>${esc(emb.embed_html)}</code><button type="button" class="ui-btn is-quiet is-sm" ${help('copies the embed code')} data-copy="${esc(emb.embed_html)}">Copy</button></div><div class="ed-row"><small class="ed-muted">Paste it into any web page.</small><button type="button" class="ui-btn is-ghost is-sm" data-tool="decks.unshare_deck" data-unshare="${esc(emb.id)}">Turn off</button></div>` : `<button type="button" class="ui-btn is-quiet is-sm" data-tool="decks.share_deck" data-share="embed">${ic('screen')}<span>Make an embed</span></button>`}</section>
    <section class="ed-sect"><h3 class="ui-label">Export</h3><div class="ed-row ed-wrap"><button type="button" class="ui-btn is-quiet is-sm" data-tool="decks.export_pdf" data-export="pdf">${ic('download')}<span>PDF</span></button><button type="button" class="ui-btn is-quiet is-sm" data-tool="decks.export_pdf" data-export="pdf-notes">${ic('download')}<span>PDF with notes</span></button><button type="button" class="ui-btn is-quiet is-sm" data-tool="decks.export_pptx" data-export="pptx">${ic('pptx')}<span>PowerPoint</span></button></div></section>
    <section class="ed-sect"><h3 class="ui-label">Linked work</h3>
      ${(d.links ?? []).length ? `<div class="ed-links">${d.links.map((l) => `<div class="ed-link"><span class="ui-chip is-soft">${l.kind === 'crm' ? 'CRM' : 'Review'}</span>${l.url ? `<a ${nav('opens the linked record')} href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>` : `<span>${esc(l.label)}</span>`}<button type="button" class="ui-btn is-ghost is-icon is-sm" data-tool="decks.unlink_record" data-unlink="${esc(l.id)}" aria-label="Remove link">${ic('x')}</button></div>`).join('')}</div>` : ''}
      <form class="ed-form" data-tool="decks.link_record"><span class="ed-sub">A deck for a deal: link a CRM record</span><div class="ed-row"><input class="ui-input" name="record" required placeholder="Record id, like d_acme01" aria-label="CRM record id"><input class="ui-input" name="label" placeholder="Label (optional)" aria-label="Label"></div><button class="ui-btn is-quiet is-sm" type="submit">${ic('link')}<span>Link</span></button></form>
      <form class="ed-form" data-tool="decks.request_review"><span class="ed-sub">Ask for a review (a task on the board)</span><div class="ed-row"><input class="ui-input" name="assignee" placeholder="Who reviews" aria-label="Who reviews"><input class="ui-input" name="due" type="date" aria-label="Due"></div><input class="ui-input" name="note" placeholder="What to look at" aria-label="Note"><button class="ui-btn is-quiet is-sm" type="submit">Ask</button></form>
    </section>
    <section class="ed-sect"><h3 class="ui-label">Deck</h3><div class="ed-row ed-wrap"><button type="button" class="ui-btn is-quiet is-sm" data-tool="decks.duplicate_deck" data-dupdeck>${ic('copy')}<span>Duplicate deck</span></button><button type="button" class="ui-btn is-quiet is-sm" data-tool="decks.list_activity" data-activity>${ic('spark')}<span>What changed</span></button></div>
      ${E.activity ? `<ul class="ui-timeline ed-act">${E.activity.map((a) => `<li><b>${esc(a.by ?? 'Someone')}</b> ${esc(actWords(a))}${a.via && a.via !== 'web' ? ` <span class="ui-chip is-soft">${esc(a.via === 'mcp' || a.via === 'rest' ? 'AI app' : a.via)}</span>` : ''}<br><small>${ago(a.at)}</small></li>`).join('')}</ul>` : ''}</section>`;
  }
  const actWords = (a) => ({ 'decks.deck.created': 'made the deck', 'decks.deck.updated': 'changed the deck', 'decks.slide.added': 'added a slide', 'decks.slide.updated': 'changed a slide', 'decks.slide.deleted': 'deleted a slide', 'decks.slide.moved': 'moved slides', 'decks.comment.added': 'commented', 'decks.comment.resolved': 'resolved a comment', 'decks.deck.exported': `exported ${a.data?.as?.toUpperCase?.() ?? ''}`, 'decks.deck.shared': 'shared a link', 'decks.deck.unshared': 'turned off a link', 'decks.deck.linked': 'linked work', 'decks.review.requested': 'asked for a review', 'decks.deck.imported': 'imported it' }[a.type] ?? a.type);

  async function loadShares() { try { E.shares = (await ctx.callTool('decks.list_shares', { deck: deckId })).shares; if (E.tab === 'share') renderPanel(); } catch {} }
  async function loadComments() { try { E.comments = (await ctx.callTool('decks.list_comments', { deck: deckId })).comments; renderList(); renderPanel(); } catch {} }

  // ---------- actions ----------
  const goSlide = (id, { focus = false } = {}) => {
    if (!id) return;
    E.slideId = id; E.blockId = null;
    renderList(); renderCanvas(); renderNotes(); renderPanel(); markPeers(); tellWhere();
    if (focus) $('#ed-canvas [data-edit]', ed)?.focus();
  };
  const step = (d) => { const l = slides(); const i = idx(); goSlide(l[Math.max(0, Math.min(l.length - 1, i + d))]?.id); };

  async function addSlide(layout = 'content') {
    const s = await tool('decks.add_slide', { layout, after: cur() ? idx() + 1 : 0, title: '' });
    goSlide(s.id, { focus: true });
  }
  async function dupSlide() { if (!cur()) return; const s = await tool('decks.duplicate_slide', { slide: E.slideId }); goSlide(s.id); toast('Duplicated.'); }
  async function delSlide() {
    if (!cur()) return;
    const i = idx();
    await tool('decks.delete_slide', { slide: E.slideId });
    E.slideId = slides()[Math.min(i, slides().length - 1)]?.id;
    renderAll();
    toast('Slide deleted.');
  }
  async function moveSlide(d) { if (!cur()) return; const to = idx() + 1 + d; if (to < 1 || to > slides().length) return; await tool('decks.reorder_slides', { slide: E.slideId, to }); renderAll(); }
  async function removeBlock() { if (!E.blockId) return; const b = E.blockId; E.blockId = null; await tool('decks.remove_block', { slide: E.slideId, block: b }); renderAll(); }
  async function present(presenter = false) {
    await sync.flush().catch(() => {});
    if (presenter) { window.open(`${location.pathname}#/d/${deckId}/presenter?at=${idx()}`, `decks-presenter-${deckId}`, 'width=1200,height=760'); S.go(`/d/${deckId}/present?at=${idx()}`); }
    else S.go(`/d/${deckId}/present?at=${idx()}`);
  }

  // Clicks.
  ed.addEventListener('click', async (e) => {
    const t = e.target;
    const tab = t.closest('[data-tab]');
    if (tab) { E.tab = tab.dataset.tab; if (mobile()) setSheet(true); return renderPanel(); }
    if (t.closest('[data-open=sheet]')) return setSheet(!E.sheet);
    if (t.closest('[data-open=keys]')) return keysDialog();
    const go = t.closest('[data-go]');
    if (go) { goSlide(go.dataset.go); if (mobile()) setSheet(false); return; }
    if (t.closest('[data-add-slide]')) return addSlide().catch(() => {});
    const blk = t.closest('#ed-canvas .dk-block');
    if (blk) { if (E.blockId !== blk.dataset.block) { E.blockId = blk.dataset.block; for (const x of $$('#ed-canvas .dk-block', ed)) x.classList.toggle('is-sel', x === blk); renderPanel(); tellWhere(); } return; }
    if (t.closest('#ed-canvas') && E.blockId) { E.blockId = null; for (const x of $$('#ed-canvas .dk-block', ed)) x.classList.remove('is-sel'); renderPanel(); tellWhere(); return; }
    const b = t.closest('button[data-tool], [data-presenter], [data-copy], [data-call]');
    if (!b || b.disabled) return;
    try {
      const s = cur();
      if (b.dataset.layout) await tool('decks.set_slide_content', { slide: s.id, layout: b.dataset.layout });
      else if (b.dataset.bg) await tool('decks.set_slide_content', { slide: s.id, bg: b.dataset.bg });
      else if (b.hasAttribute('data-hide')) await tool('decks.set_slide_content', { slide: s.id, hidden: !s.hidden });
      else if (b.dataset.add) {
        const slot = $('#ed-slot', ed)?.value;
        const nb = await tool('decks.add_block', { slide: s.id, block: { ...BLOCKS[b.dataset.add].example }, ...(slot ? { slot } : {}) });
        E.blockId = nb.id;
      }
      else if (b.dataset.move) await moveSlide(Number(b.dataset.move));
      else if (b.hasAttribute('data-dup')) await dupSlide();
      else if (b.hasAttribute('data-del-slide')) await delSlide();
      else if (b.dataset.bmove) { const pos = s.blocks.findIndex((x) => x.id === E.blockId); await tool('decks.move_block', { slide: s.id, block: E.blockId, to: pos + 1 + Number(b.dataset.bmove) }); }
      else if (b.dataset.bslot) await tool('decks.move_block', { slide: s.id, block: E.blockId, slot: b.dataset.bslot });
      else if (b.hasAttribute('data-bdel')) await removeBlock();
      else if (b.dataset.preset) await tool('decks.apply_theme', { preset: b.dataset.preset });
      else if (b.dataset.k && b.tagName === 'BUTTON') await tool('decks.apply_theme', { [b.dataset.k]: b.dataset.v });
      else if (b.dataset.call) { E.commentsAll = b.dataset.call === 'all'; renderPanel(); return; }
      else if (b.dataset.resolve) { await ctx.callTool('decks.resolve_comment', { comment: b.closest('[data-cm]').dataset.cm, resolved: b.dataset.resolve === '1' }); await loadComments(); }
      else if (b.hasAttribute('data-cdel')) { if (!confirm('Delete this comment?')) return; await ctx.callTool('decks.delete_comment', { comment: b.closest('[data-cm]').dataset.cm }); await loadComments(); }
      else if (b.dataset.share) { const r = await tool('decks.share_deck', { kind: b.dataset.share }); if (!r.pending) { E.shares = null; await loadShares(); copyText(r.url).catch(() => {}); toast(r.kind === 'embed' ? 'Embed made.' : 'Link made and copied.'); } }
      else if (b.dataset.unshare) { await tool('decks.unshare_deck', { share: b.dataset.unshare }); E.shares = null; await loadShares(); toast('Link turned off.'); }
      else if (b.dataset.copy) { await copyText(b.dataset.copy); toast('Copied.'); }
      else if (b.dataset.export) {
        const label = b.dataset.export === 'pptx' ? 'PowerPoint' : 'PDF';
        toast(`Making the ${label}…`);
        b.disabled = true;
        try {
          const r = b.dataset.export === 'pptx' ? await tool('decks.export_pptx', {}) : await tool('decks.export_pdf', { with_notes: b.dataset.export === 'pdf-notes' });
          download(r.file.url);
          toast(`${label} ready. <a href="${esc(r.file.url)}" ${nav('downloads the file')}>Download again</a>`);
        } finally { b.disabled = false; }
      }
      else if (b.dataset.unlink) await tool('decks.unlink_record', { link: b.dataset.unlink });
      else if (b.hasAttribute('data-dupdeck')) { const n = await tool('decks.duplicate_deck', {}); toast(`Made ${esc(n.title)}.`); S.go(`/d/${n.id}`); return; }
      else if (b.hasAttribute('data-activity')) { E.activity = (await ctx.callTool('decks.list_activity', { deck: deckId, limit: 30 })).activity; }
      else if (b.hasAttribute('data-presenter')) return present(true);
      renderAll();
    } catch { /* the tool already said why */ }
  });

  // Forms.
  ed.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const f = new FormData(form);
    const s = cur();
    try {
      switch (form.dataset.tool) {
        case 'decks.update_deck': { const title = String(f.get('title') ?? '').trim(); if (title && title !== deck().title) await tool('decks.update_deck', { title }); form.querySelector('input').blur(); break; }
        case 'decks.update_block': await tool('decks.update_block', { slide: s.id, block: form.dataset.block, set: readBlockForm(form) }); break;
        case 'decks.add_image': await tool('decks.add_image', { slide: s.id, url: f.get('url'), alt: f.get('alt') || undefined, fit: f.get('fit') || undefined, as: 'slide' }); break;
        case 'decks.set_brand': {
          const set = {};
          for (const k of ['logo', 'accent', 'footer', 'display', 'font', 'fonts_href']) set[k] = String(f.get(k) ?? '').trim();
          if (set.accent && !/^#[0-9a-f]{6}$/i.test(set.accent)) { toast('The accent needs to look like #1a2b3c.'); return; }
          await tool('decks.set_brand', set);
          toast('Brand saved.');
          break;
        }
        case 'decks.add_comment': {
          const body = String(f.get('body') ?? '').trim();
          if (!body) return;
          if (form.dataset.reply) await ctx.callTool('decks.add_comment', { deck: deckId, reply_to: form.dataset.reply, body });
          else await ctx.callTool('decks.add_comment', { deck: deckId, ...(E.commentsAll ? {} : { slide: s?.id }), ...(E.blockId && !E.commentsAll ? { block: E.blockId } : {}), body });
          form.reset();
          await loadComments();
          return;
        }
        case 'decks.link_record': { await tool('decks.link_record', { record: f.get('record'), label: f.get('label') || undefined }); toast('Linked.'); break; }
        case 'decks.request_review': { const r = await tool('decks.request_review', { assignee: f.get('assignee') || undefined, due: f.get('due') || undefined, note: f.get('note') || undefined }); toast(esc(r.note)); await loadComments(); break; }
      }
      form.blur?.();
      renderAll();
    } catch { /* said */ }
  });

  // Inputs that act on change.
  ed.addEventListener('change', async (e) => {
    const t = e.target;
    try {
      if (t.matches('select[data-k]')) { await tool('decks.apply_theme', { [t.dataset.k]: t.value }); renderAll(); }
      else if (t.matches('[name=accent_pick]')) { t.form.accent.value = t.value; }
      else if (t.matches('input[type=file][data-upload]')) {
        const file = t.files[0];
        if (!file) return;
        toast('Uploading…');
        const up = await ctx.upload(file);
        if (t.dataset.upload === 'slide') await tool('decks.add_image', { slide: E.slideId, file: up.id, as: 'slide', alt: file.name.replace(/\.\w+$/, '') });
        else if (t.dataset.upload === 'block') await tool('decks.update_block', { slide: E.slideId, block: E.blockId, set: { url: up.url } });
        else if (t.dataset.upload === 'logo') await tool('decks.set_brand', { logo: up.url });
        toast('Uploaded.');
        renderAll();
      }
    } catch (err) { toast(esc(err.message)); }
  });

  // Typing on the slide and in the notes: straight into the live copy.
  ed.addEventListener('input', (e) => {
    const t = e.target.closest('[data-edit]');
    if (!t) return;
    const s = cur();
    if (!s) return;
    const text = t.textContent.replace(/ /g, ' ');
    sync.local((doc) => { const f = findSlide(doc, s.id); if (f) setPath(f.m, t.dataset.edit, text); });
    clearTimeout(E.thumbT);
    E.thumbT = setTimeout(() => { if (!ed.contains(document.activeElement) || !document.activeElement.matches('[data-edit]')) return; const th = $(`.ed-thumb[data-slide="${CSS.escape(s.id)}"] .ed-thumb-b`, ed); if (th) { th.innerHTML = slideBox(cur(), deck(), { cls: 'is-thumb', number: idx() + 1 }); fitAll(th); } }, 500);
  });
  ed.addEventListener('focusin', (e) => {
    const t = e.target.closest('#ed-canvas [data-edit]');
    if (t) { const b = t.closest('.dk-block'); const id = b?.dataset.block ?? null; if (id !== E.blockId) { E.blockId = id; for (const x of $$('#ed-canvas .dk-block', ed)) x.classList.toggle('is-sel', x === b); renderPanel(); } tellWhere(); }
  });
  ed.addEventListener('focusout', (e) => { if (e.target.matches('[data-edit]')) { sync.flush().catch(() => {}); setTimeout(() => { if (!ed.contains(document.activeElement)) schedule(); }, 50); } if (e.target.matches('.ed-title-i')) e.target.form.requestSubmit(); });

  // Drag a slide in the list to move it.
  const list = $('#ed-list', ed);
  let dragId = null;
  list.addEventListener('dragstart', (e) => { const th = e.target.closest('.ed-thumb'); if (!th) return; dragId = th.dataset.slide; e.dataTransfer.effectAllowed = 'move'; th.classList.add('is-dragging'); });
  list.addEventListener('dragover', (e) => { if (!dragId) return; e.preventDefault(); const th = e.target.closest('.ed-thumb'); for (const x of $$('.ed-thumb', list)) x.classList.toggle('is-drop', x === th && th.dataset.slide !== dragId); });
  list.addEventListener('dragend', () => { dragId = null; for (const x of $$('.ed-thumb', list)) x.classList.remove('is-drop', 'is-dragging'); });
  list.addEventListener('drop', async (e) => {
    e.preventDefault();
    const th = e.target.closest('.ed-thumb');
    if (!th || !dragId || th.dataset.slide === dragId) return;
    const to = slides().findIndex((s) => s.id === th.dataset.slide) + 1;
    const id = dragId; dragId = null;
    try { await tool('decks.reorder_slides', { slide: id, to }); E.slideId = id; renderAll(); } catch {}
  });

  // ---------- keys ----------
  const typing = (t) => t.closest('input,textarea,select,[contenteditable]');
  function onKey(e) {
    if ($('dialog[open]', S.el)) return;
    const t = e.target;
    if (mod(e) && e.key.toLowerCase() === 'k') { e.preventDefault(); return palette(); }
    if (mod(e) && e.key === 'Enter') { e.preventDefault(); return present(); }
    if (typing(t)) {
      if (e.key === 'Escape') { t.blur(); E.blockId = null; renderPanel(); $('#ed-list', ed).focus(); }
      if (e.key === 'Enter' && t.matches('[data-edit]') && !t.dataset.multi) { e.preventDefault(); t.blur(); }
      return;
    }
    if (mod(e) && e.key.toLowerCase() === 'd') { e.preventDefault(); return dupSlide().catch(() => {}); }
    if (e.metaKey || e.ctrlKey) return;
    const k = e.key;
    if (e.altKey && (k === 'ArrowUp' || k === 'ArrowDown')) { e.preventDefault(); return moveSlide(k === 'ArrowUp' ? -1 : 1).catch(() => {}); }
    if (['ArrowDown', 'ArrowRight', 'j', 'PageDown'].includes(k)) { e.preventDefault(); return step(1); }
    if (['ArrowUp', 'ArrowLeft', 'k', 'PageUp'].includes(k)) { e.preventDefault(); return step(-1); }
    if (k === 'Home') return goSlide(slides()[0]?.id);
    if (k === 'End') return goSlide(slides().at(-1)?.id);
    if (k === 'n') { e.preventDefault(); return addSlide().catch(() => {}); }
    if (k === 'Enter') { e.preventDefault(); const el = E.blockId ? $(`#ed-canvas [data-block="${CSS.escape(E.blockId)}"] [data-edit]`, ed) : $('#ed-canvas [data-edit]', ed); el?.focus(); return; }
    if ((k === 'Delete' || k === 'Backspace') && e.shiftKey) { e.preventDefault(); if (confirm('Delete this slide?')) delSlide().catch(() => {}); return; }
    if ((k === 'Delete' || k === 'Backspace') && E.blockId) { e.preventDefault(); return removeBlock().catch(() => {}); }
    if (k === 'Escape') { E.blockId = null; for (const x of $$('#ed-canvas .dk-block', ed)) x.classList.remove('is-sel'); renderPanel(); return; }
    if (k === 'p') { e.preventDefault(); return present(); }
    if (k === 'P') { e.preventDefault(); return present(true); }
    const tabs = { l: 'slide', t: 'theme', c: 'comments', s: 'share' };
    if (tabs[k]) { E.tab = tabs[k]; renderPanel(); return; }
    if (k === '[' || k === ']') { const b = slides().find((x) => x.id === E.slideId)?.blocks ?? []; const i = b.findIndex((x) => x.id === E.blockId); const nb = b[k === ']' ? i + 1 : Math.max(0, i - 1)] ?? b[0]; if (nb) { E.blockId = nb.id; renderCanvas(); renderPanel(); } return; }
    if (k === '?') return keysDialog();
  }
  document.addEventListener('keydown', onKey);

  const mac = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+');
  const KEYS = () => [
    ['↑ ↓ or j k', 'Previous and next slide'], ['n', 'New slide'], [`${mac()}D`, 'Duplicate slide'], ['Alt+↑ Alt+↓', 'Move slide'], ['Shift+Delete', 'Delete slide'],
    ['Enter', 'Edit the words on the slide'], ['Esc', 'Stop editing'], ['[ ]', 'Previous and next block'], ['Delete', 'Remove the chosen block'],
    ['l t c s', 'Slide, theme, comments, share panels'], ['p', 'Present'], ['Shift+P', 'Presenter view'], [`${mac()}K`, 'Every action'], ['?', 'These keys'],
  ];
  function keysDialog() {
    dialog(S.el, `<div class="dlg"><header class="dlg-h"><h2>Keys</h2><button type="button" class="ui-btn is-ghost is-icon is-sm" data-close ${help('closes the list')} aria-label="Close">${ic('x')}</button></header><dl class="ed-keys">${KEYS().map(([k, v]) => `<dt><kbd class="ui-kbd">${esc(k)}</kbd></dt><dd>${esc(v)}</dd>`).join('')}</dl></div>`);
  }

  // Cmd+K: every action on this screen, found by typing.
  function palette() {
    const acts = [
      ['New slide', 'decks.add_slide', () => addSlide()],
      ...LAYOUT_NAMES.map((l) => [`New ${LAYOUTS[l].label.toLowerCase()} slide`, 'decks.add_slide', () => addSlide(l)]),
      ['Duplicate slide', 'decks.duplicate_slide', dupSlide], ['Delete slide', 'decks.delete_slide', delSlide],
      ['Move slide up', 'decks.reorder_slides', () => moveSlide(-1)], ['Move slide down', 'decks.reorder_slides', () => moveSlide(1)],
      ...LAYOUT_NAMES.map((l) => [`Layout: ${LAYOUTS[l].label}`, 'decks.set_slide_content', () => tool('decks.set_slide_content', { slide: E.slideId, layout: l })]),
      ...BLOCK_TYPES.map((t) => [`Add block: ${BLOCKS[t].label}`, 'decks.add_block', () => tool('decks.add_block', { slide: E.slideId, block: { ...BLOCKS[t].example } })]),
      ...Object.keys(PRESETS).map((p) => [`Look: ${p.replace('_', ' ')}`, 'decks.apply_theme', () => tool('decks.apply_theme', { preset: p })]),
      ...SCHEME_NAMES.map((id) => [`Colours: ${SCHEMES[id].label}`, 'decks.apply_theme', () => tool('decks.apply_theme', { scheme: id })]),
      ['Light mode', 'decks.apply_theme', () => tool('decks.apply_theme', { mode: 'light' })], ['Dark mode', 'decks.apply_theme', () => tool('decks.apply_theme', { mode: 'dark' })],
      ['Export PDF', 'decks.export_pdf', async () => download((await tool('decks.export_pdf', {})).file.url)],
      ['Export PowerPoint', 'decks.export_pptx', async () => download((await tool('decks.export_pptx', {})).file.url)],
      ['Make a view link', 'decks.share_deck', async () => { const r = await tool('decks.share_deck', { kind: 'view' }); if (r.url) { await copyText(r.url); toast('Link copied.'); } }],
      ['Present', 'none', () => present()], ['Presenter view', 'none', () => present(true)],
      ['Duplicate deck', 'decks.duplicate_deck', async () => { const n = await tool('decks.duplicate_deck', {}); S.go(`/d/${n.id}`); }],
    ];
    const d = dialog(S.el, `<div class="dlg pal"><input class="ui-input pal-q" placeholder="Type an action" aria-label="Find an action" autocomplete="off"><div class="pal-l" role="listbox"></div></div>`, { wide: true });
    const q = $('.pal-q', d), l = $('.pal-l', d);
    let sel = 0, shown = acts;
    const draw = () => {
      const w = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      shown = acts.filter(([n]) => w.every((x) => n.toLowerCase().includes(x))).slice(0, 12);
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      l.innerHTML = shown.map(([n, tl], i) => `<button type="button" role="option" class="pal-i" data-i="${i}" aria-selected="${i === sel}" ${tl === 'none' ? help('starts present mode') : `data-tool="${tl}"`}>${esc(n)}</button>`).join('') || '<p class="ed-muted">Nothing matches.</p>';
    };
    const run = async (i) => { const a = shown[i]; if (!a) return; d.close(); try { await a[2](); renderAll(); } catch {} };
    q.addEventListener('input', () => { sel = 0; draw(); });
    q.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); draw(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
      if (e.key === 'Enter') { e.preventDefault(); run(sel); }
    });
    l.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) run(Number(b.dataset.i)); });
    draw();
    q.focus();
  }

  function setSheet(on) { E.sheet = on; $('#ed-panel', ed).classList.toggle('is-open', on); }

  // ---------- start ----------
  renderAll();
  loadComments();
  tellWhere();
  window.decksEditor = { sync, E };
  return {
    unmount() {
      E.gone = true;
      sync.flush().catch(() => {});
      live?.close(); offSuite?.(); clearInterval(poll);
      document.removeEventListener('keydown', onKey);
    },
  };
}

// The caret as a count of characters from the start of el, and back.
function caretOffset(el) {
  const s = getSelection();
  if (!s.rangeCount || !el.contains(s.anchorNode)) return null;
  const r = s.getRangeAt(0).cloneRange();
  r.selectNodeContents(el);
  r.setEnd(s.anchorNode, s.anchorOffset);
  return r.toString().length;
}
function setCaret(el, off) {
  if (off == null) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n, left = off;
  while ((n = walker.nextNode())) {
    if (left <= n.length) { const r = document.createRange(); r.setStart(n, left); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return; }
    left -= n.length;
  }
}
