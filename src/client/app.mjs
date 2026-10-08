// wOS Decks screens. Every piece of data comes from a tool (POST /api/tools/<name>), the same tools
// agents use over MCP. Every button, menu item and form names its tool in data-tool; elements that only
// move around the screen say data-tool="none" with the reason in data-why.
// It is the suite's screen part (CONTRACTS.md): mount(el, ctx) draws into el and returns { unmount, update }.
import { $, $$, esc, ic, ago, fitAll, toast, dialog, download, copyText, mobile } from './util.mjs';
import { slideBox } from '../../lib/shared/render.mjs';
import { PRESETS, SCHEMES } from '../../lib/shared/themes.mjs';
import { connectTiles } from '../../lib/shared/connect.mjs';
import { openEditor } from './editor.mjs';
import { openPresent, openPresenter } from './present.mjs';

const nav = (why = 'moves to another screen') => `data-tool="none" data-why="${why}"`;

export function mount(el, ctx) {
  el.classList.add('decks-root');
  const S = { ctx, el, view: null, route: null, settings: null, decks: [], archived: false, query: '' };
  S.go = (p) => ctx.navigate(p);
  S.call = async (name, input) => {
    const r = await ctx.callTool(name, input);
    if (r && r.pending && !('result' in r)) toast(esc(r.pending.message));
    return r;
  };

  el.innerHTML = `<div class="decks-app" id="decks-app"></div><div class="ui-toast decks-toast" role="status" aria-live="polite"></div>`;
  const host = $('#decks-app', el);

  async function update(path = ctx.path) {
    ctx.path = path;
    const m = /^\/d\/([^/]+)(?:\/(present|presenter))?/.exec(path);
    S.view?.unmount?.();
    S.view = null;
    if (!S.settings) S.settings = await S.call('decks.get_settings', {}).catch(() => null);
    if (S.settings?.prefs?.theme && ctx.standalone) document.documentElement.dataset.mode = S.settings.prefs.theme;
    if (m && m[2] === 'present') { host.innerHTML = ''; S.view = await openPresent(host, S, m[1], Number(new URLSearchParams(path.split('?')[1] ?? '').get('at') ?? 0)); return; }
    if (m && m[2] === 'presenter') { host.innerHTML = ''; S.view = await openPresenter(host, S, m[1]); return; }
    if (m) { host.innerHTML = ''; S.view = await openEditor(host, S, m[1], path); return; }
    shell(path.startsWith('/settings') ? 'settings' : path.startsWith('/connect') ? 'connect' : 'decks');
    if (path.startsWith('/settings')) return renderSettings();
    if (path.startsWith('/connect')) return renderConnect();
    return renderDecks();
  }

  function shell(current) {
    const link = (href, key, icon, label) => `<a ${nav()} href="#${href}" data-nav="${key}"${current === key ? ' aria-current="page"' : ''}>${ic(icon, 18)}<span>${label}</span></a>`;
    host.innerHTML = `
    <aside class="ui-side" aria-label="Decks">
      <a ${nav()} class="ui-brand dk-brand" href="#/"><span class="dk-mark">${ic('screen', 15)}</span><span>${esc(ctx.team ?? S.settings?.team?.name ?? 'Decks')}</span></a>
      <nav class="ui-side-nav">${link('/', 'decks', 'grid', 'Decks')}${link('/connect', 'connect', 'spark', 'Connect your AI')}${link('/settings', 'settings', 'gear', 'Settings')}</nav>
      ${ctx.standalone ? `<div class="ui-side-low"><a class="ui-side-me" ${nav('opens the public front page')} href="/" target="_blank" rel="noopener"><span class="ui-avatar is-sm" data-tone="2">${esc((S.settings?.me?.name ?? '?')[0])}</span><span>${esc(S.settings?.me?.name ?? '')}<small>Host it yourself, free</small></span></a></div>` : ''}
    </aside>
    <div class="ui-main">
      <header class="ui-topbar"><a ${nav()} class="ui-brand dk-brand" href="#/"><span class="dk-mark">${ic('screen', 14)}</span><span>Decks</span></a><a ${nav()} class="ui-btn is-ghost is-sm" href="#/connect">${ic('spark')}<span>Connect AI</span></a></header>
      <div id="view"></div>
      <nav class="ui-dock" aria-label="Main">${link('/', 'decks', 'grid', 'Decks')}${link('/connect', 'connect', 'spark', 'Connect AI')}${link('/settings', 'settings', 'gear', 'Settings')}</nav>
    </div>`;
    el.removeAttribute('aria-busy');
  }

  // ---------- the decks list ----------

  async function renderDecks() {
    const v = $('#view', host);
    v.innerHTML = `<main class="ui-page dl">
      <div class="ui-ph"><div><h1>Decks</h1><p>Make one here, or ask your own AI to build it. <a ${nav()} href="#/connect">Connect your AI</a></p></div>
        <div class="dl-acts"><label class="ui-btn is-quiet" data-tool="decks.import_pptx">${ic('upload')}<span>Import PowerPoint</span><input type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" hidden data-tool="decks.import_pptx" id="imp"></label>
        <button type="button" class="ui-btn is-accent" data-tool="decks.create_deck" data-open="new" title="New deck (n)">${ic('plus')}<span>New deck</span></button></div></div>
      <form class="ui-toolbar dl-bar" data-tool="decks.list_decks" role="search"><label class="dl-search">${ic('search')}<input class="ui-input" name="q" type="search" placeholder="Find a deck or words on a slide" value="${esc(S.query)}" aria-label="Find a deck"></label>
        <label class="ui-check"><input type="checkbox" name="archived"${S.archived ? ' checked' : ''}><span>Show archived</span></label><button class="ui-btn is-quiet is-sm" type="submit">Find</button></form>
      <div class="dl-grid" id="dl-grid"><div class="dl-loading">Loading</div></div>
    </main>`;
    $('#imp', v).addEventListener('change', (e) => importPptx(e.target.files[0]));
    $('[data-open=new]', v).addEventListener('click', newDeck);
    $('.dl-bar', v).addEventListener('submit', (e) => { e.preventDefault(); const f = new FormData(e.target); S.query = f.get('q'); S.archived = !!f.get('archived'); loadDecks(); });
    $('.dl-bar [name=archived]', v).addEventListener('change', (e) => { S.archived = e.target.checked; loadDecks(); });
    await loadDecks();
  }

  async function loadDecks() {
    const grid = $('#dl-grid', host);
    if (!grid) return;
    const { decks } = await S.call('decks.list_decks', { query: S.query || undefined, include_archived: S.archived, covers: true });
    S.decks = decks;
    if (!decks.length) {
      grid.innerHTML = `<div class="ui-card dl-empty"><h2>${S.query ? 'Nothing matches' : 'No decks yet'}</h2><p>${S.query ? 'Try other words.' : 'Make your first deck, or connect your AI and ask it for one.'}</p><div class="dl-acts"><button type="button" class="ui-btn is-accent" data-tool="decks.create_deck" data-open="new2">${ic('plus')}<span>New deck</span></button><a ${nav()} class="ui-btn is-quiet" href="#/connect">${ic('spark')}<span>Connect your AI</span></a></div></div>`;
      $('[data-open=new2]', grid)?.addEventListener('click', newDeck);
      return;
    }
    // Covers come from list_decks: the first slide and the theme of each deck.
    const full = decks.map((d) => ({ ...d, first: d.cover?.slide ?? null }));
    grid.innerHTML = full.map((d) => `<article class="dl-card${d.archived ? ' is-archived' : ''}" data-deck="${esc(d.id)}">
      <a ${nav('opens the deck')} href="#/d/${esc(d.id)}" class="dl-cover">${d.first ? slideBox(d.first, { theme: d.cover?.theme ?? {}, brand: d.cover?.brand ?? {} }, { cls: 'is-thumb' }) : '<div class="dk-box dl-blank"></div>'}</a>
      <div class="dl-meta"><a ${nav('opens the deck')} href="#/d/${esc(d.id)}" class="dl-title">${esc(d.title)}</a><small>${d.slides} slide${d.slides === 1 ? '' : 's'} · ${ago(d.updated_at)}${d.archived ? ' · archived' : ''}</small></div>
      <div class="dl-menu"><button type="button" class="ui-btn is-ghost is-icon is-sm" data-tool="decks.duplicate_deck" data-act="dup" title="Duplicate" aria-label="Duplicate ${esc(d.title)}">${ic('copy')}</button><button type="button" class="ui-btn is-ghost is-icon is-sm" data-tool="decks.archive_deck" data-act="arch" title="${d.archived ? 'Bring back' : 'Archive'}" aria-label="${d.archived ? 'Bring back' : 'Archive'} ${esc(d.title)}">${ic('archive')}</button><button type="button" class="ui-btn is-ghost is-icon is-sm" data-tool="decks.delete_deck" data-act="del" title="Delete" aria-label="Delete ${esc(d.title)}">${ic('trash')}</button></div>
    </article>`).join('');
    fitAll(grid);
    grid.onclick = async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const id = b.closest('[data-deck]').dataset.deck;
      const d = S.decks.find((x) => x.id === id);
      try {
        if (b.dataset.act === 'dup') { const n = await S.call('decks.duplicate_deck', { deck: id }); toast(`Made ${esc(n.title)}.`); }
        if (b.dataset.act === 'arch') await S.call('decks.archive_deck', { deck: id, archived: !d.archived });
        if (b.dataset.act === 'del') {
          if (!confirm(`Delete "${d.title}" for everyone? Its share links stop working.`)) return;
          await S.call('decks.delete_deck', { deck: id });
          toast('Deleted.');
        }
        await loadDecks();
      } catch (err) { toast(esc(err.message)); }
    };
  }

  function newDeck() {
    const presets = Object.entries(PRESETS);
    const d = dialog(el, `<form method="dialog" class="dlg" data-tool="decks.create_deck">
      <header class="dlg-h"><h2>New deck</h2><button type="button" class="ui-btn is-ghost is-icon is-sm" data-close data-tool="none" data-why="closes the form" aria-label="Close">${ic('x')}</button></header>
      <label class="ui-field"><span>Title</span><input class="ui-input" name="title" required placeholder="Acme Dental: investor update" autofocus></label>
      <fieldset class="dlg-looks"><legend class="ui-label">Look</legend>${presets.map(([id, p], i) => `<label class="look"><input type="radio" name="preset" value="${id}"${i ? '' : ' checked'}><span class="look-sw" style="background:${SCHEMES[p.scheme][p.mode].bg};color:${SCHEMES[p.scheme][p.mode].ink}"><i style="background:${SCHEMES[p.scheme][p.mode].accent}"></i>Aa</span><small>${esc(id.replace('_', ' '))}</small></label>`).join('')}</fieldset>
      <label class="ui-field"><span>Start from</span><select class="ui-select" name="from"><option value="">A title slide</option><option value="acme">The investor update example</option><option value="birch">The client pitch example</option><option value="launch">The product launch example</option></select></label>
      <footer class="dlg-f"><button type="button" class="ui-btn is-quiet" data-close data-tool="none" data-why="closes the form">Cancel</button><button class="ui-btn is-accent" type="submit">Make it</button></footer></form>`);
    $('form', d).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        const input = { title: f.get('title'), theme: { preset: f.get('preset') } };
        if (f.get('from')) input.from_example = { acme: 'Acme Dental: investor update', birch: 'Birch Law: client pitch', launch: 'Relay: product launch' }[f.get('from')];
        else input.slides = [{ layout: 'title', title: f.get('title'), subtitle: '' }];
        const deck = await S.call('decks.create_deck', input);
        if (f.get('from')) await S.call('decks.apply_theme', { deck: deck.id, preset: f.get('preset') });
        d.close();
        S.go(`/d/${deck.id}`);
      } catch (err) { toast(esc(err.message)); }
    });
  }

  async function importPptx(file) {
    if (!file) return;
    toast('Reading the PowerPoint file…');
    try {
      const up = await ctx.upload(file);
      const r = await S.call('decks.import_pptx', { file: up.id });
      dialog(el, `<div class="dlg"><header class="dlg-h"><h2>Imported ${esc(r.deck.title)}</h2><button type="button" class="ui-btn is-ghost is-icon is-sm" data-close data-tool="none" data-why="closes the report" aria-label="Close">${ic('x')}</button></header>
        <p>${r.report.slides} slides came in. This is a best effort: check each slide.</p>
        <h3 class="ui-label">Came across</h3><ul class="ui-checks">${r.report.carried.map((x) => `<li>${esc(x)}</li>`).join('') || '<li class="is-open">Nothing</li>'}</ul>
        <h3 class="ui-label">Did not come across</h3><ul class="dlg-miss">${r.report.not_carried.map((x) => `<li>${esc(x)}</li>`).join('') || '<li>Nothing we know of</li>'}</ul>
        <footer class="dlg-f"><a ${nav('opens the imported deck')} class="ui-btn is-accent" href="#/d/${esc(r.deck.id)}" data-close>Open it</a></footer></div>`, { wide: true });
      await loadDecks();
    } catch (err) { toast(esc(err.message)); }
    const inp = $('#imp', host); if (inp) inp.value = '';
  }

  // ---------- connect ----------

  function renderConnect() {
    const v = $('#view', host);
    const hostUrl = S.settings?.server?.mcp?.replace(/\/mcp$/, '') ?? location.origin;
    v.innerHTML = `<main class="ui-page"><div class="ui-ph"><div><h1>Connect your AI</h1><p>Decks has no AI of its own. Connect the one you already pay for, then ask it to build, change, check and export decks. It works through the same tools as these screens.</p></div></div>
      ${connectTiles({ host: hostUrl, signedIn: true })}
      <section class="ui-card cx-try"><h2 class="ui-label">Things to ask</h2><ul class="ui-checks">
        <li class="is-open">Make a 10-slide investor update for Acme Dental with a revenue chart and three stats. Use the editorial look.</li>
        <li class="is-open">Look at every slide of the Birch Law pitch and fix any text that runs over.</li>
        <li class="is-open">Add speaker notes to every slide, then export a PDF and a PowerPoint.</li>
      </ul></section></main>`;
    v.onclick = (e) => {
      const b = e.target.closest('[data-copy]');
      if (b) { copyText(b.dataset.copy).then(() => { b.textContent = 'Copied'; toast('Copied. Paste it in your terminal.'); setTimeout(() => { b.textContent = 'Copy'; }, 2000); }); return; }
      const a = e.target.closest('[data-copy-also]');
      if (a) copyText(a.dataset.copyAlso).then(() => toast(esc(a.dataset.copyNote || 'Opening Claude. The address is copied too.')));
    };
  }

  // ---------- settings ----------

  async function renderSettings() {
    const v = $('#view', host);
    const s = S.settings = await S.call('decks.get_settings', {});
    const [{ people }, { approvals }] = await Promise.all([S.call('decks.list_people', {}), S.call('decks.list_approvals', {})]);
    const admin = ['owner', 'admin'].includes(s.me.role);
    v.innerHTML = `<main class="ui-page st">
      <div class="ui-ph"><div><h1>Settings</h1><p>${esc(s.team.name)}. Signed in as ${esc(s.me.name)}${s.me.email ? ` (${esc(s.me.email)})` : ''}.</p></div>${ctx.standalone ? `<a ${nav('signs out')} class="ui-btn is-quiet" href="/logout">Sign out</a>` : ''}</div>
      ${approvals.length ? `<section class="ui-card st-sect"><h2>Waiting for your yes</h2><p class="st-note">An AI app asked to do these. Nothing happens until you say yes.</p><div class="st-list">${approvals.map((a) => `<div class="st-row" data-ap="${esc(a.id)}"><div><b>${esc(a.title)}</b><small>${esc(a.requested_by)} asked ${ago(a.created_at)} · ${esc(JSON.stringify(a.input).slice(0, 120))}</small></div><div class="st-acts"><button type="button" class="ui-btn is-quiet is-sm" data-tool="decks.decide_approval" data-yes="0">Decline</button><button type="button" class="ui-btn is-accent is-sm" data-tool="decks.decide_approval" data-yes="1">Approve</button></div></div>`).join('')}</div></section>` : ''}
      <section class="ui-card st-sect"><h2>Look</h2><div class="ui-seg" role="group" aria-label="App look">${['auto', 'light', 'dark'].map((t) => `<button type="button" data-tool="decks.set_preferences" data-theme="${t}" aria-pressed="${(s.prefs.theme ?? 'auto') === t}">${t === 'auto' ? 'Follow device' : t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></section>
      <section class="ui-card st-sect"><h2>People</h2><div class="st-list">${people.map((p) => `<div class="st-row"><div class="st-who"><span class="ui-avatar is-sm" data-tone="${(p.name.charCodeAt(0) % 5) + 1}">${esc(p.name[0])}</span><div><b>${esc(p.name)}${p.me ? ' (you)' : ''}</b><small>${esc(p.email ?? p.github ?? '')} · ${esc(p.role)}</small></div></div>${admin && !p.me && p.role !== 'owner' ? `<button type="button" class="ui-btn is-danger is-sm" data-tool="decks.remove_person" data-person="${esc(p.id)}">Remove</button>` : ''}</div>`).join('')}</div>
        ${admin ? `<form class="st-add" data-tool="decks.add_person"><input class="ui-input" name="email" type="email" required placeholder="someone@company.example" aria-label="Email"><input class="ui-input" name="name" placeholder="Name (optional)" aria-label="Name"><button class="ui-btn is-quiet" type="submit">Add</button></form>` : ''}</section>
      <section class="ui-card st-sect"><h2>Your data</h2><p class="st-note">Everything is yours. Export every deck, slide, note, comment and link as one file at any time.</p>${admin ? '<button type="button" class="ui-btn is-quiet" data-tool="decks.export_data">' + ic('download') + '<span>Export everything</span></button>' : '<p class="st-note">Ask a team admin to export.</p>'}</section>
      <section class="ui-card st-sect"><h2>This server</h2><dl class="ui-kv"><dt>Database</dt><dd>${esc(s.server.storage)}</dd><dt>Files</dt><dd>${esc(s.server.files)}</dd><dt>Sign-in</dt><dd>${esc(s.server.sign_in)}</dd><dt>MCP address</dt><dd><code>${esc(s.server.mcp)}</code></dd><dt>Version</dt><dd>${esc(s.server.version)}</dd></dl>
        <p class="st-note">Host it yourself, free: <a ${nav('opens the source code')} href="https://github.com/warOnSaaS/decks" target="_blank" rel="noopener">github.com/warOnSaaS/decks</a>, one <code>docker compose up</code>.</p></section>
    </main>`;
    v.onclick = async (e) => {
      const b = e.target.closest('button[data-tool]');
      if (!b) return;
      try {
        if (b.dataset.theme) { await S.call('decks.set_preferences', { theme: b.dataset.theme }); S.settings = null; if (ctx.standalone) document.documentElement.dataset.mode = b.dataset.theme; return update('/settings'); }
        if (b.dataset.yes != null) { const r = await S.call('decks.decide_approval', { approval: b.closest('[data-ap]').dataset.ap, approve: b.dataset.yes === '1' }); toast(r.status === 'done' ? 'Done.' : r.status === 'declined' ? 'Declined.' : esc(r.result?.error ?? 'It did not work.')); return renderSettings(); }
        if (b.dataset.person) { if (!confirm('Remove this person from the team?')) return; await S.call('decks.remove_person', { person: b.dataset.person }); return renderSettings(); }
        if (b.dataset.tool === 'decks.export_data') { const r = await S.call('decks.export_data', {}); toast(`Export ready: ${r.counts.decks} decks.`); download(r.file.url); }
      } catch (err) { toast(esc(err.message)); }
    };
    $('.st-add', v)?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try { await S.call('decks.add_person', { email: f.get('email'), name: f.get('name') || undefined }); toast('Added. They can sign in now.'); renderSettings(); } catch (err) { toast(esc(err.message)); }
    });
  }

  // Keys on the list: n makes a deck.
  const onKey = (e) => {
    if (S.view || e.target.closest('input,textarea,select,[contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'n' && $('[data-open=new]', host)) { e.preventDefault(); newDeck(); }
  };
  document.addEventListener('keydown', onKey);

  update(ctx.path);
  window.decksReady = true;
  return {
    update,
    unmount() { S.view?.unmount?.(); document.removeEventListener('keydown', onKey); el.innerHTML = ''; },
  };
}

export { mobile };
