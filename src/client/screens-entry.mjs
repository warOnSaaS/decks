// The suite's screen part: the same screens as the standalone app, with Decks' styles carried inside
// (scoped to .decks-root so they cannot reach the shell or other apps). The suite gives ctx.callTool,
// ctx.on, ctx.path and ctx.navigate; uploads go to /files/decks and live changes arrive as
// decks.deck.changed events (the editor then catches up with decks.get_changes).
/* global DECKS_CSS */
import { mount as mountApp } from './app.mjs';

function addStyles() {
  if (document.getElementById('decks-css')) return;
  const s = document.createElement('style');
  s.id = 'decks-css';
  s.textContent = DECKS_CSS;
  document.head.appendChild(s);
}

export function mount(el, ctx) {
  addStyles();
  const c = {
    ...ctx,
    callTool: ctx.callTool.bind(ctx),
    navigate: ctx.navigate.bind(ctx),
    on: ctx.on ? ctx.on.bind(ctx) : undefined,
    path: ctx.path || '/',
    async upload(file) {
      const r = await fetch(`/files/decks?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream', 'x-wos': '1' }, body: file, credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error?.message || 'Upload failed.');
      return j.result;
    },
  };
  return mountApp(el, c);
}

export default { title: 'Decks', mount };
