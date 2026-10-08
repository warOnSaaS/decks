// One deck's live copy in the browser: a Yjs document kept in step with the server.
// Typing changes the local copy at once; the changes go to the server through the decks.sync_doc tool
// (a quarter second at a time). Changes from others (people, or AI apps using the tools) arrive over
// the live socket, or through decks.get_changes after any tool call and whenever the socket is down.
import { Y, b64, deckFromDoc } from '../../lib/shared/model.mjs';

export class DeckSync {
  constructor(ctx, deckId, onChange) {
    this.ctx = ctx;
    this.deckId = deckId;
    this.doc = new Y.Doc();
    this.onChange = onChange;
    this.queue = [];
    this.timer = null;
    this.pulling = null;
    this.doc.on('update', (u, origin) => {
      if (origin === 'local') { this.queue.push(u); this.schedule(); }
      if (origin !== 'local') this.onChange?.({ remote: true });
    });
  }

  get deck() { return deckFromDoc(this.doc); }

  async load() {
    const r = await this.ctx.callTool('decks.get_changes', { deck: this.deckId });
    Y.applyUpdate(this.doc, b64.dec(r.update), 'server');
    return r;
  }

  // Bring in whatever the server has that this copy does not.
  pull() {
    if (this.pulling) { this.again = true; return this.pulling; }
    this.pulling = (async () => {
      try {
        const r = await this.ctx.callTool('decks.get_changes', { deck: this.deckId, state_vector: b64.enc(Y.encodeStateVector(this.doc)) });
        Y.applyUpdate(this.doc, b64.dec(r.update), 'server');
        return r;
      } finally {
        this.pulling = null;
        if (this.again) { this.again = false; this.pull(); }
      }
    })();
    return this.pulling;
  }

  applyRemote(updateB64) { try { Y.applyUpdate(this.doc, b64.dec(updateB64), 'server'); } catch { this.pull(); } }

  // A change made here: fn(doc) inside one transaction.
  local(fn) { this.doc.transact(() => fn(this.doc), 'local'); }

  schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 250); }

  async flush() {
    clearTimeout(this.timer);
    if (!this.queue.length) return;
    const update = Y.mergeUpdates(this.queue.splice(0));
    try { await this.ctx.callTool('decks.sync_doc', { deck: this.deckId, update: b64.enc(update) }); }
    catch (e) { this.queue.unshift(update); this.timer = setTimeout(() => this.flush(), 2000); throw e; }
  }

  // Run a tool, then catch up with what it changed.
  async tool(name, input) {
    await this.flush().catch(() => {});
    const out = await this.ctx.callTool(name, { deck: this.deckId, ...input });
    await this.pull().catch(() => {});
    return out;
  }
}
