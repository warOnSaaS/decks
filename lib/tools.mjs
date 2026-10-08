import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { DeckError, rowView } from './decks.mjs';
import { view as fileView } from './files.mjs';
import { newId, nowIso } from './ids.mjs';
import { Y, findSlide, findBlock, setSlideFields, setBlockFields, setPath, normalSlide, slideToY, blockToY, cloneSlideY, slideFromY, blockFromY, deckFromDoc, moveInArray, shortId, newDoc } from './shared/model.mjs';
import { LAYOUTS, LAYOUT_NAMES, BLOCKS, BLOCK_TYPES, BACKGROUNDS, normalBlock, normalImage, slotFor } from './shared/layouts.mjs';
import { normalTheme, themeList, SCHEME_NAMES, MODES, SHAPES, TYPES, SURFACES, DENSITIES, PRESETS } from './shared/themes.mjs';

// The tool catalogue: everything a person can do in Decks, as tools. The screens call these through
// /api/tools/<name>, agents call the same ones over MCP at /mcp (as decks_<verb>_<noun>), and
// tools.json is generated from this list (npm run tools:json). Names follow ROADMAP 3.1: app.verb_noun,
// a plain description, a scope (read, write, delete, admin), confirm (none or human), the events emitted.
// There is no model in here: every generative act happens in the person's own AI, through these tools.

const DECK = z.string().min(1).describe('A deck: its id (d_...) or its exact title');
const SLIDE = z.union([z.string().min(1), z.number().int().min(1)]).describe('A slide: its id (s_...) or its number, 1 being the first');
const BLOCK = z.union([z.string().min(1), z.number().int().min(1)]).describe('A block on the slide: its id (b_...) or its number on the slide, 1 being the first');
const Layout = z.enum(LAYOUT_NAMES).describe(`The layout: ${LAYOUT_NAMES.join(', ')}. decks.list_layouts explains each.`);
const Bg = z.enum(BACKGROUNDS).describe('Background: default, alt (a card colour), accent, or inverse (the opposite mode)');
const Image = z.object({ url: z.string().describe('An https address or a file url from decks.upload_file'), alt: z.string().optional(), fit: z.enum(['cover', 'contain']).optional(), position: z.string().optional().describe('Which part to keep in view, like "center top"') });
const Block = z.object({ t: z.enum(BLOCK_TYPES).describe('The block type'), slot: z.string().optional().describe('Where on the slide: main, or left and right on two_column') }).passthrough()
  .describe(`A block. t is one of ${BLOCK_TYPES.join(', ')}; its other fields depend on t (decks.list_layouts lists them). Example: { "t": "stats", "items": [{ "value": "38%", "label": "Growth" }] }`);
const SlideIn = {
  layout: Layout.optional(),
  kicker: z.string().optional().describe('A small line above the title'),
  title: z.string().optional(),
  subtitle: z.string().optional().describe('A line under the title'),
  blocks: z.array(Block).max(12).optional().describe('The slide\'s blocks, in order. Keep slides light: one to three blocks.'),
  notes: z.string().optional().describe('Speaker notes: what to say, only the presenter sees them'),
  image: Image.nullable().optional().describe('The picture for image_left, image_right and full_image layouts'),
  bg: Bg.optional(),
  hidden: z.boolean().optional().describe('Hidden slides are skipped when presenting and exporting'),
};
const SlideOut = z.object({ id: z.string(), number: z.number(), layout: z.string(), title: z.string(), blocks: z.array(z.object({ id: z.string(), t: z.string() }).passthrough()) }).passthrough();
const DeckOut = z.object({ id: z.string(), title: z.string(), theme: z.object({}).passthrough(), slides: z.array(SlideOut) }).passthrough();
const DeckRow = z.object({ id: z.string(), title: z.string(), slides: z.number(), updated_at: z.string() }).passthrough();
const FileRef = z.object({ id: z.string(), name: z.string(), type: z.string(), size: z.number(), url: z.string() });
const Comment = z.object({ id: z.string(), body: z.string(), slide: z.string().nullable(), author: z.object({ name: z.string() }).passthrough() }).passthrough();
const Ok = z.object({ ok: z.boolean() }).passthrough();
const ThemeIn = {
  preset: z.enum(Object.keys(PRESETS)).optional().describe(`A ready look: ${Object.keys(PRESETS).join(', ')}. Other options given with it override it.`),
  scheme: z.enum(SCHEME_NAMES).optional().describe(`Colour scheme: ${SCHEME_NAMES.join(', ')}`),
  mode: z.enum(MODES).optional(),
  shape: z.enum(SHAPES).optional().describe('Corners: sharp, soft or round'),
  type: z.enum(TYPES).optional().describe('Faces: grotesk, mono, editorial (serif), humanist, pixel or system'),
  surface: z.enum(SURFACES).optional().describe('How cards sit: flat, bordered, elevated or glass'),
  density: z.enum(DENSITIES).optional(),
};

const TOOLS = [];
const tool = (t) => TOOLS.push({ confirm: 'none', emits: [], ...t });

// ---------- helpers ----------

async function deckOf(ctx, ref) { return ctx.app.decks.readable(ctx.me, ref); }
async function deckView(ctx, row) {
  const d = await ctx.app.decks.json(row.id);
  return {
    id: row.id, title: d.title, description: d.description, theme: d.theme, brand: d.brand, links: d.links,
    archived: !!row.archived_at, updated_at: row.updated_at,
    url: `${ctx.app.publicUrl}/app#/d/${row.id}`,
    slides: d.slides.map((s, i) => ({ number: i + 1, ...s })),
  };
}
function slideOrFail(doc, ref) {
  const f = findSlide(doc, ref);
  if (!f) throw new DeckError(`No slide ${ref} in this deck. It has ${doc.getArray('slides').length} slides.`, 404);
  return f;
}
function blockOrFail(slideMap, ref) {
  const f = findBlock(slideMap, ref);
  if (!f) throw new DeckError(`No block ${ref} on that slide.`, 404);
  return f;
}
const slideView = (doc, f) => ({ number: f.index + 1, ...slideFromY(f.m) });
const ev = (type, data) => ({ type, data });

// ---------- reading ----------

tool({
  name: 'decks.list_decks', title: 'List decks', scope: 'read',
  description: 'The team\'s decks, most recently changed first, with slide counts. query finds words in titles and slides.',
  input: { query: z.string().optional(), include_archived: z.boolean().optional(), covers: z.boolean().optional().describe('Also return each deck\'s first slide and theme, to draw a cover') },
  output: z.object({ decks: z.array(DeckRow) }),
  run: async (ctx, a) => ({ decks: (await ctx.app.decks.list(ctx.me, a)).map(({ cover, ...r }) => ({ ...r, url: `${ctx.app.publicUrl}/app#/d/${r.id}`, ...(a.covers ? { cover } : {}) })) }),
  text: (r) => r.decks.map((d) => `${d.title} (${d.id}): ${d.slides} slides, changed ${d.updated_at.slice(0, 10)}${d.archived ? ', archived' : ''}`).join('\n') || 'No decks yet. Make one with decks.create_deck.',
});

tool({
  name: 'decks.get_deck', title: 'Open a deck', scope: 'read',
  description: 'A whole deck: title, theme, brand, linked records, and every slide with its layout, words, blocks and speaker notes. Use it before changing a deck you did not just make.',
  input: { deck: DECK },
  output: DeckOut,
  run: async (ctx, a) => deckView(ctx, await deckOf(ctx, a.deck)),
});

tool({
  name: 'decks.get_slide', title: 'Open a slide', scope: 'read',
  description: 'One slide: its layout, words, blocks (with their ids, to change one) and speaker notes.',
  input: { deck: DECK, slide: SLIDE },
  output: SlideOut,
  run: async (ctx, a) => { const row = await deckOf(ctx, a.deck); const doc = await ctx.app.decks.doc(row.id); return slideView(doc, slideOrFail(doc, a.slide)); },
});

tool({
  name: 'decks.list_layouts', title: 'Layouts and blocks', scope: 'read',
  description: 'Every slide layout (with the fields and block slots it has) and every block type (with its fields and an example). Read this once before building a deck.',
  input: {},
  output: z.object({ layouts: z.array(z.object({ id: z.string() }).passthrough()), blocks: z.array(z.object({ t: z.string() }).passthrough()), tips: z.array(z.string()) }),
  run: async () => ({
    layouts: LAYOUT_NAMES.map((id) => ({ id, ...LAYOUTS[id] })),
    blocks: BLOCK_TYPES.map((t) => ({ t, label: BLOCKS[t].label, fields: BLOCKS[t].fields, example: BLOCKS[t].example })),
    backgrounds: BACKGROUNDS,
    tips: TIPS,
  }),
});

const TIPS = [
  'One idea per slide. A title that says the point ("Revenue doubled in a year"), not the topic ("Revenue").',
  'One to three blocks per slide. Prefer stats, a chart or cards over long bullet lists; bullets at most five short lines.',
  'Open with a title slide, use section slides between parts, close with a closing slide that says the ask.',
  'Put what to say in speaker notes, not on the slide.',
  'Pick a theme first (decks.apply_theme or theme in decks.create_deck), then the brand (decks.set_brand) if the person has one.',
  'Check your work: decks.preview_slide shows you a picture of a slide.',
];

tool({
  name: 'decks.list_themes', title: 'Themes', scope: 'read',
  description: 'Every look a deck can have: the colour schemes (each with a light and dark mode), corners, faces, surfaces, density, ready presets, and the brand options (logo, accent colour, fonts).',
  input: {},
  output: z.object({ schemes: z.array(z.object({ id: z.string() }).passthrough()) }).passthrough(),
  run: async () => themeList(),
});

tool({
  name: 'decks.list_comments', title: 'Comments', scope: 'read',
  description: 'Comments on a deck (or on one slide), with replies, oldest first. Resolved ones are marked.',
  input: { deck: DECK, slide: SLIDE.optional(), open_only: z.boolean().optional().describe('Leave out resolved comments') },
  output: z.object({ comments: z.array(Comment) }),
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    let slide = null;
    if (a.slide != null) { const doc = await ctx.app.decks.doc(row.id); slide = slideOrFail(doc, a.slide).m.get('id'); }
    return { comments: await ctx.app.decks.comments(ctx.me, row.id, { slide, include_resolved: !a.open_only }) };
  },
});

tool({
  name: 'decks.list_activity', title: 'What changed', scope: 'read',
  description: 'Recent changes to a deck (or to every deck when none is given): who did what, and whether it was a person or an AI app.',
  input: { deck: DECK.optional(), limit: z.number().int().min(1).max(200).optional() },
  output: z.object({ activity: z.array(z.object({ type: z.string(), by: z.string().nullable() }).passthrough()) }),
  run: async (ctx, a) => ({ activity: await ctx.app.decks.activity(ctx.me, a.deck ? (await deckOf(ctx, a.deck)).id : null, a.limit) }),
});

tool({
  name: 'decks.get_changes', title: 'Catch up', scope: 'read', hidden: true,
  description: 'The changes to a deck that a copy with this state vector has not seen, as a Yjs update. Editors use it after a dropped connection.',
  input: { deck: DECK, state_vector: z.string().optional().describe('Base64 Yjs state vector; leave out for the whole deck') },
  output: z.object({ update: z.string(), state_vector: z.string() }),
  run: async (ctx, a) => { const row = await deckOf(ctx, a.deck); return { ...(await ctx.app.decks.changesSince(row.id, a.state_vector)), present: ctx.app.live?.present(row.id) ?? [] }; },
});

tool({
  name: 'decks.get_settings', title: 'Settings', scope: 'read',
  description: 'You, your team, how this server signs people in and stores files, and your own preferences.',
  input: {},
  output: z.object({ me: z.object({}).passthrough(), team: z.object({}).passthrough() }).passthrough(),
  run: async ({ app, me }) => ({
    me: { id: me.id, name: me.name, email: me.email, role: me.role },
    team: { id: me.team_id, name: (await app.decks.team(me.team_id))?.name ?? 'Decks' },
    prefs: app.decks.prefs(me),
    server: { storage: app.db.kind, files: app.files.mode, sign_in: app.authProvider, mcp: `${app.publicUrl}/mcp`, suite: !!app.suite, pdf: true, version: app.version },
  }),
});

tool({
  name: 'decks.list_people', title: 'People', scope: 'read',
  description: 'Everyone on the team and their role.',
  input: {},
  output: z.object({ people: z.array(z.object({ id: z.string(), name: z.string(), role: z.string() }).passthrough()) }),
  run: async ({ app, me }) => ({ people: (await app.decks.people(me.team_id)).map((p) => ({ ...p, me: p.id === me.id })) }),
});

tool({
  name: 'decks.list_shares', title: 'Share links', scope: 'read',
  description: 'The live view and embed links of a deck.',
  input: { deck: DECK },
  output: z.object({ shares: z.array(z.object({ id: z.string(), kind: z.string(), url: z.string() }).passthrough()) }),
  run: async (ctx, a) => { const row = await deckOf(ctx, a.deck); return { shares: (await ctx.app.decks.shares(row.id)).map((s) => shareView(ctx, s)) }; },
});
const shareView = (ctx, s) => ({ id: s.id, kind: s.kind, url: `${ctx.app.publicUrl}/${s.kind === 'embed' ? 'e' : 's'}/${s.token}`, ...(s.kind === 'embed' ? { embed_html: `<iframe src="${ctx.app.publicUrl}/e/${s.token}" width="960" height="540" style="border:0;aspect-ratio:16/9;width:100%;height:auto" allowfullscreen title="Slides"></iframe>` } : {}), views: Number(s.views ?? 0), created_at: s.created_at });

tool({
  name: 'decks.preview_slide', title: 'Look at a slide', scope: 'read',
  description: 'A picture (PNG) of one slide as it will look when presented, so you can check your work: text that runs over, a chart that reads badly, an image that does not load.',
  input: { deck: DECK, slide: SLIDE },
  output: z.object({ slide: z.string(), number: z.number(), width: z.number(), height: z.number(), image_base64: z.string(), mime: z.string() }),
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    const doc = await ctx.app.decks.doc(row.id);
    const f = slideOrFail(doc, a.slide);
    const { previewPng } = await import('./export-pdf.mjs');
    const png = await previewPng(ctx.app, ctx.me, deckFromDoc(doc), f.index);
    return { slide: f.m.get('id'), number: f.index + 1, width: 1440, height: 810, image_base64: png.toString('base64'), mime: 'image/png' };
  },
  image: true,
});

// ---------- decks ----------

tool({
  name: 'decks.create_deck', title: 'New deck', scope: 'write', emits: ['decks.deck.created'],
  description: 'Make a deck. Give it a title, and optionally a theme, a brand and its slides all at once (or add slides after with decks.add_slide). Returns the deck with slide and block ids.',
  input: {
    title: z.string().min(1).max(200),
    description: z.string().optional(),
    theme: z.object(ThemeIn).optional(),
    brand: z.object({}).passthrough().optional().describe('logo, accent, on_accent, font, display, fonts_href, footer (see decks.list_themes)'),
    slides: z.array(z.object(SlideIn)).max(60).optional(),
    from_example: z.string().optional().describe('Start from an example deck (its id or title) instead of empty'),
  },
  output: DeckOut,
  run: async (ctx, a) => {
    let spec = { title: a.title, description: a.description ?? '', theme: normalTheme(a.theme ?? {}), brand: cleanBrand(a.brand ?? {}), slides: (a.slides ?? []).map(normalSlide) };
    if (a.from_example) {
      const src = await ctx.app.exampleDeck(a.from_example);
      if (!src) throw new DeckError('No example deck by that name.', 404);
      spec = { ...src, title: a.title, slides: src.slides.map((s) => ({ ...s, id: shortId('s'), blocks: s.blocks.map((b) => ({ ...b, id: shortId('b') })) })) };
    }
    const id = await ctx.app.decks.create(ctx.me, spec, { via: ctx.via });
    return deckView(ctx, await deckOf(ctx, id));
  },
  text: (d) => `Made "${d.title}" (${d.id}) with ${d.slides.length} slides. Open it: ${d.url}`,
});

function cleanBrand(b) {
  const out = {};
  const s = (v, n = 300) => String(v ?? '').trim().slice(0, n);
  if (b.logo) out.logo = /^(https?:\/\/|\/files\/decks\/|\/app\/examples\/)/.test(s(b.logo, 1000)) ? s(b.logo, 1000) : undefined;
  for (const k of ['accent', 'on_accent']) if (b[k] && /^#[0-9a-f]{6}$/i.test(s(b[k]))) out[k] = s(b[k]);
  for (const k of ['font', 'display']) if (b[k]) out[k] = s(b[k], 120).replace(/[;{}<>]/g, '');
  if (b.fonts_href && /^https:\/\/fonts\.googleapis\.com\//.test(s(b.fonts_href, 600))) out.fonts_href = s(b.fonts_href, 600);
  if (b.footer) out.footer = s(b.footer, 80);
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
}

tool({
  name: 'decks.update_deck', title: 'Rename a deck', scope: 'write', emits: ['decks.deck.updated'],
  description: 'Change a deck\'s title or description.',
  input: { deck: DECK, title: z.string().min(1).max(200).optional(), description: z.string().max(1000).optional() },
  output: DeckRow,
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    await ctx.app.decks.change(ctx.me, row.id, (doc) => {
      const d = doc.getMap('deck');
      if (a.title != null) { const t = d.get('title'); if (t instanceof Y.Text) { t.delete(0, t.length); t.insert(0, a.title); } else d.set('title', new Y.Text(a.title)); }
      if (a.description != null) d.set('description', a.description);
    }, { via: ctx.via, data: { title: a.title } });
    return rowView(await deckOf(ctx, row.id));
  },
});

tool({
  name: 'decks.duplicate_deck', title: 'Duplicate a deck', scope: 'write', emits: ['decks.deck.created'],
  description: 'Copy a whole deck, slides, theme and notes, under a new title. Comments and share links stay with the original.',
  input: { deck: DECK, title: z.string().optional() },
  output: DeckOut,
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    const d = await ctx.app.decks.json(row.id);
    const id = await ctx.app.decks.create(ctx.me, { ...d, title: a.title || `${d.title} (copy)`, slides: d.slides.map((s) => ({ ...s, id: shortId('s') })) }, { via: ctx.via });
    const doc = await ctx.app.decks.doc(id);
    await ctx.app.decks.change(ctx.me, id, (x) => x.getMap('deck').set('links', []), { quiet: true });
    void doc;
    return deckView(ctx, await deckOf(ctx, id));
  },
});

tool({
  name: 'decks.archive_deck', title: 'Archive a deck', scope: 'write', emits: ['decks.deck.updated'],
  description: 'Put a deck away (archived: true) or bring it back (archived: false). Archived decks keep their share links.',
  input: { deck: DECK, archived: z.boolean().optional() },
  output: DeckRow,
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    await ctx.app.db.run('update decks_decks set archived_at = $2 where id = $1', [row.id, a.archived === false ? null : nowIso()]);
    await ctx.app.decks.log(ctx.me, row.id, 'decks.deck.updated', { archived: a.archived !== false }, ctx.via);
    return rowView(await deckOf(ctx, row.id));
  },
});

tool({
  name: 'decks.delete_deck', title: 'Delete a deck', scope: 'delete', confirm: 'human', emits: ['decks.deck.deleted'],
  description: 'Delete a deck for everyone, with its comments and share links. Only when the person clearly asks.',
  input: { deck: DECK },
  output: Ok,
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    await ctx.app.db.run('update decks_decks set deleted_at = $2 where id = $1', [row.id, nowIso()]);
    await ctx.app.db.run('update decks_shares set revoked_at = $2 where deck_id = $1 and revoked_at is null', [row.id, nowIso()]);
    await ctx.app.decks.log(ctx.me, row.id, 'decks.deck.deleted', { title: row.title }, ctx.via);
    return { ok: true, deleted: row.id };
  },
});

// ---------- slides ----------

tool({
  name: 'decks.add_slide', title: 'Add a slide', scope: 'write', emits: ['decks.slide.added'],
  description: 'Add a slide with a layout and, optionally, its words, blocks, image and speaker notes. It goes at the end, or after the slide named in after. Returns the slide with its block ids.',
  input: { deck: DECK, after: SLIDE.optional().describe('Put it after this slide (0 or leave out: at the end)'), ...SlideIn, layout: Layout.default('content') },
  output: SlideOut,
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    const { deck, after, ...spec } = a;
    const s = normalSlide(spec);
    let at = 0;
    await ctx.app.decks.change(ctx.me, row.id, (doc) => {
      const arr = doc.getArray('slides');
      at = arr.length;
      if (after != null && after !== 0 && after !== '0') at = slideOrFail(doc, after).index + 1;
      arr.insert(at, [slideToY(s)]);
    }, { via: ctx.via, type: 'decks.slide.added', data: { slide: s.id } });
    return { number: at + 1, ...s };
  },
  text: (s) => `Added slide ${s.number} (${s.id}, ${s.layout})${s.blocks.length ? ` with blocks ${s.blocks.map((b) => `${b.id} ${b.t}`).join(', ')}` : ''}.`,
});

tool({
  name: 'decks.set_slide_content', title: 'Change a slide', scope: 'write', emits: ['decks.slide.updated'],
  description: 'Change a slide: its layout, kicker, title, subtitle, image, background, notes or whole list of blocks. Only what you give changes; blocks, when given, replace every block on the slide (use decks.update_block to change one).',
  input: { deck: DECK, slide: SLIDE, ...SlideIn },
  output: SlideOut,
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    const { deck, slide, ...patch } = a;
    let out;
    await ctx.app.decks.change(ctx.me, row.id, (doc) => { const f = slideOrFail(doc, slide); setSlideFields(f.m, patch); out = slideView(doc, f); }, { via: ctx.via, type: 'decks.slide.updated', data: { slide: String(slide) } });
    return out;
  },
});

tool({
  name: 'decks.set_notes', title: 'Speaker notes', scope: 'write', emits: ['decks.slide.updated'],
  description: 'Write a slide\'s speaker notes: what to say. Only the presenter sees them (in presenter view and in the PowerPoint file).',
  input: { deck: DECK, slide: SLIDE, notes: z.string().max(20000) },
  output: Ok,
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    await ctx.app.decks.change(ctx.me, row.id, (doc) => setSlideFields(slideOrFail(doc, a.slide).m, { notes: a.notes }), { via: ctx.via, type: 'decks.slide.updated', data: { slide: String(a.slide), notes: true } });
    return { ok: true };
  },
});

tool({
  name: 'decks.duplicate_slide', title: 'Duplicate a slide', scope: 'write', emits: ['decks.slide.added'],
  description: 'Copy a slide, words, blocks and notes, and put the copy right after it.',
  input: { deck: DECK, slide: SLIDE },
  output: SlideOut,
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    let out;
    await ctx.app.decks.change(ctx.me, row.id, (doc) => {
      const f = slideOrFail(doc, a.slide);
      const copy = cloneSlideY(f.m);
      doc.getArray('slides').insert(f.index + 1, [copy]);
      out = { number: f.index + 2, ...slideFromY(copy) };
    }, { via: ctx.via, type: 'decks.slide.added', data: { from: String(a.slide) } });
    return out;
  },
});

tool({
  name: 'decks.reorder_slides', title: 'Move slides', scope: 'write', emits: ['decks.slide.moved'],
  description: 'Move one slide to a new position (slide and to), or put every slide in a new order (order: all slide ids or numbers, first to last).',
  input: { deck: DECK, slide: SLIDE.optional(), to: z.number().int().min(1).optional().describe('The new position, 1 being the first'), order: z.array(SLIDE).optional() },
  output: z.object({ order: z.array(z.string()) }),
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    let order;
    await ctx.app.decks.change(ctx.me, row.id, (doc) => {
      const arr = doc.getArray('slides');
      if (a.order) {
        const ids = a.order.map((r) => slideOrFail(doc, r).m.get('id'));
        if (new Set(ids).size !== arr.length) throw new DeckError(`order must name every slide once (${arr.length} slides).`);
        const json = Object.fromEntries(arr.toArray().map((m) => [m.get('id'), slideFromY(m)]));
        arr.delete(0, arr.length);
        arr.push(ids.map((id) => slideToY(json[id])));
      } else {
        if (a.slide == null || a.to == null) throw new DeckError('Give slide and to, or order.');
        const f = slideOrFail(doc, a.slide);
        moveInArray(arr, f.index, a.to - 1, (m) => slideToY(slideFromY(m)));
      }
      order = arr.toArray().map((m) => m.get('id'));
    }, { via: ctx.via, type: 'decks.slide.moved', data: {} });
    return { order };
  },
});

tool({
  name: 'decks.delete_slide', title: 'Delete a slide', scope: 'delete', emits: ['decks.slide.deleted'],
  description: 'Remove a slide from the deck.',
  input: { deck: DECK, slide: SLIDE },
  output: Ok,
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    let id;
    await ctx.app.decks.change(ctx.me, row.id, (doc) => { const f = slideOrFail(doc, a.slide); id = f.m.get('id'); doc.getArray('slides').delete(f.index, 1); }, { via: ctx.via, type: 'decks.slide.deleted', data: { slide: String(a.slide) } });
    return { ok: true, deleted: id };
  },
});

// ---------- blocks ----------

async function addBlockTo(ctx, a, block, type = 'decks.slide.updated') {
  const row = await deckOf(ctx, a.deck);
  let out;
  await ctx.app.decks.change(ctx.me, row.id, (doc) => {
    const f = slideOrFail(doc, a.slide);
    const list = f.m.get('blocks');
    if (list.length >= 12) throw new DeckError('A slide holds at most 12 blocks. Start a new slide.');
    const nb = normalBlock(block, shortId('b'));
    nb.slot = slotFor(f.m.get('layout'), a.slot ?? block.slot);
    const at = a.at != null ? Math.max(0, Math.min(list.length, a.at - 1)) : list.length;
    list.insert(at, [blockToY(nb)]);
    out = { slide: f.m.get('id'), number: at + 1, ...nb };
  }, { via: ctx.via, type, data: { slide: String(a.slide), block: block.t } });
  return out;
}
const BlockOut = z.object({ id: z.string(), t: z.string(), slide: z.string() }).passthrough();

tool({
  name: 'decks.add_block', title: 'Add a block', scope: 'write', emits: ['decks.slide.updated'],
  description: 'Add one block to a slide: text, heading, bullets, quote, stats, cards, table, chart, image, steps, timeline, checklist, callout, chat (an agent answer), score, kv or button. decks.list_layouts lists each one\'s fields.',
  input: { deck: DECK, slide: SLIDE, block: Block, slot: z.string().optional(), at: z.number().int().min(1).optional().describe('Its position among the slide\'s blocks (default: last)') },
  output: BlockOut,
  run: (ctx, a) => addBlockTo(ctx, a, a.block),
});

tool({
  name: 'decks.update_block', title: 'Change a block', scope: 'write', emits: ['decks.slide.updated'],
  description: 'Change some fields of one block, like its text, its items or a chart\'s numbers. The block keeps its type.',
  input: { deck: DECK, slide: SLIDE, block: BLOCK, set: z.object({}).passthrough().describe('The fields to change, like { "text": "..." } or { "items": [...] }') },
  output: BlockOut,
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    let out;
    await ctx.app.decks.change(ctx.me, row.id, (doc) => {
      const f = slideOrFail(doc, a.slide);
      const b = blockOrFail(f.m, a.block);
      const set = { ...a.set };
      if (set.slot) set.slot = slotFor(f.m.get('layout'), set.slot);
      setBlockFields(b.m, set);
      out = { slide: f.m.get('id'), ...blockFromY(b.m) };
    }, { via: ctx.via, type: 'decks.slide.updated', data: { slide: String(a.slide), block: String(a.block) } });
    return out;
  },
});

tool({
  name: 'decks.move_block', title: 'Move a block', scope: 'write', emits: ['decks.slide.updated'],
  description: 'Move a block up or down on its slide (to a position), or into another slot (left or right on two-column slides).',
  input: { deck: DECK, slide: SLIDE, block: BLOCK, to: z.number().int().min(1).optional(), slot: z.string().optional() },
  output: Ok,
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    await ctx.app.decks.change(ctx.me, row.id, (doc) => {
      const f = slideOrFail(doc, a.slide);
      const b = blockOrFail(f.m, a.block);
      if (a.slot) b.m.set('slot', slotFor(f.m.get('layout'), a.slot));
      if (a.to != null) moveInArray(b.list, b.index, a.to - 1, (m) => blockToY(blockFromY(m)));
    }, { via: ctx.via, type: 'decks.slide.updated', data: { slide: String(a.slide) } });
    return { ok: true };
  },
});

tool({
  name: 'decks.remove_block', title: 'Remove a block', scope: 'write', emits: ['decks.slide.updated'],
  description: 'Take one block off a slide.',
  input: { deck: DECK, slide: SLIDE, block: BLOCK },
  output: Ok,
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    await ctx.app.decks.change(ctx.me, row.id, (doc) => { const f = slideOrFail(doc, a.slide); const b = blockOrFail(f.m, a.block); b.list.delete(b.index, 1); }, { via: ctx.via, type: 'decks.slide.updated', data: { slide: String(a.slide) } });
    return { ok: true };
  },
});

tool({
  name: 'decks.add_image', title: 'Add an image', scope: 'write', emits: ['decks.slide.updated'],
  description: 'Put an image on a slide, by its https address or a file uploaded with decks.upload_file. as: block (default) adds an image block; slide sets the picture of an image_left, image_right or full_image slide (and switches a slide with another layout to image_right).',
  input: { deck: DECK, slide: SLIDE, url: z.string().optional(), file: z.string().optional().describe('A file id from decks.upload_file'), alt: z.string().optional(), fit: z.enum(['cover', 'contain']).optional(), caption: z.string().optional(), as: z.enum(['block', 'slide']).optional(), slot: z.string().optional() },
  output: z.object({ slide: z.string() }).passthrough(),
  run: async (ctx, a) => {
    let url = a.url;
    if (a.file) url = fileView(await ctx.app.files.readable(ctx.me, a.file)).url;
    if (!url) throw new DeckError('Give an image url, or the id of an uploaded file.');
    if (!normalImage({ url })) throw new DeckError('That is not an https address or an uploaded file.');
    if (a.as === 'slide') {
      const row = await deckOf(ctx, a.deck);
      let out;
      await ctx.app.decks.change(ctx.me, row.id, (doc) => {
        const f = slideOrFail(doc, a.slide);
        const patch = { image: { url, alt: a.alt, fit: a.fit } };
        if (!LAYOUTS[f.m.get('layout')].image) patch.layout = 'image_right';
        setSlideFields(f.m, patch);
        out = { slide: f.m.get('id'), image: f.m.get('image'), layout: f.m.get('layout') };
      }, { via: ctx.via, type: 'decks.slide.updated', data: { slide: String(a.slide), image: true } });
      return out;
    }
    return addBlockTo(ctx, a, { t: 'image', url, alt: a.alt, fit: a.fit, caption: a.caption });
  },
});

tool({
  name: 'decks.add_chart', title: 'Add a chart', scope: 'write', emits: ['decks.slide.updated'],
  description: 'Draw a chart on a slide from numbers: column (default), bar, line, area or donut. labels are the categories or dates; series are one or more named lists of numbers, one per label. One axis only: put measures of different size on different slides.',
  input: { deck: DECK, slide: SLIDE, kind: z.enum(['column', 'bar', 'line', 'area', 'donut']).optional(), labels: z.array(z.string()).min(1).max(24), series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })).min(1).max(6), unit: z.string().optional().describe('Like $, %, $k, h'), title: z.string().optional(), slot: z.string().optional(), at: z.number().int().min(1).optional() },
  output: BlockOut,
  run: (ctx, a) => addBlockTo(ctx, a, { t: 'chart', kind: a.kind, labels: a.labels, series: a.series, unit: a.unit, title: a.title }),
});

tool({
  name: 'decks.upload_file', title: 'Upload a file', scope: 'write',
  description: 'Upload an image (or a PowerPoint file to import) as base64. Returns its id and url, for decks.add_image, decks.set_brand logo, or decks.import_pptx. The screens stream files to /files/decks instead; this is the same thing for agents.',
  input: { name: z.string(), type: z.string().optional().describe('Like image/png'), content_base64: z.string() },
  output: FileRef,
  run: async ({ app, me }, a) => app.files.put(me, { name: a.name, type: a.type, data: Buffer.from(a.content_base64, 'base64') }),
});

// ---------- look ----------

tool({
  name: 'decks.apply_theme', title: 'Change the theme', scope: 'write', emits: ['decks.deck.updated'],
  description: 'Change how the whole deck looks: a preset, or any of colour scheme, mode, corners, faces, surface and density. Every ui-design kit scheme and style is available; decks.list_themes lists them.',
  input: { deck: DECK, ...ThemeIn },
  output: z.object({ theme: z.object({}).passthrough() }),
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    let theme;
    await ctx.app.decks.change(ctx.me, row.id, (doc) => {
      const d = doc.getMap('deck');
      const { deck, ...opts } = a;
      const cur = d.get('theme') ?? {};
      theme = normalTheme(opts.preset ? { ...opts } : { ...cur, ...opts });
      d.set('theme', theme);
    }, { via: ctx.via, data: { theme: a } });
    return { theme };
  },
});

tool({
  name: 'decks.set_brand', title: 'Brand', scope: 'write', emits: ['decks.deck.updated'],
  description: 'Put a brand over the theme: logo (image url), accent colour (#rrggbb), on_accent, font and display faces (CSS families), fonts_href (a Google Fonts stylesheet) and footer text. Give an empty string to clear one.',
  input: { deck: DECK, logo: z.string().optional(), accent: z.string().optional(), on_accent: z.string().optional(), font: z.string().optional(), display: z.string().optional(), fonts_href: z.string().optional(), footer: z.string().optional() },
  output: z.object({ brand: z.object({}).passthrough() }),
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    let brand;
    await ctx.app.decks.change(ctx.me, row.id, (doc) => {
      const d = doc.getMap('deck');
      const { deck, ...set } = a;
      const merged = { ...(d.get('brand') ?? {}) };
      for (const [k, v] of Object.entries(set)) { if (v === '') delete merged[k]; else merged[k] = v; }
      brand = cleanBrand(merged);
      d.set('brand', brand);
    }, { via: ctx.via, data: { brand: true } });
    return { brand };
  },
});

tool({
  name: 'decks.apply_team_brand', title: 'Use a team brand', scope: 'write', emits: ['decks.deck.updated'],
  description: 'Put a warOnSaaS team\'s brand kit on the deck: its logo, accent colour, fonts and look (scheme, mode, faces, corners). team is the team\'s slug on account.waronsaas.com. Only on servers that use the warOnSaaS account.',
  input: { deck: DECK, team: z.string().min(1).describe('The team slug, like acme-dental') },
  output: z.object({ theme: z.object({}).passthrough(), brand: z.object({}).passthrough() }),
  run: async (ctx, a) => {
    const { account } = await import('./auth.mjs');
    const acct = account();
    if (!acct) throw new DeckError('This server does not use the warOnSaaS account, so there is no team brand kit. Use decks.set_brand.', 409);
    const kit = await acct.brand(a.team);
    if (!kit) throw new DeckError(`No brand kit for the team ${a.team}.`, 404);
    const row = await deckOf(ctx, a.deck);
    let theme, brand;
    await ctx.app.decks.change(ctx.me, row.id, (doc) => {
      const d = doc.getMap('deck');
      theme = normalTheme({ ...(d.get('theme') ?? {}), ...Object.fromEntries(['scheme', 'mode', 'type', 'shape'].filter((k) => kit[k]).map((k) => [k, kit[k]])) });
      const logo = theme.mode === 'dark' ? kit.logo_dark ?? kit.logo_light : kit.logo_light ?? kit.logo_dark;
      brand = cleanBrand({ ...(d.get('brand') ?? {}), logo, accent: kit.accent, on_accent: kit.on_accent, font: kit.font, display: kit.display, fonts_href: kit.fonts_href });
      d.set('theme', theme);
      d.set('brand', brand);
    }, { via: ctx.via, data: { team_brand: a.team } });
    return { theme, brand };
  },
});

// ---------- live editing ----------

tool({
  name: 'decks.sync_doc', title: 'Save typing', scope: 'write', hidden: true,
  description: 'Merge a Yjs update from an editor into the deck: what someone typed or changed in place. Agents use decks.set_slide_content and decks.update_block instead.',
  input: { deck: DECK, update: z.string().describe('A base64 Yjs update') },
  output: Ok,
  run: async (ctx, a) => { const row = await deckOf(ctx, a.deck); return ctx.app.decks.applyUpdate(ctx.me, row.id, a.update, ctx.via); },
});

tool({
  name: 'decks.set_preferences', title: 'Your preferences', scope: 'write',
  description: 'Your own settings: the app\'s light or dark look (auto follows your device).',
  input: { theme: z.enum(['auto', 'light', 'dark']).optional() },
  output: z.object({ prefs: z.object({}).passthrough() }),
  run: async ({ app, me }, a) => {
    const prefs = { ...app.decks.prefs(me), ...a };
    await app.db.run('update decks_people set prefs = $2 where id = $1', [me.id, JSON.stringify(prefs)]);
    return { prefs };
  },
});

// ---------- comments ----------

tool({
  name: 'decks.add_comment', title: 'Comment', scope: 'write', emits: ['decks.comment.added'],
  description: 'Leave a comment on a slide (or on the deck), or reply to a comment with reply_to.',
  input: { deck: DECK, slide: SLIDE.optional(), block: z.string().optional(), body: z.string().min(1).max(4000), reply_to: z.string().optional() },
  output: Comment,
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    let slide = null;
    if (a.slide != null) { const doc = await ctx.app.decks.doc(row.id); slide = slideOrFail(doc, a.slide).m.get('id'); }
    return ctx.app.decks.addComment(ctx.me, row.id, { slide, block: a.block ?? null, body: a.body, reply_to: a.reply_to }, ctx.via);
  },
});

tool({
  name: 'decks.resolve_comment', title: 'Resolve a comment', scope: 'write', emits: ['decks.comment.resolved'],
  description: 'Mark a comment as dealt with (resolved: true) or open it again (false).',
  input: { comment: z.string(), resolved: z.boolean().optional() },
  output: Comment,
  run: async (ctx, a) => {
    const c = await ctx.app.decks.commentFor(ctx.me, a.comment);
    const done = a.resolved !== false;
    await ctx.app.db.run('update decks_comments set resolved_at = $2, resolved_by = $3 where id = $1', [c.id, done ? nowIso() : null, done ? ctx.me.id : null]);
    await ctx.app.decks.log(ctx.me, c.deck_id, 'decks.comment.resolved', { comment: c.id, resolved: done }, ctx.via);
    return ctx.app.decks.comment(c.id);
  },
});

tool({
  name: 'decks.delete_comment', title: 'Delete a comment', scope: 'delete', emits: ['decks.comment.deleted'],
  description: 'Delete your own comment (admins can delete anyone\'s).',
  input: { comment: z.string() },
  output: Ok,
  run: async (ctx, a) => {
    const c = await ctx.app.decks.commentFor(ctx.me, a.comment);
    if (c.author_id !== ctx.me.id && !['owner', 'admin'].includes(ctx.me.role)) throw new DeckError('Only the writer or an admin can delete a comment.', 403);
    await ctx.app.db.run('update decks_comments set deleted_at = $2 where id = $1 or parent_id = $1', [c.id, nowIso()]);
    await ctx.app.decks.log(ctx.me, c.deck_id, 'decks.comment.deleted', { comment: c.id }, ctx.via);
    return { ok: true };
  },
});

// ---------- sharing ----------

tool({
  name: 'decks.share_deck', title: 'Share a link', scope: 'write', confirm: 'human', emits: ['decks.deck.shared'],
  description: 'Make a view-only link anyone can open without an account (kind: view), or an embed for a web page (kind: embed). Returns the link. Anyone with it can see the deck, so an app asks the person first.',
  input: { deck: DECK, kind: z.enum(['view', 'embed']).optional() },
  output: z.object({ id: z.string(), kind: z.string(), url: z.string() }).passthrough(),
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    const s = await ctx.app.decks.share(ctx.me, row.id, a.kind ?? 'view');
    await ctx.app.decks.log(ctx.me, row.id, 'decks.deck.shared', { kind: s.kind }, ctx.via);
    return shareView(ctx, s);
  },
  text: (s) => `Anyone with this link can ${s.kind === 'embed' ? 'embed' : 'view'} the deck: ${s.url}`,
});

tool({
  name: 'decks.unshare_deck', title: 'Turn off a link', scope: 'write', emits: ['decks.deck.unshared'],
  description: 'Turn off a share or embed link (or every link of the deck when none is named). People who open it see that it is gone.',
  input: { deck: DECK, share: z.string().optional().describe('The share id; leave out to turn off every link') },
  output: Ok,
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    await ctx.app.db.run(`update decks_shares set revoked_at = $2 where deck_id = $1 and revoked_at is null ${a.share ? 'and id = $3' : ''}`, a.share ? [row.id, nowIso(), a.share] : [row.id, nowIso()]);
    await ctx.app.decks.log(ctx.me, row.id, 'decks.deck.unshared', { share: a.share ?? 'all' }, ctx.via);
    return { ok: true };
  },
});

// ---------- export and import ----------

tool({
  name: 'decks.export_pdf', title: 'Export as PDF', scope: 'write', emits: ['decks.deck.exported'],
  description: 'Make a PDF of the deck, one page per slide (hidden slides left out). Returns a download link for the team. with_notes adds a page of speaker notes after each slide.',
  input: { deck: DECK, with_notes: z.boolean().optional() },
  output: z.object({ file: FileRef, pages: z.number() }),
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    const { exportPdf } = await import('./export-pdf.mjs');
    const d = await ctx.app.decks.json(row.id);
    const { pdf, pages } = await exportPdf(ctx.app, ctx.me, d, { notes: !!a.with_notes });
    const file = await ctx.app.files.put(ctx.me, { name: `${slug(d.title)}.pdf`, type: 'application/pdf', data: pdf, isPublic: false });
    await ctx.app.decks.log(ctx.me, row.id, 'decks.deck.exported', { as: 'pdf', pages }, ctx.via);
    return { file: { ...file, url: `${ctx.app.publicUrl}${file.url}` }, pages };
  },
  text: (r) => `PDF ready (${r.pages} pages): ${r.file.url}`,
});

tool({
  name: 'decks.export_pptx', title: 'Export as PowerPoint', scope: 'write', emits: ['decks.deck.exported'],
  description: 'Make a PowerPoint file (.pptx) of the deck that opens in PowerPoint, Keynote and Google Slides: real text boxes, tables and charts you can edit, images, and speaker notes. Returns a download link for the team.',
  input: { deck: DECK },
  output: z.object({ file: FileRef, slides: z.number(), notes: z.array(z.string()) }),
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    const { exportPptx } = await import('./export-pptx.mjs');
    const d = await ctx.app.decks.json(row.id);
    const { data, slides, notes } = await exportPptx(ctx.app, ctx.me, d);
    const file = await ctx.app.files.put(ctx.me, { name: `${slug(d.title)}.pptx`, type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', data, isPublic: false });
    await ctx.app.decks.log(ctx.me, row.id, 'decks.deck.exported', { as: 'pptx', slides }, ctx.via);
    return { file: { ...file, url: `${ctx.app.publicUrl}${file.url}` }, slides, notes };
  },
  text: (r) => `PowerPoint ready (${r.slides} slides): ${r.file.url}${r.notes.length ? `\nNotes: ${r.notes.join(' ')}` : ''}`,
});

tool({
  name: 'decks.import_pptx', title: 'Import PowerPoint', scope: 'write', emits: ['decks.deck.created'],
  description: 'Make a deck from a PowerPoint file uploaded with decks.upload_file. Best effort: titles, text, bullets, images, tables, simple charts and speaker notes come across, on the closest layout. The report says honestly what did not (animations, exact positions, shapes, SmartArt, video, custom fonts).',
  input: { file: z.string().describe('The uploaded .pptx file id'), title: z.string().optional(), theme: z.object(ThemeIn).optional() },
  output: z.object({ deck: DeckOut, report: z.object({ slides: z.number(), carried: z.array(z.string()), not_carried: z.array(z.string()) }).passthrough() }),
  run: async (ctx, a) => {
    const f = await ctx.app.files.readable(ctx.me, a.file);
    const { importPptx } = await import('./import-pptx.mjs');
    const { deck, report } = await importPptx(ctx.app, ctx.me, await ctx.app.files.read(f), { name: f.name });
    const id = await ctx.app.decks.create(ctx.me, { ...deck, title: a.title || deck.title, theme: normalTheme(a.theme ?? deck.theme ?? {}) }, { via: ctx.via });
    await ctx.app.decks.log(ctx.me, id, 'decks.deck.imported', { from: f.name, report }, ctx.via);
    return { deck: await deckView(ctx, await deckOf(ctx, id)), report };
  },
  text: (r) => `Imported "${r.deck.title}" (${r.deck.id}), ${r.report.slides} slides.\nCame across: ${r.report.carried.join('; ') || 'nothing'}\nDid not come across: ${r.report.not_carried.join('; ') || 'nothing'}`,
});

tool({
  name: 'decks.export_data', title: 'Export everything', scope: 'admin',
  description: 'Every deck of the team as JSON (slides, notes, theme, brand, comments, share links), plus a list of uploaded files. Returns a download link.',
  input: {},
  output: z.object({ file: FileRef, counts: z.object({}).passthrough() }),
  run: async (ctx) => {
    const data = await exportTeam(ctx.app, ctx.me.team_id);
    const file = await ctx.app.files.put(ctx.me, { name: `decks-export-${nowIso().slice(0, 10)}.json`, type: 'application/json', data: Buffer.from(JSON.stringify(data, null, 1)), isPublic: false });
    return { file: { ...file, url: `${ctx.app.publicUrl}${file.url}` }, counts: { decks: data.decks.length, comments: data.comments.length, files: data.files.length } };
  },
});

export async function exportTeam(app, teamId) {
  const rows = await app.db.all('select * from decks_decks where team_id = $1 and deleted_at is null order by created_at', [teamId]);
  const decks = [];
  for (const r of rows) decks.push({ id: r.id, created_at: r.created_at, updated_at: r.updated_at, archived: !!r.archived_at, ...(await app.decks.json(r.id)) });
  return {
    format: 'wos-decks/1', exported_at: nowIso(), team: await app.decks.team(teamId),
    people: await app.decks.people(teamId),
    decks,
    comments: await app.db.all('select * from decks_comments where team_id = $1 and deleted_at is null', [teamId]),
    shares: await app.db.all('select id, deck_id, kind, created_at, revoked_at, views from decks_shares where team_id = $1', [teamId]),
    files: (await app.db.all('select id, name, type, size, created_at from decks_files where team_id = $1', [teamId])).map(fileView),
  };
}

const slug = (s) => String(s || 'deck').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'deck';

// ---------- other apps: the CRM and the board ----------

tool({
  name: 'decks.link_record', title: 'Link to a CRM record', scope: 'write', emits: ['decks.deck.linked'],
  description: 'Tie a deck to a CRM record, like the deal it is for. Inside the wOS suite the record is looked up in the CRM and a note with the deck\'s link is logged on it; on its own, give a label and url.',
  input: { deck: DECK, record: z.string().describe('The CRM record id, like d_acme01 for a deal'), label: z.string().optional(), url: z.string().optional() },
  output: z.object({ links: z.array(z.object({ id: z.string(), kind: z.string() }).passthrough()) }).passthrough(),
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    let label = a.label, url = a.url, logged = false;
    if (ctx.call?.callTool) {
      try {
        const rec = await ctx.call.callTool('crm.open_record', { id: a.record });
        label ??= rec?.name ?? rec?.title ?? rec?.record?.name ?? a.record;
        url ??= `/a/crm/${/^d_/.test(a.record) ? 'deals' : /^o_/.test(a.record) ? 'organizations' : 'contacts'}/${a.record}`;
        const kind = /^d_/.test(a.record) ? 'deal' : /^o_/.test(a.record) ? 'org' : 'contact';
        await ctx.call.callTool('crm.log_activity', { type: 'note', subject: `Deck: ${row.title}`, body: `${ctx.app.publicUrl}/app#/d/${row.id}`, [kind]: a.record }).then(() => { logged = true; }, () => {});
      } catch (e) {
        if (e.code === 'no_tool' || /no_tool|off/.test(e.message)) throw new DeckError('The CRM is off for this team, so the record cannot be looked up. Give a label and url instead, or turn the CRM on.', 409);
        throw new DeckError(`The CRM could not find ${a.record}: ${e.message}`, 404);
      }
    } else if (!label) label = a.record;
    const link = { id: shortId('l'), kind: 'crm', record: a.record, label: String(label).slice(0, 120), url: url ? String(url).slice(0, 500) : (ctx.app.env.CRM_URL ? `${ctx.app.env.CRM_URL.replace(/\/$/, '')}/r/${encodeURIComponent(a.record)}` : null), at: nowIso(), by: ctx.me.name };
    const links = await addLink(ctx, row, link, 'decks.deck.linked');
    return { links, logged_on_record: logged };
  },
});

tool({
  name: 'decks.request_review', title: 'Ask for a review', scope: 'write', emits: ['decks.review.requested'],
  description: 'Ask someone to review the deck. Inside the wOS suite this makes a task on the board (for a client, given to a person, with a due date) that links to the deck; on its own it is recorded on the deck and posted as a comment.',
  input: { deck: DECK, client: z.string().optional().describe('The board client the task goes under (the suite\'s board needs one)'), assignee: z.string().optional().describe('Who reviews it (name)'), due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: z.string().max(2000).optional() },
  output: z.object({ links: z.array(z.object({}).passthrough()), task: z.any().optional() }).passthrough(),
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    const deckUrl = `${ctx.app.publicUrl}/app#/d/${row.id}`;
    let task = null, where = 'deck';
    if (ctx.call?.callTool) {
      try {
        task = await ctx.call.callTool('board.add_task', { client: a.client ?? 'Internal', title: `Review the deck "${row.title}"`, details: `${a.note ? `${a.note}\n\n` : ''}Open it: ${deckUrl}`, ...(a.assignee ? { assignee: a.assignee } : {}), ...(a.due ? { due: a.due } : {}) });
        where = 'board';
      } catch (e) {
        if (!(e.code === 'no_tool' || /no_tool/.test(e.message))) throw new DeckError(`The board did not take the task: ${e.message}`, 400);
      }
    }
    const link = { id: shortId('l'), kind: 'review', label: `Review${a.assignee ? ` by ${a.assignee}` : ''}${a.due ? `, due ${a.due}` : ''}`, task: task?.id ?? task?.task?.id ?? null, where, at: nowIso(), by: ctx.me.name };
    const links = await addLink(ctx, row, link, 'decks.review.requested');
    if (where === 'deck') await ctx.app.decks.addComment(ctx.me, row.id, { body: `Review requested${a.assignee ? ` from ${a.assignee}` : ''}${a.due ? ` by ${a.due}` : ''}.${a.note ? ` ${a.note}` : ''}` }, ctx.via);
    return { links, task, where, note: where === 'board' ? 'A board task was made.' : 'No board is connected here, so the request is on the deck and in its comments.' };
  },
});

tool({
  name: 'decks.unlink_record', title: 'Remove a link', scope: 'write', emits: ['decks.deck.linked'],
  description: 'Remove a CRM or review link from a deck.',
  input: { deck: DECK, link: z.string() },
  output: z.object({ links: z.array(z.object({}).passthrough()) }),
  run: async (ctx, a) => {
    const row = await deckOf(ctx, a.deck);
    let links;
    await ctx.app.decks.change(ctx.me, row.id, (doc) => { const d = doc.getMap('deck'); links = (d.get('links') ?? []).filter((l) => l.id !== a.link); d.set('links', links); }, { via: ctx.via, type: 'decks.deck.linked', data: { removed: a.link } });
    return { links };
  },
});

async function addLink(ctx, row, link, type) {
  let links;
  await ctx.app.decks.change(ctx.me, row.id, (doc) => { const d = doc.getMap('deck'); links = [...(d.get('links') ?? []), link].slice(-30); d.set('links', links); }, { via: ctx.via, type, data: { link } });
  return links;
}

// ---------- team ----------

tool({
  name: 'decks.add_person', title: 'Add someone', scope: 'admin', emits: ['decks.person.added'],
  description: 'Add a person to the team by email (and GitHub login if they use it). They can then sign in and edit every team deck.',
  input: { email: z.string().email(), name: z.string().optional(), github: z.string().optional(), role: z.enum(['member', 'admin']).optional() },
  output: z.object({ id: z.string(), name: z.string() }).passthrough(),
  run: async ({ app, me }, a) => {
    const have = await app.db.get('select id from decks_people where team_id = $1 and lower(email) = lower($2) and deactivated_at is null', [me.team_id, a.email]);
    if (have) throw new DeckError('That person is on the team already.');
    const p = await app.decks.addPerson(me.team_id, { name: a.name || a.email.split('@')[0], email: a.email, github: a.github ?? null, role: a.role ?? 'member' });
    return { id: p.id, name: p.name, email: p.email, role: p.role };
  },
});

tool({
  name: 'decks.remove_person', title: 'Remove someone', scope: 'admin', confirm: 'human', emits: ['decks.person.removed'],
  description: 'Take a person off the team. They are signed out everywhere; their decks and comments stay.',
  input: { person: z.string().describe('Their id or email') },
  output: Ok,
  run: async ({ app, me }, a) => {
    const p = await app.db.get('select * from decks_people where team_id = $1 and (id = $2 or lower(email) = lower($2)) and deactivated_at is null', [me.team_id, a.person]);
    if (!p) throw new DeckError('No one on the team by that id or email.', 404);
    if (p.role === 'owner') throw new DeckError('The owner cannot be removed.', 403);
    await app.db.run('update decks_people set deactivated_at = $2 where id = $1', [p.id, nowIso()]);
    return { ok: true };
  },
});

// ---------- approvals ----------

tool({
  name: 'decks.list_approvals', title: 'Waiting for your yes', scope: 'read',
  description: 'Things an AI app asked to do that need your yes first (sharing a deck publicly, deleting a deck, removing someone).',
  input: {},
  output: z.object({ approvals: z.array(z.object({ id: z.string(), tool: z.string(), status: z.string() }).passthrough()) }),
  run: async ({ app, me }) => ({ approvals: (await app.db.all(`select * from decks_approvals where person_id = $1 and status = 'waiting' order by created_at desc`, [me.id])).map(approvalView) }),
});

tool({
  name: 'decks.decide_approval', title: 'Approve or decline', scope: 'write',
  description: 'Say yes or no to something an AI app asked to do. Yes runs it as you. Only from the app, by a person.',
  input: { approval: z.string(), approve: z.boolean() },
  output: z.object({ id: z.string(), status: z.string() }).passthrough(),
  run: async (ctx, a) => {
    if (ctx.via !== 'web') throw new DeckError('Only a person can approve, from the app.', 403);
    const row = await ctx.app.db.get('select * from decks_approvals where id = $1 and person_id = $2', [a.approval, ctx.me.id]);
    if (!row || row.status !== 'waiting') throw new DeckError('Nothing waiting with that id.', 404);
    let status = 'declined', result = null;
    if (a.approve) {
      try { result = await runTool(ctx.app, ctx.me, row.tool, JSON.parse(row.input), { via: 'web', approved: true }); status = 'done'; } catch (e) { result = { error: e.message }; status = 'failed'; }
    }
    await ctx.app.db.run('update decks_approvals set status = $2, result = $3, decided_at = $4 where id = $1', [row.id, status, JSON.stringify(result), nowIso()]);
    return { ...approvalView({ ...row, status }), result };
  },
});

function approvalView(r) {
  let input = {};
  try { input = JSON.parse(r.input); } catch {}
  return { id: r.id, tool: r.tool, title: getTool(r.tool)?.title ?? r.tool, input, requested_by: r.requested_by, status: r.status, created_at: r.created_at };
}

// ---------- running tools ----------

export const CALLED = new Set();

export function listTools() {
  return TOOLS.map((t) => ({ ...t, inputJson: jsonSchema(z.object(t.input)), outputJson: jsonSchema(t.output) }));
}
export function getTool(name) { return TOOLS.find((t) => t.name === name || t.name === String(name).replace('_', '.')); }

function jsonSchema(s) {
  const j = zodToJsonSchema(s, { target: 'jsonSchema7', $refStrategy: 'none' });
  delete j.$schema;
  return j;
}

const SCOPES = ['read', 'write', 'delete', 'admin'];

// via: 'web' (a person clicked), 'mcp' or 'rest' (an app acting for a person), 'suite'.
export async function runTool(app, me, name, input = {}, { via = 'web', scopes = SCOPES, approved = false, client = null, call = null } = {}) {
  const t = getTool(name);
  if (!t) throw new DeckError(`No tool called ${name}.`, 404, 'no_tool');
  const parsed = z.object(t.input).strict().safeParse(input ?? {});
  if (!parsed.success) throw new DeckError(parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '), 400);
  if (!scopes.includes(t.scope)) throw new DeckError(`This connection may not ${t.scope} (it has ${scopes.join(', ')}).`, 403, 'scope');
  if (t.scope === 'admin' && !['owner', 'admin'].includes(me.role)) throw new DeckError('Only team owners and admins can do that.', 403);
  if (t.confirm === 'human' && via !== 'web' && !approved) {
    const id = newId('ap');
    await app.db.run('insert into decks_approvals (id, team_id, person_id, requested_by, tool, input, created_at) values ($1, $2, $3, $4, $5, $6, $7)',
      [id, me.team_id, me.id, client || via, t.name, JSON.stringify(parsed.data), nowIso()]);
    app.live?.publish({ team: me.team_id, deck: '*', type: 'approval', to: me.id });
    CALLED.add(t.name);
    return { pending: { approval_id: id, message: `${t.title} needs a person's yes. ${me.name} has been asked in the app (Settings, Waiting for your yes); nothing happened yet.` } };
  }
  const out = await t.run({ app, me, via: via === 'web' ? 'web' : via, call }, parsed.data);
  CALLED.add(t.name);
  return out;
}

export function toText(name, result) {
  const t = getTool(name);
  if (result?.pending) return result.pending.message;
  try { if (t?.text) return t.text(result); } catch {}
  return JSON.stringify(result);
}

export { newDoc };
