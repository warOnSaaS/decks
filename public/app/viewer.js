// Public pages: scale slides to their boxes, present mode for a shared deck, the embed's arrows, and
// copy buttons on the connect tiles. No tools here: these pages only show.
(function () {
  'use strict';
  var fit = function (box) { var w = box.clientWidth; if (w) box.style.setProperty('--k', String(w / 960)); };
  var ro = 'ResizeObserver' in window ? new ResizeObserver(function (es) { es.forEach(function (e) { fit(e.target); }); }) : null;
  var watch = function (root) { (root || document).querySelectorAll('.dk-box').forEach(function (b) { fit(b); if (ro) ro.observe(b); }); };
  watch();
  window.addEventListener('resize', function () { watch(); });

  var toastEl = document.getElementById('toast'), toastT;
  var toast = function (m) { if (!toastEl) return; toastEl.textContent = m; toastEl.classList.add('is-on'); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2400); };
  var copy = function (s) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(s);
    var a = document.createElement('textarea'); a.value = s; document.body.appendChild(a); a.select();
    try { document.execCommand('copy'); } finally { a.remove(); }
    return Promise.resolve();
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy]');
    if (b) { copy(b.dataset.copy).then(function () { b.textContent = 'Copied'; toast('Copied. Paste it in your terminal.'); setTimeout(function () { b.textContent = 'Copy'; }, 2000); }); return; }
    var a = e.target.closest('[data-copy-also]');
    if (a) copy(a.dataset.copyAlso).then(function () { toast(a.dataset.copyNote || 'Opening Claude. The address is copied too.'); }, function () {});
  });

  // Present: the page's slides, one at a time, full screen.
  var slides = function () { return Array.prototype.slice.call(document.querySelectorAll('#slides .dk-box')); };
  var present = function (start) {
    var list = slides(); if (!list.length) return;
    var i = start || 0, idle;
    var el = document.createElement('div');
    el.className = 'pr'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Presenting');
    el.innerHTML = '<div class="pr-stage"></div><div class="pr-bar"><button type="button" data-a="prev" aria-label="Previous slide">‹</button><span></span><button type="button" data-a="next" aria-label="Next slide">›</button><button type="button" data-a="exit">Exit</button></div>';
    document.body.appendChild(el);
    var stage = el.querySelector('.pr-stage'), count = el.querySelector('.pr-bar span');
    var show = function () { stage.innerHTML = ''; var c = list[i].cloneNode(true); stage.appendChild(c); fit(c); if (ro) ro.observe(c); count.textContent = (i + 1) + ' / ' + list.length; };
    var go = function (d) { i = Math.max(0, Math.min(list.length - 1, i + d)); show(); };
    var exit = function () { document.removeEventListener('keydown', key); if (document.fullscreenElement) document.exitFullscreen().catch(function () {}); el.remove(); };
    var key = function (e) {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n'].indexOf(e.key) >= 0) { e.preventDefault(); go(1); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p'].indexOf(e.key) >= 0) { e.preventDefault(); go(-1); }
      else if (e.key === 'Home') { i = 0; show(); } else if (e.key === 'End') { i = list.length - 1; show(); }
      else if (e.key === 'Escape') exit();
      else if (e.key === 'f') { if (!document.fullscreenElement) el.requestFullscreen && el.requestFullscreen().catch(function () {}); }
    };
    document.addEventListener('keydown', key);
    el.addEventListener('click', function (e) {
      var a = e.target.closest('[data-a]');
      if (a) { if (a.dataset.a === 'exit') exit(); else go(a.dataset.a === 'next' ? 1 : -1); return; }
      go(e.clientX < innerWidth / 3 ? -1 : 1);
    });
    el.addEventListener('mousemove', function () { el.classList.add('is-moving'); clearTimeout(idle); idle = setTimeout(function () { el.classList.remove('is-moving'); }, 1800); });
    var x0 = null;
    el.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', function (e) { if (x0 == null) return; var dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); x0 = null; });
    if (el.requestFullscreen && matchMedia('(pointer: fine)').matches) el.requestFullscreen().catch(function () {});
    show();
  };
  document.querySelectorAll('[data-present]').forEach(function (b) { b.addEventListener('click', function () { present(0); }); });
  slides().forEach(function (b, k) { if (!document.querySelector('[data-embed]')) b.addEventListener('dblclick', function () { present(k); }); });

  // The embed: one slide at a time.
  var emb = document.querySelector('[data-embed]');
  if (emb) {
    var items = Array.prototype.slice.call(emb.querySelectorAll('.emb-slide')), j = 0;
    var cnt = emb.querySelector('[data-count]');
    var to = function (n) { j = Math.max(0, Math.min(items.length - 1, n)); items.forEach(function (it, k) { it.hidden = k !== j; }); cnt.textContent = (j + 1) + ' / ' + items.length; watch(items[j]); };
    emb.querySelector('[data-prev]').addEventListener('click', function () { to(j - 1); });
    emb.querySelector('[data-next]').addEventListener('click', function () { to(j + 1); });
    emb.querySelector('[data-full]').addEventListener('click', function () { if (document.fullscreenElement) document.exitFullscreen(); else emb.requestFullscreen && emb.requestFullscreen(); });
    emb.querySelector('.emb-stage').addEventListener('click', function (e) { to(e.clientX < innerWidth / 3 ? j - 1 : j + 1); });
    document.addEventListener('keydown', function (e) { if (['ArrowRight', ' ', 'PageDown'].indexOf(e.key) >= 0) { e.preventDefault(); to(j + 1); } if (['ArrowLeft', 'PageUp'].indexOf(e.key) >= 0) { e.preventDefault(); to(j - 1); } });
    to(0);
  }
})();
