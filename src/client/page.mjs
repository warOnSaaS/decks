// The standalone page: makes the screen context the suite would otherwise give, and mounts the app.
// callTool posts to /api/tools/<name>; files stream to /files/decks; live editing comes over a
// WebSocket at /ws (polling with decks.get_changes while it is down); the place lives after the #.
import { mount } from './app.mjs';

const listeners = new Set();

const ctx = {
  standalone: true,
  me: window.DECKS?.me,
  team: window.DECKS?.team,
  path: location.hash.replace(/^#/, '') || '/',
  async callTool(name, input = {}) {
    const r = await fetch(`/api/tools/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), credentials: 'same-origin' });
    let j = {};
    try { j = await r.json(); } catch {}
    if (r.status === 401) { location.href = `/login?next=${encodeURIComponent('/app' + location.hash)}`; throw new Error('Signed out'); }
    if (r.status === 202 && j.pending) return j;
    if (!r.ok || j.error) throw new Error(j.error?.message || 'Something went wrong. Try again.');
    return j.result;
  },
  async upload(file) {
    const r = await fetch(`/files/decks?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file, credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error?.message || 'Upload failed.');
    return j.result;
  },
  on(name, fn) { listeners.add(fn); return () => listeners.delete(fn); },
  navigate(path, { replace = false } = {}) {
    if (replace) { history.replaceState(null, '', `#${path}`); ctx.path = path; view.update(path); }
    else location.hash = path;
  },
  // Live editing of one deck: a socket that brings Yjs updates and who is where.
  live(deck, h) {
    let ws, closed = false, backoff = 1000, poll = null;
    const startPoll = () => { if (!poll) poll = setInterval(() => h.onStale(), 2500); };
    const stopPoll = () => { clearInterval(poll); poll = null; };
    const connect = () => {
      if (closed) return;
      try { ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?deck=${encodeURIComponent(deck)}`); } catch { startPoll(); return; }
      const giveUp = setTimeout(() => { if (ws.readyState !== 1) startPoll(); }, 4000);
      ws.onopen = () => { clearTimeout(giveUp); backoff = 1000; stopPoll(); h.onStale(); document.body.dataset.live = 'socket'; };
      ws.onmessage = (m) => {
        let e;
        try { e = JSON.parse(m.data); } catch { return; }
        if (e.type === 'update') h.onUpdate(e.update, e.by);
        else if (e.type === 'stale') h.onStale();
        else if (e.type === 'presence') h.onPresence(e);
        else if (e.type === 'hello') { h.onHello?.(e); }
        else if (e.type === 'activity') h.onActivity?.(e);
      };
      ws.onclose = () => { clearTimeout(giveUp); if (closed) return; startPoll(); document.body.dataset.live = 'polling'; setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 30000); };
    };
    connect();
    return {
      presence(p) { if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'presence', ...p })); },
      close() { closed = true; stopPoll(); try { ws?.close(); } catch {} },
    };
  },
  toast() {},
};

const view = mount(document.getElementById('app'), ctx);
window.addEventListener('hashchange', () => { ctx.path = location.hash.replace(/^#/, '') || '/'; view.update(ctx.path); });
