// Slide layouts and block types: the vocabulary people and agents build decks with.
// Shared by the server (tool schemas, exports) and the browser (editor).

export const LAYOUTS = {
  title: { label: 'Title', fields: ['kicker', 'title', 'subtitle'], slots: ['main'], about: 'The opening slide: a big title, a line under it, the logo. Optional small blocks below (a button, three stats).' },
  section: { label: 'Section', fields: ['kicker', 'title', 'subtitle'], slots: [], about: 'Starts a new part of the talk. Big words on the accent colour.' },
  content: { label: 'Title and content', fields: ['kicker', 'title', 'subtitle'], slots: ['main'], about: 'A title, an optional lede, and any blocks: text, bullets, stats, cards, a table, a chart.' },
  two_column: { label: 'Two columns', fields: ['kicker', 'title'], slots: ['left', 'right'], about: 'A title over two columns of blocks. Good for before and after, problem and fix, text beside a chart.' },
  image_left: { label: 'Image left', fields: ['kicker', 'title', 'subtitle'], slots: ['main'], image: true, about: 'A picture filling the left half, words and blocks on the right.' },
  image_right: { label: 'Image right', fields: ['kicker', 'title', 'subtitle'], slots: ['main'], image: true, about: 'Words and blocks on the left, a picture filling the right half.' },
  full_image: { label: 'Full image', fields: ['kicker', 'title', 'subtitle'], slots: [], image: true, about: 'A picture across the whole slide with the title over it.' },
  big_number: { label: 'Big number', fields: ['kicker', 'title', 'subtitle'], slots: ['main'], about: 'One number as the title, very large, with what it means under it.' },
  quote: { label: 'Quote', fields: ['kicker', 'title', 'subtitle'], slots: [], about: 'The title is the quote, the subtitle says who said it.' },
  closing: { label: 'Closing', fields: ['kicker', 'title', 'subtitle'], slots: ['main'], about: 'The last slide: the ask or thank you, and how to reach you.' },
  blank: { label: 'Blank', fields: [], slots: ['main'], about: 'Only blocks, no title.' },
};
export const LAYOUT_NAMES = Object.keys(LAYOUTS);

export const BACKGROUNDS = ['default', 'alt', 'accent', 'inverse'];

// Each block type: what it holds. Text fields marked text: true merge letter by letter when two
// people type at once; the rest are replaced whole.
export const BLOCKS = {
  text: { label: 'Text', fields: { text: 'Words. A blank line starts a new paragraph. **bold** works.', size: 'lg, md (default) or sm' }, text: ['text'], example: { t: 'text', text: 'We grew 40% this year without adding staff.' } },
  heading: { label: 'Heading', fields: { text: 'A short heading inside the slide' }, text: ['text'], example: { t: 'heading', text: 'What changed' } },
  bullets: { label: 'Bullets', fields: { items: 'A list of short lines', numbered: 'true for 1, 2, 3' }, example: { t: 'bullets', items: ['First point', 'Second point'] } },
  quote: { label: 'Quote', fields: { text: 'The quote', by: 'Who said it' }, text: ['text', 'by'], example: { t: 'quote', text: 'It paid for itself in a month.', by: 'Sam, office manager' } },
  stats: { label: 'Stats', fields: { items: '[{ value, label, note }]: two to four numbers that matter' }, example: { t: 'stats', items: [{ value: '$1.2M', label: 'Revenue' }, { value: '38%', label: 'Growth' }] } },
  cards: { label: 'Cards', fields: { items: '[{ title, text, tag }]: two to four cards' }, example: { t: 'cards', items: [{ title: 'Fast', text: 'Same-day answers', tag: 'New' }] } },
  table: { label: 'Table', fields: { head: 'Column names', rows: 'Rows, each a list of cells' }, example: { t: 'table', head: ['Plan', 'Price'], rows: [['Basic', '$10'], ['Team', '$40']] } },
  chart: { label: 'Chart', fields: { kind: 'column (default), bar, line, area or donut', labels: 'The category or time labels', series: '[{ name, values }]: one or more series of numbers, one value per label', unit: 'A prefix or suffix like $ or %', title: 'Optional title over the chart' }, example: { t: 'chart', kind: 'column', labels: ['Q1', 'Q2', 'Q3'], series: [{ name: 'Revenue', values: [120, 180, 240] }], unit: '$k' } },
  image: { label: 'Image', fields: { url: 'An https address, or a file url from decks.upload_file', alt: 'What the image shows', fit: 'cover (fill, default) or contain (whole image)', caption: 'Optional line under it' }, example: { t: 'image', url: 'https://images.example/photo.jpg', alt: 'The team' } },
  steps: { label: 'Steps', fields: { items: '[{ title, text }]: a numbered process' }, example: { t: 'steps', items: [{ title: 'Book', text: 'Online in a minute' }] } },
  timeline: { label: 'Timeline', fields: { items: '[{ when, title, text }]' }, example: { t: 'timeline', items: [{ when: 'Q1', title: 'Launch', text: 'Two clinics' }] } },
  checklist: { label: 'Checklist', fields: { items: '[{ text, done }]' }, example: { t: 'checklist', items: [{ text: 'Signed lease', done: true }] } },
  callout: { label: 'Callout', fields: { text: 'One line to stand out', tone: 'info (default), good or warn' }, text: ['text'], example: { t: 'callout', text: 'We are raising $2M to open three more clinics.' } },
  chat: { label: 'Agent answer', fields: { prompt: 'What someone asked', answer: 'The answer', tools: '[{ name, arg, out }]: tool calls shown as steps' }, text: ['prompt', 'answer'], example: { t: 'chat', prompt: 'Which patients are overdue?', answer: '14 patients, mostly cleanings.', tools: [{ name: 'crm.find', arg: 'overdue recall', out: '14 found' }] } },
  score: { label: 'Score', fields: { grade: 'A number out of 100', title: 'What it scores', areas: '[{ label, value }]' }, example: { t: 'score', grade: 86, title: 'Patient experience', areas: [{ label: 'Booking', value: 92 }] } },
  kv: { label: 'Facts', fields: { items: '[{ label, value }]: label and value pairs' }, example: { t: 'kv', items: [{ label: 'Founded', value: '2019' }] } },
  button: { label: 'Button', fields: { text: 'What it says', url: 'Where it goes' }, text: ['text'], example: { t: 'button', text: 'Book a call', url: 'https://acme-dental.example/book' } },
};
export const BLOCK_TYPES = Object.keys(BLOCKS);
export const TEXT_FIELDS = Object.fromEntries(BLOCK_TYPES.map((t) => [t, BLOCKS[t].text ?? []]));
export const SLIDE_TEXT = ['kicker', 'title', 'subtitle', 'notes'];

const str = (v, max = 4000) => (v == null ? '' : String(v)).slice(0, max);
const arr = (v, max = 60) => (Array.isArray(v) ? v.slice(0, max) : []);
const num = (v) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.+-eE]/g, '')); return Number.isFinite(n) ? n : 0; };
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

// One block, cleaned: unknown fields dropped, every field the right shape. Throws on an unknown type.
export function normalBlock(b, id) {
  const t = String(b?.t ?? b?.type ?? '');
  if (!BLOCKS[t]) throw new Error(`Unknown block type "${t}". Use one of: ${BLOCK_TYPES.join(', ')}.`);
  const o = { id: b.id ?? id, t };
  if (b.slot) o.slot = String(b.slot);
  switch (t) {
    case 'text': o.text = str(b.text); if (['lg', 'md', 'sm'].includes(b.size)) o.size = b.size; break;
    case 'heading': o.text = str(b.text, 300); break;
    case 'bullets': o.items = arr(b.items, 30).map((x) => str(typeof x === 'object' ? x?.text : x, 500)); if (b.numbered) o.numbered = true; break;
    case 'quote': o.text = str(b.text, 1200); o.by = str(b.by, 200); break;
    case 'stats': o.items = arr(b.items, 6).map((x) => (Array.isArray(x) ? { value: str(x[0], 40), label: str(x[1], 120) } : { value: str(x?.value, 40), label: str(x?.label, 120), ...(x?.note ? { note: str(x.note, 160) } : {}) })); break;
    case 'cards': o.items = arr(b.items, 6).map((x) => (Array.isArray(x) ? { title: str(x[0], 120), text: str(x[2] ?? x[1], 400), ...(x[2] != null && x[1] ? { tag: str(x[1], 40) } : {}) } : { title: str(x?.title, 120), text: str(x?.text, 400), ...(x?.tag ? { tag: str(x.tag, 40) } : {}) })); break;
    case 'table': o.head = arr(b.head, 8).map((x) => str(x, 80)); o.rows = arr(b.rows, 14).map((r) => arr(r, 8).map((x) => str(x, 200))); break;
    case 'chart': {
      o.kind = ['column', 'bar', 'line', 'area', 'donut'].includes(b.kind) ? b.kind : 'column';
      o.labels = arr(b.labels, 24).map((x) => str(x, 40));
      o.series = arr(b.series, 6).map((s, i) => ({ name: str(s?.name ?? `Series ${i + 1}`, 60), values: arr(s?.values, 24).map(num) }));
      if (b.unit) o.unit = str(b.unit, 12);
      if (b.title) o.title = str(b.title, 120);
      break;
    }
    case 'image': o.url = safeUrl(b.url ?? b.src); o.alt = str(b.alt, 300); o.fit = b.fit === 'contain' ? 'contain' : 'cover'; if (b.caption) o.caption = str(b.caption, 200); break;
    case 'steps': o.items = arr(b.items, 6).map((x) => ({ title: str(typeof x === 'object' ? x?.title : x, 120), text: str(x?.text, 300) })); break;
    case 'timeline': o.items = arr(b.items, 8).map((x) => ({ when: str(x?.when, 40), title: str(x?.title, 120), text: str(x?.text, 300) })); break;
    case 'checklist': o.items = arr(b.items, 12).map((x) => ({ text: str(typeof x === 'object' ? x?.text : x, 200), done: !!x?.done })); break;
    case 'callout': o.text = str(b.text, 600); o.tone = ['good', 'warn'].includes(b.tone) ? b.tone : 'info'; break;
    case 'chat': o.prompt = str(b.prompt, 400); o.answer = str(b.answer, 1200); o.tools = arr(b.tools, 4).map((x) => ({ name: str(x?.name, 60), arg: str(x?.arg, 120), out: str(x?.out, 80) })); break;
    case 'score': o.grade = Math.max(0, Math.min(100, Math.round(num(b.grade)))); o.title = str(b.title, 120); o.areas = arr(b.areas, 6).map((x) => (Array.isArray(x) ? { label: str(x[0], 60), value: Math.max(0, Math.min(100, num(x[1]))) } : { label: str(x?.label, 60), value: Math.max(0, Math.min(100, num(x?.value))) })); break;
    case 'kv': o.items = arr(b.items, 10).map((x) => (Array.isArray(x) ? { label: str(x[0], 60), value: str(x[1], 200) } : { label: str(x?.label, 60), value: str(x?.value, 200) })); break;
    case 'button': o.text = str(b.text, 60); o.url = safeUrl(b.url); break;
  }
  return o;
}

export function safeUrl(u) {
  const s = String(u ?? '').trim();
  if (!s) return '';
  if (s.startsWith('/files/decks/') || /^\/app\/examples\/[\w.-]+$/.test(s)) return s;
  try { const x = new URL(s); return ['https:', 'http:'].includes(x.protocol) ? x.toString() : ''; } catch { return ''; }
}

export function normalImage(img) {
  if (!img) return null;
  if (typeof img === 'string') img = { url: img };
  const url = safeUrl(img.url ?? img.src);
  if (!url) return null;
  return { url, alt: str(img.alt, 300), fit: img.fit === 'contain' ? 'contain' : 'cover', ...(img.position ? { position: str(img.position, 30).replace(/[^a-z0-9% ]/gi, '') } : {}) };
}

// A slot a block may go in on this layout (the first one when it names none or a wrong one).
export function slotFor(layout, slot) {
  const slots = LAYOUTS[layout]?.slots ?? ['main'];
  if (!slots.length) return 'main';
  return slots.includes(slot) ? slot : slots[0];
}

export const obj_ = obj;
