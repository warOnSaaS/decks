// "Connect your AI": one-click tiles for Claude, ChatGPT, Claude Code and Codex, the same pattern as
// agent-kanban's connect page. Decks has no model of its own; the person's own AI does the writing,
// on their own subscription, through these tools. Shown on /connect and inside the app.
// The Claude tiles show a plain icon, not Anthropic's mark, until Anthropic says otherwise (G2).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const claudeInstallLink = (name, mcp) => `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent(name)}&connectorUrl=${encodeURIComponent(mcp)}`;
export const CHATGPT_APPS = 'https://chatgpt.com/#settings/Connectors';
export const claudeCodeLine = (mcp) => `claude mcp add --transport http --scope user wos-decks ${mcp}`;
export const codexLine = (mcp) => `codex mcp add wos-decks --url ${mcp}`;

const ICONS = {
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M20 12.5c0 3.6-3.6 6.5-8 6.5-1 0-2-.1-2.8-.4L4.5 20l1.2-3.4C4.6 15.5 4 14.1 4 12.5 4 8.9 7.6 6 12 6s8 2.9 8 6.5z"/><path d="M8.5 12.5h.01M12 12.5h.01M15.5 12.5h.01" stroke-width="2.4" stroke-linecap="round"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3.5 13.8 10.2 20.5 12l-6.7 1.8L12 20.5l-1.8-6.7L3.5 12l6.7-1.8z"/></svg>',
  term: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="m7 10 3 2.5L7 15M12.5 15H17"/></svg>',
  browser: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M12 17v3M8 20h8"/></svg>',
};

export function connectTiles({ host, name = 'Decks', signedIn = false }) {
  const mcp = `${host}/mcp`;
  const tile = (id, icon, title, where, action, hint) => `<section class="cx-tile" id="cx-${id}" aria-labelledby="cx-${id}-t">
  <div class="cx-top"><span class="cx-logo" aria-hidden="true">${ICONS[icon]}</span><div><h3 id="cx-${id}-t">${esc(title)}</h3><p class="cx-where">${esc(where)}</p></div></div>
  <div class="cx-act">${action}</div><p class="cx-hint">${esc(hint)}</p></section>`;
  const cmd = (line) => `<div class="ui-copy cx-cmd"><code>${esc(line)}</code><button type="button" class="ui-btn is-quiet is-sm" data-copy="${esc(line)}" data-tool="none" data-why="copies the command">Copy</button></div>`;
  const chat = [
    tile('claude', 'spark', 'Claude', 'Web, desktop and phone', `<a class="ui-btn is-accent is-lg" href="${esc(claudeInstallLink(`wOS ${name}`, mcp))}" target="_blank" rel="noopener" data-copy-also="${esc(mcp)}" data-tool="none" data-why="opens Claude to add the connector">Add to Claude</a>`, 'Click Add, then Connect, then sign in here once.'),
    tile('chatgpt', 'chat', 'ChatGPT', 'Web, with developer mode on', `<a class="ui-btn is-accent is-lg" href="${CHATGPT_APPS}" target="_blank" rel="noopener" data-copy-also="${esc(mcp)}" data-copy-note="Opening ChatGPT. The address is copied." data-tool="none" data-why="opens ChatGPT settings">Open in ChatGPT</a>`, 'Paste the copied address in Settings, Apps, Create.'),
  ];
  const term = [
    tile('claude-code', 'term', 'Claude Code', 'Terminal', cmd(claudeCodeLine(mcp)), 'Paste it in your terminal, then run /mcp to sign in.'),
    tile('codex', 'term', 'Codex', 'Terminal', cmd(codexLine(mcp)), 'Paste it in your terminal. Your browser opens to sign in.'),
  ];
  return `<div class="cx">
  <div class="cx-group"><h3 class="ui-label">Chat apps</h3><div class="cx-grid">${chat.join('')}</div></div>
  <div class="cx-group"><h3 class="ui-label">Terminal</h3><div class="cx-grid cx-term">${term.join('')}</div></div>
  <p class="cx-foot">Works with any app that speaks MCP: <code>${esc(mcp)}</code>. ${signedIn ? 'You will be asked to sign in once.' : 'Your AI signs in to your account here once.'} Then ask it: <i>"Make a 10-slide investor update for Acme Dental"</i>.</p>
</div>`;
}

export const CONNECT_CSS = `
.cx{display:grid;gap:var(--ui-s6)}
.cx-group{display:grid;gap:var(--ui-s3)}.cx-group>.ui-label{margin:0}
.cx-grid{display:grid;gap:var(--ui-s3);grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr))}
.cx-term{grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))}
.cx-tile{display:grid;grid-template-rows:auto 1fr auto;gap:var(--ui-s4);padding:var(--ui-s5);background:var(--ui-card);border:1px solid var(--ui-card-line);border-radius:var(--ui-radius-lg);box-shadow:var(--ui-card-shadow);min-width:0;transition:border-color var(--ui-dur) var(--ui-ease)}
.cx-tile:hover{border-color:var(--ui-accent-line)}
.cx-top{display:flex;gap:var(--ui-s3);align-items:center}
.cx-top h3{font-family:var(--ui-display);font-weight:var(--ui-weight-strong);font-size:18px;margin:0}
.cx-where{margin:2px 0 0;font-size:13px;color:var(--ui-ink-3)}
.cx-logo{flex:none;width:44px;height:44px;display:grid;place-items:center;border-radius:calc(var(--ui-radius) + 2px);background:var(--ui-surface-2);box-shadow:inset 0 0 0 1px var(--ui-line);color:var(--ui-ink)}
.cx-logo svg{width:24px;height:24px}
.cx-act{min-width:0}.cx-act>.ui-btn{width:100%}
.cx-cmd{display:flex;gap:8px;align-items:center;min-width:0}.cx-cmd code{flex:1;min-width:0;overflow-x:auto;white-space:nowrap;font-size:12.5px}
.cx-hint{margin:0;font-size:13px;color:var(--ui-ink-3)}
.cx-foot{margin:0;font-size:13.5px;color:var(--ui-ink-2);overflow-wrap:anywhere}
`;
