// A deck is a Yjs document, so several people (and agents) can edit it at once and every change
// merges. The same code runs on the server (tools change the document) and in the browser (the
// editor types into its copy and sends the changes back through the decks.sync_doc tool).
//
//   doc.getMap('deck')    title (Y.Text), description, theme, brand, links, aspect
//   doc.getArray('slides') one Y.Map per slide: id, layout, bg, hidden, image,
//                          kicker, title, subtitle, notes (Y.Text), blocks (Y.Array of Y.Map)
//   a block Y.Map          id, t, slot, its text fields as Y.Text, the rest as plain values
import * as Y from 'yjs';
import { normalBlock, normalImage, TEXT_FIELDS, SLIDE_TEXT, LAYOUTS, BACKGROUNDS, slotFor } from './layouts.mjs';
import { normalTheme } from './themes.mjs';

export { Y };

let counter = 0;
export function shortId(prefix) {
  counter = (counter + 1) % 1296;
  const rand = typeof crypto !== 'undefined' && crypto.getRandomValues ? Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 6) : Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36).slice(-5)}${counter.toString(36).padStart(2, '0')}${rand}`;
}

// The smallest change that turns a Y.Text into a new string: keep the common start and end, so
// someone typing elsewhere in the same text keeps their letters.
export function setText(yt, next) {
  next = String(next ?? '');
  const cur = yt.toString();
  if (cur === next) return;
  let a = 0;
  while (a < cur.length && a < next.length && cur[a] === next[a]) a++;
  let b = 0;
  while (b < cur.length - a && b < next.length - a && cur[cur.length - 1 - b] === next[next.length - 1 - b]) b++;
  if (cur.length - a - b > 0) yt.delete(a, cur.length - a - b);
  const ins = next.slice(a, next.length - b);
  if (ins) yt.insert(a, ins);
}

const ytext = (s) => { const t = new Y.Text(); if (s) t.insert(0, String(s)); return t; };

export function blockToY(b) {
  const m = new Y.Map();
  const texts = TEXT_FIELDS[b.t] ?? [];
  for (const [k, v] of Object.entries(b)) {
    if (v === undefined) continue;
    m.set(k, texts.includes(k) ? ytext(v) : v);
  }
  for (const k of texts) if (b[k] === undefined) m.set(k, ytext(''));
  return m;
}

export function blockFromY(m) {
  const o = {};
  if (!(m instanceof Y.Map)) return null;
  for (const [k, v] of m.entries()) o[k] = v instanceof Y.Text ? v.toString() : v;
  return o.id && o.t ? o : null;
}

export function slideToY(s) {
  const m = new Y.Map();
  m.set('id', s.id);
  m.set('layout', LAYOUTS[s.layout] ? s.layout : 'content');
  m.set('bg', BACKGROUNDS.includes(s.bg) ? s.bg : 'default');
  m.set('hidden', !!s.hidden);
  m.set('image', normalImage(s.image));
  for (const k of SLIDE_TEXT) m.set(k, ytext(s[k] ?? ''));
  const blocks = new Y.Array();
  blocks.push((s.blocks ?? []).map((b) => blockToY(b)));
  m.set('blocks', blocks);
  return m;
}

export function slideFromY(m) {
  if (!(m instanceof Y.Map)) return null;
  const s = { id: m.get('id'), layout: m.get('layout') ?? 'content', bg: m.get('bg') ?? 'default', hidden: !!m.get('hidden'), image: m.get('image') ?? null };
  for (const k of SLIDE_TEXT) { const v = m.get(k); s[k] = v instanceof Y.Text ? v.toString() : String(v ?? ''); }
  const bl = m.get('blocks');
  s.blocks = bl instanceof Y.Array ? bl.toArray().map(blockFromY).filter(Boolean) : [];
  return s.id ? s : null;
}

export function deckFromDoc(doc) {
  const d = doc.getMap('deck');
  const title = d.get('title');
  return {
    title: title instanceof Y.Text ? title.toString() : String(title ?? ''),
    description: String(d.get('description') ?? ''),
    theme: normalTheme(d.get('theme') ?? {}),
    brand: d.get('brand') ?? {},
    links: d.get('links') ?? [],
    slides: doc.getArray('slides').toArray().map(slideFromY).filter(Boolean),
  };
}

// A new document from a deck description (create, duplicate, import, examples).
export function newDoc({ title = 'Untitled deck', description = '', theme = {}, brand = {}, slides = [] } = {}) {
  const doc = new Y.Doc();
  doc.transact(() => {
    const d = doc.getMap('deck');
    d.set('title', ytext(title));
    d.set('description', description);
    d.set('theme', normalTheme(theme));
    d.set('brand', brand ?? {});
    d.set('links', []);
    doc.getArray('slides').push(slides.map((s) => slideToY(normalSlide(s))));
  });
  return doc;
}

// A slide as given by a person or an agent, cleaned and with ids.
export function normalSlide(s = {}) {
  const layout = LAYOUTS[s.layout] ? s.layout : 'content';
  const out = { id: s.id ?? shortId('s'), layout, bg: BACKGROUNDS.includes(s.bg) ? s.bg : 'default', hidden: !!s.hidden, image: normalImage(s.image) };
  for (const k of SLIDE_TEXT) out[k] = String(s[k] ?? '').slice(0, k === 'notes' ? 20000 : 600);
  out.blocks = (s.blocks ?? []).slice(0, 12).map((b) => { const nb = normalBlock(b, shortId('b')); nb.slot = slotFor(layout, b.slot); return nb; });
  return out;
}

// ---------- finding things ----------

export function slidesArr(doc) { return doc.getArray('slides'); }

export function findSlide(doc, ref) {
  const arr = slidesArr(doc).toArray();
  if (ref == null || ref === '') return null;
  let i = arr.findIndex((m) => m.get('id') === ref);
  // slides can also be named by their number, 1 being the first
  if (i < 0 && /^\d+$/.test(String(ref))) i = Number(ref) - 1;
  if (i < 0 || i >= arr.length) return null;
  return { m: arr[i], index: i };
}

export function findBlock(slideMap, ref) {
  const bl = slideMap.get('blocks');
  const arr = bl.toArray();
  let i = arr.findIndex((m) => m.get('id') === ref);
  if (i < 0 && /^\d+$/.test(String(ref))) i = Number(ref) - 1;
  if (i < 0 || i >= arr.length) return null;
  return { m: arr[i], index: i, list: bl };
}

// ---------- changes (always inside doc.transact) ----------

export function setSlideFields(m, patch) {
  if (patch.layout && LAYOUTS[patch.layout] && patch.layout !== m.get('layout')) {
    m.set('layout', patch.layout);
    // blocks keep their place if the new layout has it, otherwise move to its first slot
    for (const b of m.get('blocks').toArray()) { const s = slotFor(patch.layout, b.get('slot')); if (s !== b.get('slot')) b.set('slot', s); }
  }
  if (patch.bg && BACKGROUNDS.includes(patch.bg)) m.set('bg', patch.bg);
  if (patch.hidden != null) m.set('hidden', !!patch.hidden);
  if (patch.image !== undefined) m.set('image', normalImage(patch.image));
  for (const k of SLIDE_TEXT) if (patch[k] != null) setText(m.get(k), String(patch[k]).slice(0, k === 'notes' ? 20000 : 600));
  if (patch.blocks) {
    const layout = m.get('layout');
    const bl = m.get('blocks');
    bl.delete(0, bl.length);
    bl.push(patch.blocks.slice(0, 12).map((b) => { const nb = normalBlock(b, shortId('b')); nb.slot = slotFor(layout, b.slot); return blockToY(nb); }));
  }
}

export function setBlockFields(bm, patch) {
  const cur = blockFromY(bm);
  const merged = normalBlock({ ...cur, ...patch, t: cur.t, id: cur.id });
  const texts = TEXT_FIELDS[cur.t] ?? [];
  for (const [k, v] of Object.entries(merged)) {
    if (k === 'id' || k === 't') continue;
    if (texts.includes(k)) setText(bm.get(k), v);
    else if (JSON.stringify(bm.get(k)) !== JSON.stringify(v)) bm.set(k, v);
  }
  for (const k of [...bm.keys()]) if (!(k in merged)) bm.delete(k);
}

// The editor writes one field by its path: "title", "b:<block>:text", "b:<block>:items.2.label".
export function setPath(slideMap, path, value) {
  if (SLIDE_TEXT.includes(path)) return setText(slideMap.get(path), value);
  const m = /^b:([^:]+):(.+)$/.exec(path);
  if (!m) return;
  const f = findBlock(slideMap, m[1]);
  if (!f) return;
  const bm = f.m;
  const [key, ...rest] = m[2].split('.');
  const t = bm.get('t');
  if (!rest.length) {
    const v = bm.get(key);
    if (v instanceof Y.Text) return setText(v, value);
    return bm.set(key, String(value));
  }
  const copy = structuredClone(bm.get(key) ?? []);
  let o = copy;
  for (let i = 0; i < rest.length - 1; i++) { o[rest[i]] ??= {}; o = o[rest[i]]; }
  o[rest.at(-1)] = String(value);
  // keep the block's own shape (a stat's value stays a string, a table cell stays in its row)
  const nb = normalBlock({ ...blockFromY(bm), [key]: copy, t });
  bm.set(key, nb[key]);
}

export function moveInArray(yarr, from, to, clone) {
  to = Math.max(0, Math.min(to, yarr.length - 1));
  if (from === to) return;
  const copy = clone(yarr.get(from));
  yarr.delete(from, 1);
  yarr.insert(to, [copy]);
}

// Y.Map.toJSON turns Y.Text into strings, which is what slideToY and blockToY expect back.
export const slideJsonToY = (j) => slideToY({ ...j, blocks: (j.blocks ?? []).map((b) => b) });

export function cloneSlideY(m, newId = shortId('s')) {
  const s = slideFromY(m);
  return slideToY({ ...s, id: newId, blocks: s.blocks.map((b) => ({ ...b, id: shortId('b') })) });
}

export const b64 = {
  enc: (u8) => {
    if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  },
  dec: (s) => (typeof Buffer !== 'undefined' ? new Uint8Array(Buffer.from(s, 'base64')) : Uint8Array.from(atob(s), (c) => c.charCodeAt(0))),
};
