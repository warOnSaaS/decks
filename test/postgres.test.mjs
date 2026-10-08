import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../lib/app.mjs';

// Postgres: two copies of the server start at once (migrations run once), and a change saved on one
// reaches an editor connected to the other through LISTEN/NOTIFY. Runs when DECKS_TEST_DATABASE_URL is set.
const url = process.env.DECKS_TEST_DATABASE_URL;

test('two server copies on one Postgres share live changes', { skip: !url && 'set DECKS_TEST_DATABASE_URL to run' }, async () => {
  const env = { DATABASE_URL: url, DECKS_TEAM_ID: `pg${Date.now().toString(36)}`, DECKS_EXAMPLES: '1', OAUTH_SECRET: 'pg' };
  const [a, b] = await Promise.all([createApp(env), createApp(env)]);
  try {
    const sam = await a.decks.addPerson(env.DECKS_TEAM_ID, { name: 'Sam Rivera', email: `sam+${Date.now()}@acme-dental.example`, role: 'owner' });
    const d = await a.run(sam, 'decks.create_deck', { title: 'Live on Postgres', slides: [{ layout: 'title', title: 'One' }] });
    const heard = new Promise((resolve) => {
      const ws = { readyState: 1, send: (m) => { const e = JSON.parse(m); if (e.type === 'update' || e.type === 'stale') resolve(e); } };
      b.live.join(d.id, { ws, me: sam, key: 'k' });
    });
    await a.run(sam, 'decks.set_slide_content', { deck: d.id, slide: 1, title: 'Two' });
    const e = await Promise.race([heard, new Promise((_, r) => setTimeout(() => r(new Error('no notification in 10s')), 10000))]);
    assert.ok(e.type === 'update' || e.type === 'stale');
    assert.equal((await b.run(sam, 'decks.get_slide', { deck: d.id, slide: 1 })).title, 'Two', 'the other copy reads the change');
    await b.run(sam, 'decks.add_slide', { deck: d.id, layout: 'content', title: 'From B' });
    assert.equal((await a.run(sam, 'decks.get_deck', { deck: d.id })).slides.length, 2, 'and the first copy reads the other way');
    assert.ok((await a.exampleRows()).length >= 3, 'the examples were made once');
  } finally { await a.close(); await b.close(); }
});
