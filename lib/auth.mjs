import crypto from 'node:crypto';
import { esc } from './shared/render.mjs';
import { WosAccount } from './account-client.mjs';

// Sign-in. AUTH_PROVIDER picks how people sign in:
//   waronsaas  the shared warOnSaaS account (account.waronsaas.com), the default when WOS_ACCOUNT_CLIENT_ID is set
//   github     Sign in with GitHub, plus an email link for people without GitHub
//   local      an email link only (the default when GitHub is not set up)
// Agents (Claude, ChatGPT, Claude Code, Codex) connect to /mcp with standard MCP OAuth (discovery,
// dynamic client registration, PKCE) and the person signs in the same way. Tokens are signed and
// stateless; who is on the team comes from the database. Ported from wOS Chat and agent-kanban.

const SECRET = () => process.env.OAUTH_SECRET || process.env.SESSION_SECRET || 'dev-secret-change-me';
const GH_WEB = () => process.env.GITHUB_WEB_BASE || 'https://github.com';
const GH_API = () => process.env.GITHUB_API_BASE || 'https://api.github.com';
const now = () => Math.floor(Date.now() / 1000);
const DAY = 24 * 3600;
export const COOKIE = 'decks_session';
export const ALL_SCOPES = ['read', 'write', 'delete', 'admin'];

export function provider() {
  const p = String(process.env.AUTH_PROVIDER || '').toLowerCase();
  if (['waronsaas', 'github', 'local'].includes(p)) return p;
  if (process.env.WOS_ACCOUNT_CLIENT_ID) return 'waronsaas';
  return process.env.GITHUB_OAUTH_CLIENT_ID ? 'github' : 'local';
}

export function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', SECRET()).update(body).digest('base64url')}`;
}

export function verify(token, kind) {
  const [body, mac] = String(token ?? '').split('.');
  if (!body || !mac) return null;
  const want = crypto.createHmac('sha256', SECRET()).update(body).digest('base64url');
  if (want.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(mac))) return null;
  let p;
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
  if (p.k !== kind || (p.exp && p.exp < now())) return null;
  return p;
}

export const cookieOf = (req, name) => {
  const v = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(req.headers.cookie ?? '')?.[1];
  return v ? decodeURIComponent(v) : null;
};

const secureFlag = (host) => (host.startsWith('https://') ? '; Secure' : '');
export const setCookie = (host, name, value, maxAge) => `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly${secureFlag(host)}; SameSite=Lax; Max-Age=${maxAge}`;

async function activePerson(app, id) {
  const p = id ? await app.decks.personRow(id) : null;
  return p && !p.deactivated_at ? p : null;
}

// Who is asking, and how: { me, via, scopes, client }.
export async function identify(app, req) {
  const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (bearer) {
    const t = verify(bearer, 'access');
    const me = t && (await activePerson(app, t.id));
    if (me && t.sid && account() && !(await account().isLive(t.sid))) return null;
    return me ? { me, via: 'mcp', scopes: t.sc ?? ALL_SCOPES, client: t.a ?? null } : null;
  }
  const s = verify(cookieOf(req, COOKIE), 'access');
  const me = s && (await activePerson(app, s.id));
  // "Sign out everywhere" in the warOnSaaS account reaches here (checked at most once a minute).
  if (me && s.sid && account() && !(await account().isLive(s.sid))) return null;
  return me ? { me, via: 'web', scopes: ALL_SCOPES, client: null, sid: s.sid ?? null } : null;
}

export function issueTokens(person, { scopes = ALL_SCOPES, app: client, sid = null } = {}) {
  const base = { id: person.id, sc: scopes, ...(client ? { a: String(client).slice(0, 60) } : {}), ...(sid ? { sid } : {}) };
  return {
    access_token: sign({ k: 'access', ...base, exp: now() + 30 * DAY }),
    refresh_token: sign({ k: 'refresh', ...base, exp: now() + 365 * DAY }),
    token_type: 'bearer',
    expires_in: 30 * DAY,
    scope: scopes.join(' '),
  };
}

// ---------- discovery ----------

export const resourceMetadata = (host) => ({ resource: `${host}/mcp`, authorization_servers: [host], bearer_methods_supported: ['header'], resource_name: 'wOS Decks', scopes_supported: ALL_SCOPES });
export const serverMetadata = (host) => ({
  issuer: host,
  authorization_endpoint: `${host}/oauth/authorize`,
  token_endpoint: `${host}/oauth/token`,
  registration_endpoint: `${host}/oauth/register`,
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'],
  scopes_supported: ALL_SCOPES,
});
export const challenge = (host) => `Bearer resource_metadata="${host}/.well-known/oauth-protected-resource"`;

// ---------- MCP clients ----------

export async function handleRegister(req, res) {
  const b = await bodyObject(req);
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.filter(okRedirect) : [];
  if (!uris.length) return json(res, 400, { error: 'invalid_redirect_uri' });
  const client_id = sign({ k: 'client', r: uris, n: String(b.client_name ?? '').slice(0, 80) });
  json(res, 201, { client_id, client_name: b.client_name, redirect_uris: uris, grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', client_id_issued_at: now() });
}

function okRedirect(uri) {
  try {
    const u = new URL(uri);
    return u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname));
  } catch { return false; }
}

const scopesFrom = (s) => { const want = String(s ?? '').split(/[\s,]+/).filter((x) => ALL_SCOPES.includes(x)); return want.length ? want : ALL_SCOPES; };

export async function handleAuthorize(app, req, res, host) {
  const url = new URL(req.url, 'http://x');
  const q = Object.fromEntries(url.searchParams);
  const c = verify(q.client_id, 'client');
  if (!c || !c.r.includes(q.redirect_uri)) return page(res, 400, '<h1>This sign-in link is not valid</h1><p>Start again from your app.</p>');
  if (!q.code_challenge || (q.code_challenge_method ?? 'S256') !== 'S256') return page(res, 400, '<h1>This app must use PKCE</h1>');
  const who = await identify(app, { headers: { cookie: req.headers.cookie } });
  if (!who) {
    const next = `/oauth/authorize?${url.searchParams}`.replace(/[?&]__p=[^&]*/, '');
    res.writeHead(302, { location: `/login?next=${encodeURIComponent(next)}`, 'cache-control': 'no-store' }).end();
    return;
  }
  const code = sign({ k: 'code', id: who.me.id, sid: who.sid ?? null, c: q.client_id, r: q.redirect_uri, cc: q.code_challenge, sc: scopesFrom(q.scope), a: c.n, exp: now() + 300 });
  const to = new URL(q.redirect_uri);
  to.searchParams.set('code', code);
  if (q.state) to.searchParams.set('state', q.state);
  res.writeHead(302, { location: to.toString(), 'cache-control': 'no-store' }).end();
}

export async function handleToken(app, req, res) {
  const q = await bodyObject(req);
  const client = verify(q.client_id, 'client');
  if (!client) return json(res, 401, { error: 'invalid_client' });
  let grant = null;
  if (q.grant_type === 'authorization_code') {
    grant = verify(q.code, 'code');
    if (grant && (grant.c !== q.client_id || (q.redirect_uri && grant.r !== q.redirect_uri))) grant = null;
    if (grant && crypto.createHash('sha256').update(String(q.code_verifier ?? '')).digest('base64url') !== grant.cc) grant = null;
  } else if (q.grant_type === 'refresh_token') {
    grant = verify(q.refresh_token, 'refresh');
  }
  const me = grant && (await activePerson(app, grant.id));
  if (!me) return json(res, 400, { error: 'invalid_grant' });
  json(res, 200, issueTokens(me, { scopes: grant.sc ?? ALL_SCOPES, app: grant.a, sid: grant.sid ?? null }));
}

// ---------- browser sign-in ----------

const safeNext = (n) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/app');

export function loginPage(app, res, next = '/app', note = '') {
  const p = provider();
  const gh = p === 'github' && !!process.env.GITHUB_OAUTH_CLIENT_ID;
  const acct = p === 'waronsaas';
  const mail = p !== 'waronsaas' || process.env.EMAIL_LINKS === '1';
  const n = encodeURIComponent(next);
  page(res, 200, `<a class="gate-mark" href="/" aria-label="wOS Decks home">${MARK}</a><h1>Sign in to Decks</h1><p>Anyone can look at shared decks. To make and edit decks, sign in.${app.openSignup ? ' New here? Signing in makes your account and gives you three example decks to start from.' : ''}</p>${note ? `<p class="gate-note">${note}</p>` : ''}
  ${acct ? `<a class="ui-btn is-accent is-block is-lg" data-auth href="/auth/waronsaas?next=${n}">Sign in with your warOnSaaS account</a><p class="gate-note">GitHub, Google or email. One account for every warOnSaaS app.</p>` : ''}
  ${gh ? `<a class="ui-btn is-accent is-block is-lg" data-auth href="/login/github?next=${n}">Sign in with GitHub</a>` : ''}
  ${mail ? `<form method="post" action="/auth/email" class="gate-form" data-auth><input type="hidden" name="next" value="${esc(next)}"><label class="ui-field"><span>${gh || acct ? 'Or get a sign-in link by email' : 'Get a sign-in link by email'}</span><input class="ui-input" type="email" name="email" required placeholder="you@company.example" autocomplete="email"></label><button class="ui-btn ${gh || acct ? 'is-quiet' : 'is-accent'} is-block" type="submit">Email me a link</button></form>` : ''}
  <p class="gate-foot"><a href="/">Back to Decks</a> · <a href="/#self-host">Host it yourself, free</a></p>`);
}

export const MARK = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M12 17v3M8 20h8M7 9h6M7 12.5h10"/></svg>';

export function githubRedirect(res, host, next) {
  const state = sign({ k: 'gh', web: safeNext(next), exp: now() + 900 });
  const u = new URL(`${GH_WEB()}/login/oauth/authorize`);
  u.searchParams.set('client_id', process.env.GITHUB_OAUTH_CLIENT_ID ?? '');
  u.searchParams.set('redirect_uri', `${host}/oauth/github/callback`);
  u.searchParams.set('scope', 'read:user user:email');
  u.searchParams.set('state', state);
  res.writeHead(302, { location: u.toString(), 'cache-control': 'no-store' }).end();
}

export async function handleGithubCallback(app, req, res, host) {
  const q = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const st = verify(q.state, 'gh');
  if (!st || !q.code) return page(res, 400, '<h1>Sign-in expired</h1><p><a href="/login">Try again</a>.</p>');
  const tok = await fetch(`${GH_WEB()}/login/oauth/access_token`, {
    method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.GITHUB_OAUTH_CLIENT_ID, client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET, code: q.code, redirect_uri: `${host}/oauth/github/callback` }),
  }).then((r) => r.json()).catch(() => ({}));
  if (!tok.access_token) return page(res, 400, '<h1>GitHub sign-in failed</h1><p><a href="/login">Try again</a>.</p>');
  const gh = (p) => fetch(`${GH_API()}${p}`, { headers: { authorization: `Bearer ${tok.access_token}`, accept: 'application/vnd.github+json', 'user-agent': 'wos-decks' } }).then((r) => (r.ok ? r.json() : null));
  const [user, emails] = await Promise.all([gh('/user'), gh('/user/emails')]);
  if (!user?.login) return page(res, 400, '<h1>GitHub sign-in failed</h1><p><a href="/login">Try again</a>.</p>');
  const verified = (emails ?? []).filter((e) => e.verified).map((e) => e.email.toLowerCase());
  const me = await personForSignIn(app, { github: user.login, emails: verified, name: user.name || user.login });
  if (!me) return page(res, 403, `<h1>Hi @${esc(user.login)}</h1><p>You're signed in to GitHub, but you're not on this team yet. Ask a team admin to add <b>${esc(user.login)}</b>, then sign in again.</p>`);
  signedIn(res, host, me, st.web);
}

// ---------- the shared warOnSaaS account ----------
// account.waronsaas.com, through its own client library (lib/account-client.mjs, copied from warOnSaaS/account).

let accountClient;
export function account() {
  if (accountClient !== undefined) return accountClient;
  accountClient = WosAccount.fromEnv(process.env, { redirectUri: null, secret: SECRET() });
  return accountClient;
}

// GET /auth/waronsaas?next=/app[&prompt=none]
export function accountStart(req, res, host, { next, prompt = null, carry = null } = {}) {
  const a = account();
  if (!a) return page(res, 503, '<h1>Sign-in is not set up</h1><p>This server has no warOnSaaS account client (WOS_ACCOUNT_CLIENT_ID). Use another sign-in.</p><p><a href="/login">Back</a></p>');
  const { location, cookie } = a.start({ next: safeNext(next), prompt, carry, redirectUri: `${host}/auth/waronsaas/callback`, secure: host.startsWith('https://') });
  res.writeHead(302, { location, 'set-cookie': cookie, 'cache-control': 'no-store' }).end();
}

// GET /auth/waronsaas/callback
export async function accountFinish(app, req, res, host) {
  const a = account();
  if (!a) return page(res, 503, '<h1>Sign-in is not set up</h1>');
  const r = await a.finish(req);
  // Cancelled, or a silent try that found nobody: back where they were, still signed out, still able to look.
  if (r.error) return res.writeHead(302, { location: r.next && r.next !== '/app' ? r.next : '/', 'set-cookie': r.clear, 'cache-control': 'no-store' }).end();
  const p = r.profile;
  if (p.email && p.email_verified === false) return page(res, 403, '<h1>Confirm your email first</h1><p>Your warOnSaaS account has an email address that is not confirmed yet.</p>');
  const me = await personForSignIn(app, { sub: p.sub, github: p.github_login ?? null, emails: p.email ? [String(p.email).toLowerCase()] : [], name: p.name || String(p.email ?? 'Someone').split('@')[0] });
  if (!me) return page(res, 403, '<h1>Not on this team</h1><p>Ask a team admin to add your email.</p>');
  const t = issueTokens(me, { sid: p.sid });
  res.writeHead(302, { location: safeNext(r.next), 'set-cookie': [r.clear, setCookie(host, COOKIE, t.access_token, 30 * DAY)], 'cache-control': 'no-store' }).end();
}

// ---------- email links ----------

// Always the same answer, so the form never tells a stranger who is on the team.
export async function handleEmailStart(app, req, res, host, mailer) {
  const b = await bodyObject(req);
  const email = String(b.email ?? '').trim().toLowerCase();
  const next = safeNext(b.next);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return loginPage(app, res, next, 'That email address does not look right.');
  const known = await app.db.get('select id from decks_people where lower(email) = $1 and deactivated_at is null', [email]);
  const empty = !(await app.db.get('select id from decks_people where team_id = $1', [app.teamId]));
  if (known || empty || app.openSignup) {
    const t = sign({ k: 'email', e: email, web: next, exp: now() + 900 });
    const link = `${host}/auth/email/verify?t=${encodeURIComponent(t)}`;
    await mailer.send({ to: email, subject: 'Your sign-in link for Decks', text: `Here is your sign-in link for wOS Decks. It works for 15 minutes:\n\n${link}\n\nIf you did not ask for it, ignore this email.` });
  }
  page(res, 200, `<a class="gate-mark" href="/" aria-label="wOS Decks home">${MARK}</a><h1>Check your email</h1><p>${app.openSignup ? `A sign-in link is on its way to ${esc(email)}.` : `If ${esc(email)} is on this team, a sign-in link is on its way.`} It works for 15 minutes.</p>${mailer.ready ? '' : '<p class="gate-note">This server has no email set up (SMTP_URL), so the link was written to the server log.</p>'}`);
}

export async function handleEmailVerify(app, req, res, host) {
  const t = verify(new URL(req.url, 'http://x').searchParams.get('t'), 'email');
  if (!t) return page(res, 400, '<h1>That link has expired</h1><p><a href="/login">Get a new one</a>.</p>');
  // A GET shows a button; the POST signs in. Mail scanners that open links do not use them up.
  if (req.method !== 'POST') return page(res, 200, `<a class="gate-mark" href="/" aria-label="wOS Decks home">${MARK}</a><h1>Sign in as ${esc(t.e)}</h1><form method="post" data-auth><button class="ui-btn is-accent is-block is-lg" type="submit">Sign in</button></form>`);
  const me = await personForSignIn(app, { emails: [t.e], name: t.e.split('@')[0] });
  if (!me) return page(res, 403, '<h1>Not on this team</h1><p>Ask a team admin to add your email.</p>');
  signedIn(res, host, me, t.web);
}

function signedIn(res, host, me, next) {
  const t = issueTokens(me);
  res.writeHead(302, { location: safeNext(next), 'set-cookie': setCookie(host, COOKIE, t.access_token, 30 * DAY), 'cache-control': 'no-store' }).end();
}

// Someone already known, matched by account, GitHub login or a verified email. On a brand-new server
// the first person to sign in owns the team. With open sign-up (the hosted demo) anyone who signs in
// gets a team of their own with the example decks in it.
async function personForSignIn(app, { sub, github, emails = [], name }) {
  const db = app.db;
  if (sub) {
    const p = await db.get('select * from decks_people where account_sub = $1 and deactivated_at is null', [sub]);
    if (p) return p;
  }
  if (github) {
    const p = await db.get('select * from decks_people where lower(github) = $1 and deactivated_at is null', [github.toLowerCase()]);
    if (p) return p;
  }
  for (const e of emails) {
    const p = await db.get('select * from decks_people where lower(email) = $1 and deactivated_at is null order by created_at limit 1', [e]);
    if (p) {
      if (github && !p.github) await db.run('update decks_people set github = $2 where id = $1', [p.id, github]);
      if (sub && !p.account_sub) await db.run('update decks_people set account_sub = $2 where id = $1', [p.id, sub]);
      return p;
    }
  }
  if (app.openSignup) return app.newWorkspace({ name, email: emails[0] ?? null, github: github ?? null, account_sub: sub ?? null });
  const anyone = await db.get('select id from decks_people where team_id = $1', [app.teamId]);
  if (anyone) return null;
  return app.decks.addPerson(app.teamId, { name, email: emails[0] ?? null, github: github ?? null, account_sub: sub ?? null, role: 'owner' });
}

// ---------- bits ----------

export async function bodyObject(req, max = 1e6) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let s = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString() : '';
  if (!s) for await (const c of req) { s += c; if (s.length > max) break; }
  if (!s) return {};
  try { return (req.headers['content-type'] ?? '').includes('json') ? JSON.parse(s) : Object.fromEntries(new URLSearchParams(s)); } catch { return {}; }
}

export const json = (res, status, obj, headers = {}) => res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers }).end(JSON.stringify(obj));

export function page(res, status, inner) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }).end(`<!doctype html><html lang="en" data-scheme="ops" data-mode="auto" data-shape="soft" data-type="grotesk" data-surface="bordered"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · Decks</title><meta name="robots" content="noindex">
<link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="stylesheet" href="/ui/src/ui.css"><link rel="stylesheet" href="/ui/src/tokens.css"><link rel="stylesheet" href="/app/decks.css">
</head><body class="gate"><main class="gate-card">${inner}</main></body></html>`);
}
