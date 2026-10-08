// The public pages: the front page, example decks, share links, embeds and the connect page.
// Anyone may look; making and editing decks needs an account. All drawn from the same slide
// renderer as the editor, with the ui-design kit.
import { esc, slideBox, brandFontsLink, renderSlide } from './shared/render.mjs';
import { connectTiles } from './shared/connect.mjs';
import { MARK } from './auth.mjs';
import { slugOf } from './app.mjs';

const REPO = 'https://github.com/warOnSaaS/decks';
const ACCOUNT_URL = () => (process.env.WOS_ACCOUNT_URL || 'https://account.waronsaas.com').replace(/\/$/, '');
// Look freely, sign in to use: the shared account's script asks for sign-in only when someone acts.
const promptTag = (on, signedIn) => (on ? `<script src="${ACCOUNT_URL()}/prompt.js" defer data-signed-in="${signedIn ? 'true' : 'false'}" data-app="Decks" data-signin="/auth/waronsaas"></script>` : '');

export function head({ title, description = 'Pitch decks and presentations your team owns. Build them by hand or let your own AI build them.', v = '', extra = '', index = false }) {
  const q = v ? `?v=${esc(v)}` : '';
  return `<!doctype html><html lang="en" data-scheme="ops" data-mode="auto" data-shape="soft" data-type="grotesk" data-surface="bordered" data-density="comfortable"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">${index ? '' : '<meta name="robots" content="noindex">'}
<link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/icon-192.png"><link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/ui/fonts/geist.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/ui/src/ui.css${q}"><link rel="stylesheet" href="/ui/src/tokens.css${q}"><link rel="stylesheet" href="/app/deck-themes.css${q}"><link rel="stylesheet" href="/app/decks.css${q}">${extra}
</head>`;
}

const topbar = (signedIn, right = '') => `<header class="pub-top"><a class="pub-brand" href="/">${MARK}<span>Decks</span><em>by warOnSaaS</em></a><nav class="pub-nav">${right}<a href="/connect" class="hide-sm">Connect your AI</a><a href="/#self-host" class="hide-sm">Host it yourself, free</a>${signedIn ? '<a class="ui-btn is-accent is-sm" href="/app">Open your decks</a>' : '<a class="ui-btn is-quiet is-sm" href="/login">Sign in</a>'}</nav></header>`;

const deckCover = (d, href) => `<a class="pub-deck" href="${esc(href)}">${slideBox(d.cover.slide ?? { id: 'x', layout: 'title', title: d.title, blocks: [] }, { theme: d.cover.theme, brand: d.cover.brand }, { cls: 'is-thumb' })}<span class="pub-deck-t"><b>${esc(d.title)}</b><small>${d.slides} slides</small></span></a>`;

function heroArt(examples) {
  const pick = (title, n) => { const d = examples.find((x) => x.title.startsWith(title)); return d?.hero?.[n] ? slideBox(d.hero[n], { theme: d.cover.theme, brand: d.cover.brand }) : ''; };
  return `${pick('Birch', 0)}${pick('Relay', 1)}`;
}

export function landingPage({ examples, host, signedIn, version, prompt = false }) {
  return `${head({ title: 'Decks: pitch decks your AI can build, and you own', v: version, index: true })}<body class="pub">
${topbar(signedIn)}
<main class="pub-main">
  <section class="pub-hero"><div>
    <p class="pub-kicker"><span class="ui-chip is-outline">Free and open source</span></p>
    <h1>Pitch decks your AI can build, and you own.</h1>
    <p class="pub-lede">Make slides by hand, or ask Claude, ChatGPT or Codex to build the whole deck for you, on the AI plan you already pay for. Present with notes and a timer, share a link, export to PDF and PowerPoint.</p>
    <div class="pub-ctas"><a class="ui-btn is-accent is-lg" href="${signedIn ? '/app' : '/login?next=/app'}">${signedIn ? 'Open your decks' : 'Start making decks'}</a><a class="ui-btn is-quiet is-lg" href="#self-host">Host it yourself, free</a></div>
  </div><div class="pub-hero-art" aria-hidden="true">${heroArt(examples)}</div></section>

  <section class="pub-sect" aria-labelledby="ex-h">
    <div class="pub-sect-h"><h2 id="ex-h">Look around first</h2><p>Three example decks. Open one, press Present. No account needed to look.</p></div>
    <div class="pub-decks">${examples.map((d) => deckCover(d, `/examples/${slugOf(d.title)}`)).join('')}</div>
  </section>

  <section class="pub-sect" aria-labelledby="ai-h">
    <div class="pub-sect-h"><h2 id="ai-h">Connect your AI</h2><p>Decks has no AI of its own and never sells you credits. Your own AI does the writing and builds the slides through Decks' tools.</p></div>
    ${connectTiles({ host, signedIn })}
  </section>

  <section class="pub-sect" aria-labelledby="what-h">
    <div class="pub-sect-h"><h2 id="what-h">What it does</h2></div>
    <ul class="ui-cards pub-what">
      <li><div class="ui-card-t"><span>Slides from real parts</span></div><p>Stats, cards, tables, charts, timelines, quotes and images, in eleven layouts.</p></li>
      <li><div class="ui-card-t"><span>Every look of the kit</span></div><p>Eight colour schemes in light and dark, four faces, corners and surfaces, plus your logo, colour and fonts.</p></li>
      <li><div class="ui-card-t"><span>Edit together, live</span></div><p>Several people and their AI apps in one deck at once. Comments on every slide.</p></li>
      <li><div class="ui-card-t"><span>Present like a pro</span></div><p>Presenter view with notes, a timer and the next slide. Share a view-only link or embed it on a page.</p></li>
      <li><div class="ui-card-t"><span>PDF and PowerPoint</span></div><p>Export both, with editable text, tables and charts. Bring PowerPoint files in, with an honest note of what did not carry over.</p></li>
      <li><div class="ui-card-t"><span>Ties into your work</span></div><p>Link a deck to a deal in the CRM, or ask for a review as a task on the board.</p></li>
    </ul>
  </section>

  <section class="pub-sect" id="self-host" aria-labelledby="host-h">
    <div class="pub-sect-h"><h2 id="host-h">Two ways to run it</h2></div>
    <div class="pub-two">
      <div class="ui-card pub-way"><h3>Host it yourself, free</h3><p>One command and it is yours. Any Postgres, or SQLite on one computer. No licence key, no limits, no AI bill.</p><pre class="pub-code"><code>git clone ${REPO}
cd decks && docker compose up -d</code></pre><a class="ui-btn is-quiet" href="${REPO}">Get the code</a></div>
      <div class="ui-card pub-way"><h3>Host it with us</h3><p>We run it for you and charge what it costs us, times two, with the price shown openly. Move to your own server any time with one export.</p><pre class="pub-code"><code>Sign in, make a deck.
Your data exports at any time.</code></pre><a class="ui-btn is-accent" href="${signedIn ? '/app' : '/login?next=/app'}">${signedIn ? 'Open your decks' : 'Sign in'}</a></div>
    </div>
  </section>
</main>
<footer class="pub-foot"><span>wOS Decks is open source under the AGPL-3.0.</span><a href="${REPO}">Source</a><a href="/connect">Connect your AI</a><a href="/tools.json">Tools</a></footer>
<div class="ui-toast" id="toast" role="status" aria-live="polite"></div>
<script src="/app/viewer.js?v=${esc(version)}" defer></script>${promptTag(prompt, signedIn)}
</body></html>`;
}

// A deck to look at: every slide in a column, a Present button, nothing to edit.
export function viewerPage({ deck, title, signedIn, version, editHref = null, note = '', prompt = false }) {
  const slides = deck.slides.filter((s) => !s.hidden);
  return `${head({ title: `${title} · Decks`, v: version, extra: brandFontsLink(deck.brand) })}<body class="pub view">
${topbar(signedIn, editHref ? `<a href="${esc(editHref)}">Edit</a>` : '')}
<main class="view-main">
  <div class="view-h"><div><h1>${esc(title)}</h1><p>${slides.length} slides${note ? ` · ${esc(note)}` : ''}</p></div><button type="button" class="ui-btn is-accent" data-present data-tool="none" data-why="starts present mode on this page">Present</button></div>
  <div class="view-slides" id="slides">${slides.map((s, i) => slideBox(s, deck, { number: i + 1, total: slides.length })).join('')}</div>
  <p class="view-foot">Made with <a href="/">Decks</a>. ${signedIn ? '' : '<a href="/login?next=/app">Sign in</a> to make your own.'}</p>
</main>
<div class="ui-toast" id="toast" role="status" aria-live="polite"></div>
<script src="/app/viewer.js?v=${esc(version)}" defer></script>${promptTag(prompt, signedIn)}
</body></html>`;
}

// For an iframe on someone's site: one slide at a time, arrows, full screen.
export function embedPage({ deck, title, version, href }) {
  const slides = deck.slides.filter((s) => !s.hidden);
  return `${head({ title: `${title} · Decks`, v: version, extra: brandFontsLink(deck.brand) })}<body class="embed">
<div class="emb" data-embed>
  <div class="emb-stage" id="slides">${slides.map((s, i) => `<div class="emb-slide"${i ? ' hidden' : ''}>${slideBox(s, deck, { number: i + 1 })}</div>`).join('')}</div>
  <nav class="emb-bar" aria-label="Slides"><button type="button" class="ui-btn is-ghost is-sm" data-prev data-tool="none" data-why="shows the previous slide" aria-label="Previous slide">‹</button><span data-count>1 / ${slides.length}</span><button type="button" class="ui-btn is-ghost is-sm" data-next data-tool="none" data-why="shows the next slide" aria-label="Next slide">›</button><a class="emb-title" href="${esc(href)}" target="_blank" rel="noopener" data-tool="none" data-why="opens the deck in a new tab">${esc(title)}</a><button type="button" class="ui-btn is-ghost is-sm" data-full data-tool="none" data-why="goes full screen" aria-label="Full screen">⤢</button></nav>
</div>
<script src="/app/viewer.js?v=${esc(version)}" defer></script>
</body></html>`;
}

export function connectPage({ host, signedIn, version, prompt = false }) {
  return `${head({ title: 'Connect your AI · Decks', v: version, index: true })}<body class="pub">
${topbar(signedIn)}
<main class="pub-main pub-narrow">
  <div class="pub-sect-h"><h1 class="pub-h1">Use Decks from your AI app</h1><p class="pub-lede">Pick your app, click once, sign in once. Then ask it for a deck. Your AI plan does the work; Decks never charges for AI.</p></div>
  ${connectTiles({ host, signedIn })}
</main>
<div class="ui-toast" id="toast" role="status" aria-live="polite"></div>
<script src="/app/viewer.js?v=${esc(version)}" defer></script>${promptTag(prompt, signedIn)}
</body></html>`;
}

export function gonePage({ version }) {
  return `${head({ title: 'Link turned off · Decks', v: version })}<body class="gate"><main class="gate-card"><a class="gate-mark" href="/">${MARK}</a><h1>This link is turned off</h1><p>Whoever shared it has stopped sharing, or the deck is gone. Ask them for a new link.</p><p class="gate-foot"><a href="/">Go to Decks</a></p></main></body></html>`;
}

// The app's page: the editor and everything else signed-in people use, drawn by /app/decks.js.
export function appPage({ version, theme = 'auto', me, team }) {
  return `${head({ title: `${team} · Decks`, v: version }).replace('data-mode="auto"', `data-mode="${esc(theme)}"`)}<body class="dapp"><div id="app" class="decks-root" aria-busy="true"></div>
<script>window.DECKS=${JSON.stringify({ version, me: { id: me.id, name: me.name, role: me.role }, team }).replace(/</g, '\\u003c')}</script>
<script type="module" src="/app/decks.js?v=${esc(version)}"></script></body></html>`;
}

// One slide alone on a page at its real size, for the PDF export and previews.
export function printPage({ deck, version, slides, notes = false, start = 1 }) {
  const pages = slides.map((s, i) => `<div class="print-page">${renderSlide(s, deck, { number: i + start })}</div>${notes ? `<div class="print-page print-notes"><h2>Slide ${i + 1}${s.title ? `: ${esc(s.title)}` : ''}</h2><div>${esc(s.notes || 'No speaker notes.').replace(/\n/g, '<br>')}</div></div>` : ''}`).join('');
  return `${head({ title: 'Print', v: version, extra: brandFontsLink(deck.brand) }).replace('data-mode="auto"', 'data-mode="light"')}<body class="print">${pages}</body></html>`;
}
