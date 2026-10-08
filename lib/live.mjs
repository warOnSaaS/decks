// Live editing: open editors hold a WebSocket at /ws?deck=<id>. Every saved change goes to them as a
// Yjs update, with who is looking at which slide. With Postgres, changes made on another copy of the
// server arrive through LISTEN/NOTIFY; that copy's update is read back from the database when it is
// too big for a notification. If a socket drops, the editor asks decks.get_changes until it is back.
import crypto from 'node:crypto';

const CHANNEL = 'decks_live';

export class Live {
  constructor(db) {
    this.db = db;
    this.id = crypto.randomBytes(6).toString('hex');
    this.rooms = new Map(); // deck id -> Set of { ws, me, presence }
    this.listeners = new Set();
  }

  async start() {
    this.stopListening = await this.db.listen(CHANNEL, (payload) => this.#heard(payload));
  }
  async stop() { await this.stopListening?.(); }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  join(deck, client) {
    let room = this.rooms.get(deck);
    if (!room) this.rooms.set(deck, (room = new Set()));
    room.add(client);
    return () => { room.delete(client); this.publish({ deck, team: client.me.team_id, type: 'presence', who: client.key, gone: true }); };
  }

  present(deck) {
    return [...(this.rooms.get(deck) ?? [])].map((c) => c.presence).filter(Boolean);
  }

  publish(msg) {
    this.#deliver(msg);
    for (const fn of this.listeners) { try { fn(msg); } catch {} }
    let payload = JSON.stringify({ ...msg, origin: this.id });
    if (payload.length > 7500) payload = JSON.stringify({ ...msg, update: null, origin: this.id });
    this.db.notify(CHANNEL, payload).catch(() => {});
  }

  async #heard(payload) {
    let m;
    try { m = JSON.parse(payload); } catch { return; }
    if (m.origin === this.id) return;
    delete m.origin;
    if (m.type === 'update' && !m.update && m.id) {
      const r = await this.db.get('select data from decks_updates where id = $1', [m.id]).catch(() => null);
      if (!r) return;
      m.update = r.data;
    }
    this.#deliver(m);
  }

  #deliver(m) {
    const room = this.rooms.get(m.deck);
    if (!room) return;
    const out = JSON.stringify(m.type === 'update' && !m.update ? { ...m, type: 'stale' } : m);
    for (const c of room) {
      if (c.me.team_id !== m.team || c.ws.readyState !== 1) continue;
      if (m.type === 'presence' && m.who === c.key) continue;
      c.ws.send(out);
    }
  }
}
