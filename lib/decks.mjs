// The decks store: teams and people, decks as Yjs documents saved in the database, comments, share
// links, files and approvals. Tools (lib/tools.mjs) are the only callers; every change goes through
// change(), which saves the Yjs update, refreshes the deck's row, tells open editors and logs it.
import crypto from 'node:crypto';
import { Y, newDoc, deckFromDoc, b64 } from './shared/model.mjs';
import { slideText } from './shared/render.mjs';
import { newId, nowIso } from './ids.mjs';

export class DeckError extends Error {
  constructor(message, status = 400, code = status === 404 ? 'not_found' : status === 403 ? 'forbidden' : 'invalid_input') { super(message); this.status = status; this.code = code; }
}

const COMPACT_AFTER = 200;

export class Decks {
  constructor({ db, live }) {
    this.db = db;
    this.live = live;
    this.cache = new Map(); // deck id -> { doc, last }
  }

  // ---------- teams and people ----------

  async ensureTeam(id, name) {
    await this.db.run('insert into decks_teams (id, name, created_at) values ($1, $2, $3) on conflict do nothing', [id, name, nowIso()]);
  }
  async team(id) { return this.db.get('select * from decks_teams where id = $1', [id]); }

  async addPerson(teamId, { id, name, email = null, github = null, account_sub = null, role = 'member' }) {
    const pid = id ?? newId('p');
    await this.db.run('insert into decks_people (id, team_id, name, email, github, account_sub, role, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (id) do nothing',
      [pid, teamId, String(name || email || github || 'Someone').slice(0, 80), email ? String(email).toLowerCase() : null, github, account_sub, role, nowIso()]);
    return this.personRow(pid);
  }
  async personRow(id) { return id ? this.db.get('select * from decks_people where id = $1', [id]) : null; }
  async people(teamId) {
    return (await this.db.all('select id, name, email, github, role, created_at from decks_people where team_id = $1 and deactivated_at is null order by created_at', [teamId]));
  }
  prefs(me) { try { return JSON.parse(me.prefs || '{}'); } catch { return {}; } }

  // ---------- decks ----------

  async create(me, spec, { via = 'web', example = false, id = newId('d') } = {}) {
    const doc = newDoc(spec);
    const at = nowIso();
    const state = b64.enc(Y.encodeStateAsUpdate(doc));
    await this.db.tx(async (t) => {
      await t.run('insert into decks_decks (id, team_id, title, created_by, created_at, updated_at, updated_by, example) values ($1, $2, $3, $4, $5, $5, $4, $6)', [id, me.team_id, spec.title || 'Untitled deck', me.id, at, example ? 1 : 0]);
      await t.run('insert into decks_docs (deck_id, team_id, state, upto_id, updated_at) values ($1, $2, $3, 0, $4)', [id, me.team_id, state, at]);
    });
    this.cache.set(id, { doc, last: 0 });
    await this.#refreshRow(id, doc, me);
    await this.log(me, id, 'decks.deck.created', { title: spec.title }, via);
    return id;
  }

  // A deck this person may read: by id, or by its title within the team.
  async readable(me, ref, { includeDeleted = false } = {}) {
    if (!ref) throw new DeckError('Say which deck: its id or its title.');
    let row = await this.db.get('select * from decks_decks where id = $1 and team_id = $2', [ref, me.team_id]);
    if (!row) {
      const rows = await this.db.all('select * from decks_decks where team_id = $1 and lower(title) = lower($2) and deleted_at is null order by updated_at desc', [me.team_id, String(ref).trim()]);
      row = rows[0];
    }
    if (!row || (row.deleted_at && !includeDeleted)) throw new DeckError(`No deck called ${ref}. decks.list_decks lists them.`, 404);
    return row;
  }

  async list(me, { query = '', include_archived = false, limit = 100 } = {}) {
    const q = `%${String(query).toLowerCase()}%`;
    const rows = await this.db.all(`select * from decks_decks where team_id = $1 and deleted_at is null ${include_archived ? '' : 'and archived_at is null'} and (lower(title) like $2 or lower(search) like $2) order by updated_at desc limit ${Math.min(500, Number(limit) || 100)}`, [me.team_id, q]);
    return rows.map(rowView);
  }

  // The deck's Yjs document, brought up to date with every change saved since this copy last looked.
  async doc(deckId) {
    let c = this.cache.get(deckId);
    if (!c) {
      const s = await this.db.get('select state, upto_id from decks_docs where deck_id = $1', [deckId]);
      if (!s) throw new DeckError('That deck has no content.', 404);
      const doc = new Y.Doc();
      Y.applyUpdate(doc, b64.dec(s.state));
      c = { doc, last: Number(s.upto_id) };
      this.cache.set(deckId, c);
    }
    const rows = await this.db.all('select id, data from decks_updates where deck_id = $1 and id > $2 order by id', [deckId, c.last]);
    for (const r of rows) { Y.applyUpdate(c.doc, b64.dec(r.data), 'db'); c.last = Math.max(c.last, Number(r.id)); }
    return c.doc;
  }

  async json(deckId) { return deckFromDoc(await this.doc(deckId)); }

  // Change a deck. fn(doc) runs inside one Yjs transaction. Saves the update, refreshes the row,
  // tells open editors and logs the change.
  async change(me, deckId, fn, { via = 'web', type = 'decks.deck.updated', data = {}, quiet = false } = {}) {
    const doc = await this.doc(deckId);
    const before = Y.encodeStateVector(doc);
    let out;
    doc.transact(() => { out = fn(doc); }, 'tool');
    const update = Y.encodeStateAsUpdate(doc, before);
    await this.#save(me, deckId, doc, update, via);
    if (!quiet) await this.log(me, deckId, type, data, via);
    return out;
  }

  // An update made in an editor (letters typed, a list item changed): merged as it is.
  async applyUpdate(me, deckId, updateB64, via = 'web') {
    const doc = await this.doc(deckId);
    const before = Y.encodeStateVector(doc);
    try { Y.applyUpdate(doc, b64.dec(updateB64), 'client'); } catch { throw new DeckError('That change could not be read.'); }
    const update = Y.encodeStateAsUpdate(doc, before);
    await this.#save(me, deckId, doc, update, via);
    return { ok: true };
  }

  async changesSince(deckId, svB64) {
    const doc = await this.doc(deckId);
    let sv;
    try { sv = svB64 ? b64.dec(svB64) : undefined; } catch { sv = undefined; }
    return { update: b64.enc(Y.encodeStateAsUpdate(doc, sv)), state_vector: b64.enc(Y.encodeStateVector(doc)) };
  }

  async #save(me, deckId, doc, update, via) {
    // An empty update is two bytes: nothing changed.
    if (update.length <= 2) return;
    const at = nowIso();
    const data = b64.enc(update);
    const r = await this.db.run('insert into decks_updates (team_id, deck_id, data, by_id, via, created_at) values ($1, $2, $3, $4, $5, $6) returning id', [me.team_id, deckId, data, me.id, via, at]);
    const id = Number(r.rows[0].id);
    // Pick up anything another server copy saved in between (applying our own again changes nothing).
    await this.doc(deckId);
    await this.#refreshRow(deckId, doc, me);
    this.live?.publish({ deck: deckId, team: me.team_id, type: 'update', id, update: data.length < 6000 ? data : null, by: me.id });
    const n = await this.db.get('select count(*) as n from decks_updates where deck_id = $1', [deckId]);
    if (Number(n.n) > COMPACT_AFTER) await this.compact(deckId);
  }

  async compact(deckId) {
    const doc = await this.doc(deckId);
    const c = this.cache.get(deckId);
    const state = b64.enc(Y.encodeStateAsUpdate(doc));
    await this.db.tx(async (t) => {
      await t.run('update decks_docs set state = $2, upto_id = $3, updated_at = $4 where deck_id = $1', [deckId, state, c.last, nowIso()]);
      await t.run('delete from decks_updates where deck_id = $1 and id <= $2', [deckId, c.last]);
    });
  }

  async #refreshRow(deckId, doc, me) {
    const d = deckFromDoc(doc);
    const first = d.slides.find((s) => !s.hidden) ?? d.slides[0] ?? null;
    const cover = { theme: d.theme, brand: d.brand, slide: first };
    const search = d.slides.map(slideText).join(' ').slice(0, 20000).toLowerCase();
    await this.db.run('update decks_decks set title = $2, description = $3, slide_count = $4, cover = $5, search = $6, updated_at = $7, updated_by = $8 where id = $1',
      [deckId, d.title || 'Untitled deck', d.description ?? '', d.slides.length, JSON.stringify(cover), search, nowIso(), me?.id ?? null]);
  }

  async log(me, deckId, type, data = {}, via = 'web') {
    await this.db.run('insert into decks_activity (team_id, deck_id, type, actor_id, actor_name, via, data, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8)',
      [me.team_id, deckId, type, me.id, me.name, via, JSON.stringify(data), nowIso()]);
    this.live?.publish({ deck: deckId, team: me.team_id, type: 'activity', event: type, by: me.id, name: me.name, via, data });
  }

  async activity(me, deckId, limit = 50) {
    const rows = await this.db.all(`select * from decks_activity where team_id = $1 ${deckId ? 'and deck_id = $2' : ''} order by id desc limit ${Math.min(200, limit)}`, deckId ? [me.team_id, deckId] : [me.team_id]);
    return rows.map((r) => ({ id: Number(r.id), deck: r.deck_id, type: r.type, by: r.actor_name, via: r.via, data: JSON.parse(r.data || '{}'), at: r.created_at }));
  }

  // ---------- comments ----------

  async addComment(me, deckId, { slide = null, block = null, body, reply_to = null }, via) {
    if (!String(body ?? '').trim()) throw new DeckError('Write something in the comment.');
    let parent = null;
    if (reply_to) {
      parent = await this.db.get('select * from decks_comments where id = $1 and deck_id = $2 and deleted_at is null', [reply_to, deckId]);
      if (!parent) throw new DeckError('No comment to reply to with that id.', 404);
      slide = parent.slide_id; block = parent.block_id;
    }
    const id = newId('cm');
    await this.db.run('insert into decks_comments (id, team_id, deck_id, slide_id, block_id, parent_id, author_id, author_name, via, body, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
      [id, me.team_id, deckId, slide, block, parent?.id ?? null, me.id, me.name, via, String(body).slice(0, 4000), nowIso()]);
    await this.log(me, deckId, 'decks.comment.added', { comment: id, slide }, via);
    return this.comment(id);
  }
  async comment(id) { const r = await this.db.get('select * from decks_comments where id = $1', [id]); return r ? commentView(r) : null; }
  async comments(me, deckId, { slide = null, include_resolved = true } = {}) {
    const rows = await this.db.all(`select * from decks_comments where team_id = $1 and deck_id = $2 and deleted_at is null ${slide ? 'and slide_id = $3' : ''} order by created_at`, slide ? [me.team_id, deckId, slide] : [me.team_id, deckId]);
    const list = rows.map(commentView);
    const top = list.filter((c) => !c.reply_to).map((c) => ({ ...c, replies: list.filter((r) => r.reply_to === c.id) }));
    return include_resolved ? top : top.filter((c) => !c.resolved);
  }
  async commentFor(me, id) {
    const r = await this.db.get('select * from decks_comments where id = $1 and team_id = $2 and deleted_at is null', [id, me.team_id]);
    if (!r) throw new DeckError('No comment with that id.', 404);
    return r;
  }

  // ---------- share links ----------

  async share(me, deckId, kind) {
    const have = await this.db.get('select * from decks_shares where deck_id = $1 and kind = $2 and revoked_at is null', [deckId, kind]);
    if (have) return have;
    const id = newId('sh');
    const token = crypto.randomBytes(12).toString('base64url');
    await this.db.run('insert into decks_shares (id, team_id, deck_id, token, kind, created_by, created_at) values ($1, $2, $3, $4, $5, $6, $7)', [id, me.team_id, deckId, token, kind, me.id, nowIso()]);
    return this.db.get('select * from decks_shares where id = $1', [id]);
  }
  async shares(deckId) { return this.db.all('select * from decks_shares where deck_id = $1 and revoked_at is null order by created_at', [deckId]); }
  async byToken(token) {
    const s = await this.db.get('select * from decks_shares where token = $1 and revoked_at is null', [String(token)]);
    if (!s) return null;
    const deck = await this.db.get('select * from decks_decks where id = $1 and deleted_at is null', [s.deck_id]);
    return deck ? { share: s, deck } : null;
  }
}

export function rowView(r) {
  let cover = {};
  try { cover = JSON.parse(r.cover || '{}'); } catch {}
  return { id: r.id, title: r.title, description: r.description, slides: Number(r.slide_count), updated_at: r.updated_at, created_at: r.created_at, archived: !!r.archived_at, example: !!Number(r.example), cover };
}

function commentView(r) {
  return { id: r.id, deck: r.deck_id, slide: r.slide_id, block: r.block_id, reply_to: r.parent_id, author: { id: r.author_id, name: r.author_name }, via: r.via, body: r.body, resolved: !!r.resolved_at, created_at: r.created_at };
}
