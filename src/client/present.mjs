// Present mode (the audience screen) and presenter view (notes, a timer, the next slide).
// The two windows follow each other through a BroadcastChannel, so moving in either moves both.
// Moving between slides only changes what is on screen: no tools are called.
import { $, esc, ic, fitAll } from './util.mjs';
import { DeckSync } from './sync.mjs';
import { slideBox } from '../../lib/shared/render.mjs';

const help = (why) => `data-tool="none" data-why="${why}"`;

async function loadDeck(S, deckId, onChange) {
  const sync = new DeckSync(S.ctx, deckId, onChange);
  await sync.load();
  const live = S.ctx.live ? S.ctx.live(deckId, { onUpdate: (u) => sync.applyRemote(u), onStale: () => sync.pull().catch(() => {}), onPresence() {}, onHello() {} }) : null;
  return { sync, close: () => live?.close() };
}

export async function openPresent(host, S, deckId, start = 0) {
  let i = start;
  let ready = false;
  const { sync, close } = await loadDeck(S, deckId, () => { if (ready) draw(); });
  const shown = () => sync.deck.slides.filter((s) => !s.hidden);
  const chan = 'BroadcastChannel' in window ? new BroadcastChannel(`decks-present-${deckId}`) : null;
  host.innerHTML = `<div class="pr" id="pr" tabindex="-1" role="dialog" aria-label="Presenting">
    <div class="pr-stage" id="pr-stage"></div>
    <div class="pr-bar"><button type="button" ${help('shows the previous slide')} data-a="prev" aria-label="Previous slide">‹</button><span id="pr-n"></span><button type="button" ${help('shows the next slide')} data-a="next" aria-label="Next slide">›</button><button type="button" ${help('opens presenter view')} data-a="presenter">Presenter view</button><button type="button" ${help('goes full screen')} data-a="full">Full screen</button><button type="button" ${help('leaves present mode')} data-a="exit">Exit</button></div>
  </div>`;
  const pr = $('#pr', host);
  function draw() {
    ready = true;
    const list = shown();
    i = Math.max(0, Math.min(list.length - 1, i));
    const s = list[i];
    $('#pr-stage', host).innerHTML = s ? slideBox(s, sync.deck, { number: i + 1 }) : '<p style="color:#fff">No slides to show.</p>';
    fitAll($('#pr-stage', host));
    $('#pr-n', host).textContent = `${i + 1} / ${list.length}`;
  }
  const go = (n, tell = true) => { i = n; draw(); if (tell) chan?.postMessage({ i }); };
  const exit = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); S.go(`/d/${deckId}?slide=${sync.deck.slides.findIndex((x) => x.id === shown()[i]?.id) + 1}`); };
  if (chan) chan.onmessage = (e) => { if (typeof e.data?.i === 'number') go(e.data.i, false); };
  const key = (e) => {
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n', 'j'].includes(e.key)) { e.preventDefault(); go(i + 1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'k'].includes(e.key)) { e.preventDefault(); go(i - 1); }
    else if (e.key === 'Home') go(0); else if (e.key === 'End') go(shown().length - 1);
    else if (e.key === 'Escape') { if (!document.fullscreenElement) exit(); }
    else if (e.key === 'f') pr.requestFullscreen?.().catch(() => {});
    else if (e.key === 's' || e.key === 'P') openWin();
    else if (/^\d$/.test(e.key)) { const n = Number(e.key); go(n === 0 ? 9 : n - 1); }
  };
  const openWin = () => window.open(S.href(`/d/${deckId}/presenter?at=${i}`), `decks-presenter-${deckId}`, 'width=1200,height=760');
  document.addEventListener('keydown', key);
  pr.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]');
    if (a) { e.stopPropagation(); if (a.dataset.a === 'exit') exit(); else if (a.dataset.a === 'full') pr.requestFullscreen?.().catch(() => {}); else if (a.dataset.a === 'presenter') openWin(); else go(i + (a.dataset.a === 'next' ? 1 : -1)); return; }
    go(i + (e.clientX < innerWidth / 3 ? -1 : 1));
  });
  let idle;
  pr.addEventListener('mousemove', () => { pr.classList.add('is-moving'); clearTimeout(idle); idle = setTimeout(() => pr.classList.remove('is-moving'), 1800); });
  let x0 = null;
  pr.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  pr.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1)); x0 = null; });
  window.addEventListener('resize', draw);
  draw();
  pr.focus();
  return { unmount() { close(); chan?.close(); document.removeEventListener('keydown', key); window.removeEventListener('resize', draw); } };
}

export async function openPresenter(host, S, deckId, start = 0) {
  let i = start;
  let ready = false;
  const { sync, close } = await loadDeck(S, deckId, () => { if (ready) draw(); });
  const shown = () => sync.deck.slides.filter((s) => !s.hidden);
  const chan = 'BroadcastChannel' in window ? new BroadcastChannel(`decks-present-${deckId}`) : null;
  let started = null, paused = 0, running = false;
  host.innerHTML = `<div class="pv" id="pv">
    <header class="pv-top"><b>${esc(sync.deck.title)}</b><span class="pv-clock" id="pv-clock"></span>
      <div class="pv-timer"><span id="pv-time">0:00</span><button type="button" class="ui-btn is-quiet is-sm" ${help('starts or pauses the timer')} data-a="timer">Start</button><button type="button" class="ui-btn is-ghost is-sm" ${help('resets the timer')} data-a="reset">Reset</button></div>
      <a class="ui-btn is-ghost is-sm" ${help('goes back to the editor')} href="#/d/${esc(deckId)}">Done</a></header>
    <div class="pv-body">
      <section class="pv-now"><div id="pv-now"></div><div class="pv-nav"><button type="button" class="ui-btn is-quiet" ${help('shows the previous slide')} data-a="prev">${ic('back')}<span>Back</span></button><span id="pv-n"></span><button type="button" class="ui-btn is-accent" ${help('shows the next slide')} data-a="next"><span>Next</span></button></div></section>
      <aside class="pv-side"><div class="pv-next"><span class="ui-label">Next</span><div id="pv-next"></div></div><div class="pv-notes"><span class="ui-label">Notes</span><div id="pv-notes"></div></div></aside>
    </div></div>`;
  function draw() {
    ready = true;
    const list = shown();
    i = Math.max(0, Math.min(list.length - 1, i));
    $('#pv-now', host).innerHTML = list[i] ? slideBox(list[i], sync.deck, { number: i + 1 }) : '';
    $('#pv-next', host).innerHTML = list[i + 1] ? slideBox(list[i + 1], sync.deck, { number: i + 2 }) : '<p class="pv-end">End of the deck</p>';
    $('#pv-notes', host).innerHTML = list[i]?.notes ? esc(list[i].notes).replace(/\n/g, '<br>') : '<span class="pv-none">No notes for this slide.</span>';
    $('#pv-n', host).textContent = `${i + 1} of ${list.length}`;
    fitAll($('#pv', host));
  }
  const go = (n, tell = true) => { i = n; draw(); if (tell) chan?.postMessage({ i }); };
  if (chan) chan.onmessage = (e) => { if (typeof e.data?.i === 'number') go(e.data.i, false); };
  const fmt = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const tick = setInterval(() => {
    $('#pv-clock', host).textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    $('#pv-time', host).textContent = fmt(paused + (running ? Date.now() - started : 0));
  }, 500);
  const toggle = () => { if (running) { paused += Date.now() - started; running = false; } else { started = Date.now(); running = true; } $('[data-a=timer]', host).textContent = running ? 'Pause' : 'Start'; };
  host.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    if (a.dataset.a === 'timer') toggle();
    else if (a.dataset.a === 'reset') { paused = 0; started = Date.now(); }
    else go(i + (a.dataset.a === 'next' ? 1 : -1));
  });
  const key = (e) => {
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n', 'j'].includes(e.key)) { e.preventDefault(); if (!running && !paused) toggle(); go(i + 1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'k'].includes(e.key)) { e.preventDefault(); go(i - 1); }
    else if (e.key === 't') toggle();
  };
  document.addEventListener('keydown', key);
  window.addEventListener('resize', draw);
  draw();
  chan?.postMessage({ i });
  return { unmount() { close(); chan?.close(); clearInterval(tick); document.removeEventListener('keydown', key); window.removeEventListener('resize', draw); } };
}
