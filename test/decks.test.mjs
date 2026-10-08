import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import JSZip from 'jszip';
import { makeApp } from './helpers.mjs';
import { Y, b64, newDoc, deckFromDoc, findSlide, setPath } from '../lib/shared/model.mjs';
import { renderSlide } from '../lib/shared/render.mjs';
import { normalTheme, SCHEME_NAMES } from '../lib/shared/themes.mjs';
import { LAYOUT_NAMES, BLOCK_TYPES, BLOCKS } from '../lib/shared/layouts.mjs';

test('a deck built with tools: slides, blocks, notes, theme, brand, order', async () => {
  const { app, sam, run } = await makeApp();
  const d = await run(sam, 'decks.create_deck', { title: 'Acme pitch', theme: { preset: 'editorial' } }, { via: 'mcp' });
  assert.equal(d.theme.scheme, 'ember');
  const s1 = await run(sam, 'decks.add_slide', { deck: d.id, layout: 'title', title: 'Acme', subtitle: 'Hello' });
  const s2 = await run(sam, 'decks.add_slide', { deck: d.id, layout: 'content', title: 'Numbers', blocks: [{ t: 'stats', items: [{ value: '1', label: 'one' }] }] });
  const s3 = await run(sam, 'decks.add_slide', { deck: 'Acme pitch', layout: 'two_column', title: 'Two', after: 1 });
  let deck = await run(sam, 'decks.get_deck', { deck: d.id });
  assert.deepEqual(deck.slides.map((s) => s.id), [s1.id, s3.id, s2.id]);
  await run(sam, 'decks.reorder_slides', { deck: d.id, slide: s2.id, to: 1 });
  deck = await run(sam, 'decks.get_deck', { deck: d.id });
  assert.equal(deck.slides[0].id, s2.id);
  assert.equal(deck.slides[0].blocks[0].items[0].value, '1');
  const blk = await run(sam, 'decks.add_chart', { deck: d.id, slide: s3.id, slot: 'right', labels: ['a', 'b'], series: [{ name: 'x', values: [1, 2] }] });
  assert.equal(blk.slot, 'right');
  await run(sam, 'decks.update_block', { deck: d.id, slide: s2.id, block: 1, set: { items: [{ value: '42', label: 'answer' }] } });
  await run(sam, 'decks.set_notes', { deck: d.id, slide: 1, notes: 'Say hi' });
  await run(sam, 'decks.apply_theme', { deck: d.id, scheme: 'midnight', mode: 'dark' });
  await run(sam, 'decks.set_brand', { deck: d.id, accent: '#ff0066', footer: 'Acme', logo: 'javascript:alert(1)' });
  const dup = await run(sam, 'decks.duplicate_slide', { deck: d.id, slide: 1 });
  deck = await run(sam, 'decks.get_deck', { deck: d.id });
  assert.equal(deck.slides.length, 4);
  assert.equal(deck.slides[1].id, dup.id);
  assert.equal(deck.slides[1].notes, 'Say hi');
  assert.equal(deck.slides[0].blocks[0].items[0].value, '42');
  assert.equal(deck.theme.scheme, 'midnight');
  assert.equal(deck.brand.accent, '#ff0066');
  assert.equal(deck.brand.logo, undefined, 'a script address is never a logo');
  await run(sam, 'decks.move_block', { deck: d.id, slide: s3.id, block: blk.id, slot: 'left' });
  await run(sam, 'decks.remove_block', { deck: d.id, slide: s3.id, block: blk.id });
  await run(sam, 'decks.delete_slide', { deck: d.id, slide: dup.id });
  deck = await run(sam, 'decks.get_deck', { deck: d.id });
  assert.equal(deck.slides.length, 3);
  assert.equal(deck.slides.find((s) => s.id === s3.id).blocks.length, 0);
  const list = await run(sam, 'decks.list_decks', { query: 'answer' });
  assert.ok(list.decks.some((x) => x.id === d.id), 'search finds words on slides');
  const act = await run(sam, 'decks.list_activity', { deck: d.id });
  assert.ok(act.activity.some((a) => a.via === 'mcp'));
});

test('every layout and block type renders, in every scheme', async () => {
  for (const scheme of SCHEME_NAMES) {
    for (const layout of LAYOUT_NAMES) {
      const blocks = BLOCK_TYPES.slice(0, 4).map((t) => ({ ...BLOCKS[t].example, id: `b_${t}`, slot: layout === 'two_column' ? 'left' : 'main' }));
      const html = renderSlide({ id: 's', layout, title: 'T', subtitle: 'S', kicker: 'K', blocks, image: { url: 'https://images.example/x.jpg' } }, { theme: normalTheme({ scheme }), brand: {} }, { number: 1 });
      assert.match(html, new RegExp(`data-scheme="${scheme}"`));
    }
  }
  for (const t of BLOCK_TYPES) {
    const html = renderSlide({ id: 's', layout: 'content', title: 'x', blocks: [{ ...BLOCKS[t].example, id: 'b1' }] }, { theme: {}, brand: {} }, { editable: true });
    assert.match(html, /dk-block/, t);
  }
  const evil = renderSlide({ id: 's', layout: 'content', title: '<img src=x onerror=alert(1)>', blocks: [{ id: 'b', t: 'text', text: '<script>x</script>' }] }, { theme: {}, brand: {} });
  assert.ok(!/<script>|<img src=x/.test(evil), 'words are escaped');
});

test('two people typing in the same text at once both keep their letters', async () => {
  const { app, sam, jordan, run } = await makeApp();
  const d = await run(sam, 'decks.create_deck', { title: 'Live', slides: [{ layout: 'content', title: 'Hello world' }] });
  const a = new Y.Doc(), b = new Y.Doc();
  const start = await run(sam, 'decks.get_changes', { deck: d.id });
  Y.applyUpdate(a, b64.dec(start.update)); Y.applyUpdate(b, b64.dec(start.update));
  const id = d.slides[0].id;
  const edit = (doc, fn) => { const before = Y.encodeStateVector(doc); doc.transact(() => fn(findSlide(doc, id).m)); return b64.enc(Y.encodeStateAsUpdate(doc, before)); };
  const ua = edit(a, (m) => setPath(m, 'title', 'Hello big world'));
  const ub = edit(b, (m) => setPath(m, 'title', 'Hello world!'));
  await run(sam, 'decks.sync_doc', { deck: d.id, update: ua });
  await run(jordan, 'decks.sync_doc', { deck: d.id, update: ub });
  const deck = await run(sam, 'decks.get_deck', { deck: d.id });
  assert.equal(deck.slides[0].title, 'Hello big world!');
  // A tool change and an editor change at once merge too.
  const uc = edit(a, (m) => setPath(m, 'notes', 'from the editor'));
  await run(sam, 'decks.set_slide_content', { deck: d.id, slide: 1, subtitle: 'from an agent' }, { via: 'mcp' });
  await run(sam, 'decks.sync_doc', { deck: d.id, update: uc });
  const after = await run(sam, 'decks.get_slide', { deck: d.id, slide: 1 });
  assert.equal(after.subtitle, 'from an agent');
  assert.equal(after.notes, 'from the editor');
  // Catching up from a state vector brings only what is missing, and applies cleanly.
  const sv = b64.enc(Y.encodeStateVector(a));
  const diff = await run(sam, 'decks.get_changes', { deck: d.id, state_vector: sv });
  Y.applyUpdate(a, b64.dec(diff.update));
  assert.equal(deckFromDoc(a).slides[0].subtitle, 'from an agent');
  // Many changes are merged into one saved state now and then.
  for (let i = 0; i < 210; i++) await run(sam, 'decks.set_notes', { deck: d.id, slide: 1, notes: `n${i}` });
  const left = await app.db.get('select count(*) as n from decks_updates where deck_id = $1', [d.id]);
  assert.ok(Number(left.n) < 210, 'old changes were merged');
  app.decks.cache.clear();
  assert.equal((await run(sam, 'decks.get_slide', { deck: d.id, slide: 1 })).notes, 'n209', 'the saved state reads back the same');
});

test('comments, replies and resolving', async () => {
  const { sam, jordan, run } = await makeApp();
  const d = await run(sam, 'decks.create_deck', { title: 'C', slides: [{ layout: 'content', title: 'x' }] });
  const c = await run(jordan, 'decks.add_comment', { deck: d.id, slide: 1, body: 'Shorter title?' });
  await run(sam, 'decks.add_comment', { deck: d.id, reply_to: c.id, body: 'Done' });
  await run(sam, 'decks.resolve_comment', { comment: c.id });
  let list = (await run(sam, 'decks.list_comments', { deck: d.id })).comments;
  assert.equal(list.length, 1);
  assert.equal(list[0].replies.length, 1);
  assert.equal(list[0].resolved, true);
  assert.equal((await run(sam, 'decks.list_comments', { deck: d.id, open_only: true })).comments.length, 0);
  await assert.rejects(run(jordan, 'decks.delete_comment', { comment: list[0].replies[0].id }), /writer or an admin/);
  await run(sam, 'decks.delete_comment', { comment: c.id });
  list = (await run(sam, 'decks.list_comments', { deck: d.id })).comments;
  assert.equal(list.length, 0);
});

test('sharing asks a person first when an AI app does it, and a link can be turned off', async () => {
  const { app, sam, run } = await makeApp();
  const d = await run(sam, 'decks.create_deck', { title: 'S', slides: [{ layout: 'title', title: 'Hi' }] });
  const p = await run(sam, 'decks.share_deck', { deck: d.id }, { via: 'mcp' });
  assert.ok(p.pending, 'an app gets a pending approval');
  assert.equal((await run(sam, 'decks.list_shares', { deck: d.id })).shares.length, 0);
  const { approvals } = await run(sam, 'decks.list_approvals', {});
  await assert.rejects(run(sam, 'decks.decide_approval', { approval: approvals[0].id, approve: true }, { via: 'mcp' }), /Only a person/);
  const done = await run(sam, 'decks.decide_approval', { approval: approvals[0].id, approve: true });
  assert.equal(done.status, 'done');
  const s = (await run(sam, 'decks.list_shares', { deck: d.id })).shares[0];
  assert.match(s.url, /\/s\/[\w-]+$/);
  assert.ok(await app.decks.byToken(s.url.split('/').pop()));
  const e = await run(sam, 'decks.share_deck', { deck: d.id, kind: 'embed' });
  assert.match(e.embed_html, /<iframe/);
  await run(sam, 'decks.unshare_deck', { deck: d.id });
  assert.equal(await app.decks.byToken(s.url.split('/').pop()), null);
});

test('teams do not see each other\'s decks', async () => {
  const { app, sam, run } = await makeApp();
  const d = await run(sam, 'decks.create_deck', { title: 'Private' });
  const other = await app.decks.addPerson('t_other', { name: 'Riley', role: 'owner' });
  await assert.rejects(run(other, 'decks.get_deck', { deck: d.id }), /No deck/);
  assert.equal((await run(other, 'decks.list_decks', {})).decks.length, 0);
});

test('admin tools need an admin; scopes limit a connection', async () => {
  const { jordan, sam, run } = await makeApp();
  await assert.rejects(run(jordan, 'decks.export_data', {}), /owners and admins/);
  await assert.rejects(run(sam, 'decks.create_deck', { title: 'x' }, { via: 'mcp', scopes: ['read'] }), /may not write/);
  const ex = await run(sam, 'decks.export_data', {});
  assert.match(ex.file.url, /decks-export-.*\.json$/);
});

test('PowerPoint import: titles, bullets, a chart, a table, a picture and notes, with an honest report', async () => {
  const { sam, run, app } = await makeApp();
  const up = await run(sam, 'decks.upload_file', { name: 'sample.pptx', content_base64: fs.readFileSync(new URL('./fixtures/sample.pptx', import.meta.url)).toString('base64') });
  const r = await run(sam, 'decks.import_pptx', { file: up.id });
  const d = r.deck;
  assert.equal(d.slides.length, 6);
  assert.equal(d.slides[0].layout, 'title');
  assert.equal(d.slides[0].title, 'Pine Studio: quarterly review');
  assert.equal(d.slides[0].notes, 'Open with the headline numbers.');
  assert.deepEqual(d.slides[1].blocks[0].items, ['Three new clients', 'Two projects shipped early', 'No overtime in September']);
  const chart = d.slides[2].blocks[0];
  assert.equal(chart.t, 'chart');
  assert.deepEqual(chart.series.map((s) => s.values), [[120, 80, 45], [100, 90, 50]]);
  assert.equal(d.slides[3].blocks[0].t, 'table');
  assert.equal(d.slides[4].layout, 'image_left');
  assert.match(d.slides[4].image.url, /^\/files\/decks\//);
  assert.ok(r.report.not_carried.some((x) => /Drawn shapes/.test(x)));
  assert.ok(r.report.carried.some((x) => /charts/.test(x)));
  await assert.rejects(run(sam, 'decks.import_pptx', { file: (await run(sam, 'decks.upload_file', { name: 'x.pptx', content_base64: Buffer.from('nope').toString('base64') })).id }), /not a PowerPoint/);
  void app;
});

test('PowerPoint export makes a real .pptx with notes and charts', async () => {
  const { app, sam, run } = await makeApp();
  const ex = await app.exampleDeck('Acme Dental: investor update');
  const d = await run(sam, 'decks.create_deck', { title: 'Copy', from_example: 'Acme Dental: investor update' });
  assert.equal(d.slides.length, ex.slides.length);
  const r = await run(sam, 'decks.export_pptx', { deck: d.id });
  const row = await app.files.readable(sam, r.file.id);
  assert.equal(Number(row.public), 0, 'exports are private to the team');
  const zip = await JSZip.loadAsync(await app.files.read(row));
  const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  assert.equal(slides.length, ex.slides.length);
  assert.ok(Object.keys(zip.files).some((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f)), 'charts are native');
  assert.ok(Object.keys(zip.files).some((f) => /notesSlide/.test(f)), 'speaker notes are there');
  // And it comes back in.
  const back = await run(sam, 'decks.import_pptx', { file: r.file.id });
  assert.equal(back.deck.slides[1].title, '$4.2M');
});
