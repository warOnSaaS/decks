// Loads Decks into a real wOS suite core (a checkout of warOnSaaS/suite) and drives it there: turn Decks
// on, build a deck, comment, export, and turn it off again. Needs Node 22.6 or newer (the suite is
// TypeScript run directly) and the suite next to this repo.
//   node scripts/suite-check.mjs [path-to-suite]      (default ~/wos-suite)
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

const suite = path.resolve(process.argv[2] ?? path.join(os.homedir(), 'wos-suite'));
const appDir = path.resolve(new URL('..', import.meta.url).pathname);
const { makeCore, person } = await import(path.join(suite, 'test/unit/helpers.ts'));

const core = await makeCore({ WOS_APPS: appDir });
const sam = await person(core, 'Sam');
const jordan = await person(core, 'Jordan', 'member', sam.team);
await sam.call('apps.enable', { app: 'decks' });
const d = await sam.call('decks.create_deck', { title: 'Acme Dental: board update', theme: { preset: 'calm' } });
await sam.call('decks.add_slide', { deck: d.id, layout: 'title', title: 'Board update' });
await sam.call('decks.add_slide', { deck: d.id, layout: 'content', title: 'Numbers', blocks: [{ t: 'stats', items: [{ value: '38%', label: 'Growth' }] }] });
await jordan.call('decks.add_comment', { deck: d.id, slide: 2, body: 'Add last year for comparison?' });
const deck = await jordan.call('decks.get_deck', { deck: d.id });
assert.equal(deck.slides.length, 2, 'a teammate sees the same deck');
const comments = await sam.call('decks.list_comments', { deck: d.id });
assert.equal(comments.comments.length, 1);
const pptx = await sam.call('decks.export_pptx', { deck: d.id });
assert.match(pptx.file.url, /\/files\/decks\//);
const review = await sam.call('decks.request_review', { deck: d.id, assignee: 'Jordan' });
const tools = [...core.catalogue.tools.keys()].filter((n) => n.startsWith('decks.'));
console.log(`suite check: Decks loaded into the suite, ${tools.length} tools in the catalogue; build, comment, export and review (${review.where}) work.`);
await sam.call('apps.disable', { app: 'decks' });
await assert.rejects(sam.call('decks.list_decks'));
console.log('suite check: turned off, its tools are gone.');
await core.stop();
process.exit(0);
