// wOS Decks server: public pages, the app, the tools (REST at /api/tools/<name> and MCP at /mcp, one
// set of handlers), files, sign-in and live editing over WebSockets at /ws. Runs as a long-lived Node
// server (npm start, Docker) and as one Vercel function (api/index.mjs exports the same server).
//   npm run dev                              example decks, SQLite in ./data, sign-in links in the log
//   DATABASE_URL=postgres://... npm start    your team, on any Postgres
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createApp, VERSION, EXAMPLES_TEAM, slugOf } from './lib/app.mjs';
import { listTools, runTool, toText, getTool } from './lib/tools.mjs';
import { createMailer } from './lib/mail.mjs';
import { DeckError, rowView } from './lib/decks.mjs';
import { landingPage, viewerPage, embedPage, connectPage, gonePage, appPage } from './lib/pages.mjs';
import { register } from './lib/suite.mjs';
import {
  identify, setCookie, challenge, json, page, bodyObject, loginPage, githubRedirect, accountStart, accountFinish, account, provider,
  handleGithubCallback, handleEmailStart, handleEmailVerify, handleAuthorize, handleToken, handleRegister, resourceMetadata, serverMetadata, COOKIE,
} from './lib/auth.mjs';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const PUBLIC = path.join(ROOT, 'public');
const TYPES = { '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const DAY = 24 * 3600;

export const hostOf = (req) => {
  const h = req.headers['x-forwarded-host'] ?? req.headers.host;
  const proto = req.headers['x-forwarded-proto'] ?? (/^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(h ?? '') ? 'http' : 'https');
  return `${proto}://${h}`;
};
const pathOf = (req) => { const u = new URL(req.url, 'http://x'); return { url: u, p: u.searchParams.get('__p') ?? u.pathname }; };

export function createServer(appOrPromise) {
  const start = (x) => {
    const p = Promise.resolve(x ?? createApp()).then(async (app) => {
      app.mailer ??= await createMailer(app.env);
      attachLive(app, wss);
      return app;
    });
    p.catch((e) => { console.error('decks: could not start:', e); failedAt = Date.now(); });
    return p;
  };
  let failedAt = 0;
  let ready = start(appOrPromise);
  const getReady = () => {
    if (failedAt && !appOrPromise && Date.now() - failedAt > 5000) { failedAt = 0; ready = start(); server.ready = ready; }
    return ready;
  };
  const server = http.createServer(async (req, res) => {
    let app;
    try { app = await getReady(); } catch { return json(res, 503, { error: { code: 'unavailable', message: 'Decks could not start. Check DATABASE_URL and the server log.' } }); }
    if (!app.publicUrl) app.publicUrl = hostOf(req);
    try { await route(app, req, res); } catch (e) {
      if (!(e instanceof DeckError)) console.error(e);
      if (!res.headersSent) json(res, e.status ?? 500, { error: e instanceof DeckError ? { code: e.code, message: e.message } : { code: 'server', message: 'Something went wrong on our side. Try again.' } });
    }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  server.on('upgrade', async (req, socket, head) => {
    const { p, url } = pathOf(req);
    if (p !== '/ws') return socket.destroy();
    let app;
    try { app = await getReady(); } catch { return socket.destroy(); }
    const who = await identify(app, req).catch(() => null);
    const deck = url.searchParams.get('deck');
    const row = who && deck ? await app.decks.readable(who.me, deck).catch(() => null) : null;
    if (!row) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); return socket.destroy(); }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, who, row.id));
  });
  server.ready = ready;
  return server;
}

// ---------- live: one room per deck ----------

function attachLive(app, wss) {
  if (app.wsAttached) return;
  app.wsAttached = true;
  wss.on('connection', (ws, req, who, deckId) => {
    const key = `${who.me.id}:${Math.random().toString(36).slice(2, 8)}`;
    const client = { ws, me: who.me, key, presence: { who: key, id: who.me.id, name: who.me.name, slide: null, block: null } };
    const leave = app.live.join(deckId, client);
    ws.send(JSON.stringify({ type: 'hello', you: key, present: app.live.present(deckId) }));
    ws.on('message', (raw) => {
      const s = String(raw);
      if (s === 'ping') return ws.send('{"type":"pong"}');
      let m;
      try { m = JSON.parse(s); } catch { return; }
      // Presence only: which slide and block someone is on. Changes always go through the tools.
      if (m.type === 'presence') {
        client.presence = { who: key, id: who.me.id, name: who.me.name, slide: typeof m.slide === 'string' ? m.slide.slice(0, 40) : null, block: typeof m.block === 'string' ? m.block.slice(0, 40) : null };
        app.live.publish({ deck: deckId, team: who.me.team_id, type: 'presence', ...client.presence });
      }
    });
    const bye = () => { if (client.gone) return; client.gone = true; leave(); };
    ws.on('close', bye);
    ws.on('error', bye);
  });
  const timer = setInterval(() => { for (const c of wss.clients) if (c.readyState === 1) c.ping(); }, 25000);
  timer.unref?.();
}

// ---------- routes ----------

async function route(app, req, res) {
  const { url, p } = pathOf(req);
  const host = hostOf(req);
  if (req.method === 'GET' && (p.startsWith('/ui/') || p.startsWith('/app/') || ['/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/robots.txt'].includes(p))) return serveStatic(res, p);
  if (p === '/wos-app.json' || p === '/tools.json') return serveFile(res, path.join(ROOT, p.slice(1)), 'application/json');
  if (p === '/health') return json(res, 200, { ok: true, storage: app.db.kind, files: app.files.mode, sign_in: app.authProvider, version: VERSION });
  if (p === '/mcp') return handleMcp(app, req, res, host);
  if (p.startsWith('/.well-known/oauth-protected-resource')) return json(res, 200, resourceMetadata(host), { 'access-control-allow-origin': '*' });
  if (p.startsWith('/.well-known/oauth-authorization-server')) return json(res, 200, serverMetadata(host), { 'access-control-allow-origin': '*' });
  if (p === '/oauth/register') return handleRegister(req, res);
  if (p === '/oauth/token') return handleToken(app, req, res);
  if (p === '/oauth/authorize') return handleAuthorize(app, req, res, host);
  if (p === '/oauth/github/callback') return handleGithubCallback(app, req, res, host);
  if (p === '/auth/waronsaas') return accountStart(req, res, host, { next: url.searchParams.get('next'), prompt: url.searchParams.get('prompt') });
  if (p === '/auth/waronsaas/callback') return accountFinish(app, req, res, host);
  if (p === '/login') {
    if (await identify(app, req)) return redirect(res, safe(url.searchParams.get('next')));
    // With the shared account there is nothing to choose here: straight to account.waronsaas.com.
    if (provider() === 'waronsaas' && account()) return redirect(res, `/auth/waronsaas?next=${encodeURIComponent(safe(url.searchParams.get('next')))}`);
    return loginPage(app, res, url.searchParams.get('next') ?? '/app');
  }
  if (p === '/login/github') return process.env.GITHUB_OAUTH_CLIENT_ID ? githubRedirect(res, host, url.searchParams.get('next')) : loginPage(app, res, '/app', 'GitHub sign-in is not set up on this server. Use the email link.');
  if (p === '/auth/email' && req.method === 'POST') return handleEmailStart(app, req, res, host, app.mailer);
  if (p === '/auth/email/verify') return handleEmailVerify(app, req, res, host);
  if (p === '/logout') return res.writeHead(302, { location: provider() === 'waronsaas' && account() ? account().endSessionUrl(`${host}/`) : '/', 'set-cookie': setCookie(host, COOKIE, '', 0), 'cache-control': 'no-store' }).end();
  if (p === '/api/tools' && req.method === 'GET') return json(res, 200, { tools: catalogue() });
  if (p === '/api/openapi.json') return json(res, 200, openapi(host));
  if (p.startsWith('/api/tools/')) return handleTool(app, req, res, decodeURIComponent(p.slice('/api/tools/'.length)));
  if (p === '/files/decks' && req.method === 'POST') return handleUpload(app, req, res, url);
  if (p.startsWith('/files/decks/')) return handleDownload(app, req, res, p);
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 404, { error: { code: 'not_found', message: 'Not found' } });

  const who = await identify(app, req);
  const html = (body, status = 200) => res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(body);
  if (p === '/') return html(landingPage({ examples: (await app.exampleRows()).map(rowView), host, signedIn: !!who, version: VERSION, prompt: promptOn() }));
  if (p === '/connect') return html(connectPage({ host, signedIn: !!who, version: VERSION, prompt: promptOn() }));
  if (p.startsWith('/examples/')) {
    const slug = p.slice('/examples/'.length).replace(/\/$/, '');
    const r = (await app.exampleRows()).find((x) => slugOf(x.title) === slug || x.id === slug);
    if (!r) return html(gonePage({ version: VERSION }), 404);
    const deck = await app.decks.json(r.id);
    return html(viewerPage({ deck, title: deck.title, signedIn: !!who, version: VERSION, note: 'Example deck. Sign in to make a copy and edit it.', prompt: promptOn() }));
  }
  const share = /^\/(s|e)\/([\w-]{8,40})$/.exec(p);
  if (share) {
    const found = await app.decks.byToken(share[2]);
    if (!found || (share[1] === 'e') !== (found.share.kind === 'embed')) return html(gonePage({ version: VERSION }), 404);
    await app.db.run('update decks_shares set views = views + 1 where id = $1', [found.share.id]);
    const deck = await app.decks.json(found.deck.id);
    if (share[1] === 'e') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': 'frame-ancestors *' }).end(embedPage({ deck, title: deck.title, version: VERSION, href: `${host}/e/${share[2]}` }));
    const mine = who && who.me.team_id === found.deck.team_id;
    return html(viewerPage({ deck, title: deck.title, signedIn: !!who, version: VERSION, editHref: mine ? `/app#/d/${found.deck.id}` : null, prompt: promptOn() }));
  }
  if (p === '/app' || p.startsWith('/app/')) {
    if (!who) return redirect(res, `/login?next=${encodeURIComponent('/app')}`);
    const team = (await app.decks.team(who.me.team_id))?.name ?? 'Decks';
    return html(appPage({ version: VERSION, theme: app.decks.prefs(who.me).theme ?? 'auto', me: who.me, team }));
  }
  return html(gonePage({ version: VERSION }), 404);
}

const promptOn = () => provider() === 'waronsaas' && !!account();
const safe = (n) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/app');
const redirect = (res, to) => res.writeHead(302, { location: to, 'cache-control': 'no-store' }).end();

export function catalogue() {
  return listTools().map((t) => ({ name: t.name, title: t.title, description: t.description, input: t.inputJson, output: t.outputJson, scope: t.scope, confirm: t.confirm, emits: t.emits, ...(t.hidden ? { hidden: true } : {}) }));
}

export const toWire = (name) => name.replace('.', '_');

function openapi(host) {
  const paths = {};
  for (const t of catalogue()) {
    paths[`/api/tools/${toWire(t.name)}`] = { post: { operationId: toWire(t.name), summary: t.title, description: t.description, requestBody: { required: true, content: { 'application/json': { schema: t.input } } }, responses: { 200: { description: 'Done', content: { 'application/json': { schema: { type: 'object', properties: { result: t.output } } } } }, 202: { description: 'Waiting for a person\'s yes' } } } };
  }
  return { openapi: '3.1.0', info: { title: 'wOS Decks', version: VERSION }, servers: [{ url: host }], paths, components: { securitySchemes: { oauth: { type: 'oauth2', flows: { authorizationCode: { authorizationUrl: `${host}/oauth/authorize`, tokenUrl: `${host}/oauth/token`, scopes: { read: 'Read', write: 'Write', delete: 'Delete', admin: 'Admin' } } } } } }, security: [{ oauth: ['read', 'write'] }] };
}

async function handleTool(app, req, res, name) {
  if (req.method !== 'POST') return json(res, 405, { error: { code: 'method', message: 'Use POST' } }, { allow: 'POST' });
  const who = await identify(app, req);
  if (!who) return json(res, 401, { error: { code: 'sign_in', message: 'Sign in first.' } }, { 'www-authenticate': challenge(hostOf(req)) });
  if (who.via === 'web' && req.headers.origin && req.headers.origin !== hostOf(req)) return json(res, 403, { error: { code: 'forbidden', message: 'Wrong origin.' } });
  const input = await bodyObject(req, 8e6);
  const result = await runTool(app, who.me, name, input, { via: who.via === 'mcp' ? 'rest' : 'web', scopes: who.scopes, client: who.client });
  if (result?.pending) return json(res, 202, result);
  json(res, 200, { result });
}

async function handleMcp(app, req, res, host) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Use POST (this is an MCP endpoint)' }, { allow: 'POST' });
  const who = await identify(app, { headers: { authorization: req.headers.authorization } });
  if (!who) return json(res, 401, { error: 'Sign in to use Decks.' }, { 'www-authenticate': challenge(host) });
  const server = new McpServer({ name: 'wos-decks', version: VERSION }, { instructions: INSTRUCTIONS });
  for (const t of listTools()) {
    if (!who.scopes.includes(t.scope)) continue;
    server.registerTool(toWire(t.name), {
      title: t.title, description: t.description + (t.confirm === 'human' ? ' Needs a person\'s yes: it asks them in the app first.' : ''), inputSchema: t.input,
      annotations: { readOnlyHint: t.scope === 'read', destructiveHint: t.scope === 'delete' || t.confirm === 'human', openWorldHint: false },
    }, async (args) => {
      try {
        const out = await runTool(app, who.me, t.name, args ?? {}, { via: 'mcp', scopes: who.scopes, client: who.client });
        if (t.image && out?.image_base64) {
          const { image_base64, ...rest } = out;
          return { content: [{ type: 'image', data: image_base64, mimeType: out.mime }, { type: 'text', text: JSON.stringify(rest) }] };
        }
        return { content: [{ type: 'text', text: t.text && !out?.pending ? `${toText(t.name, out)}\n\n${JSON.stringify(out)}` : JSON.stringify(out) }], structuredContent: out };
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: e.message }] };
      }
    });
  }
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, await bodyObject(req, 8e6));
}

export const INSTRUCTIONS = `This is wOS Decks: pitch decks and presentations. You build the deck; Decks has no AI of its own.
To build a deck: read decks_list_layouts and decks_list_themes once, then decks_create_deck with a title, a theme and the slides (or add them one by one with decks_add_slide). Change a slide with decks_set_slide_content, one block with decks_update_block, add charts with decks_add_chart and images with decks_add_image.
Good decks: one idea per slide, a title that says the point, one to three blocks per slide, numbers as stats or charts, what to say in speaker notes. Open with a title slide and end with a closing slide.
Check your work with decks_preview_slide. Export with decks_export_pdf and decks_export_pptx. Share with decks_share_deck (the person says yes first).
Never invent facts or numbers about a real company; ask the person.`;

async function readBody(req, max) {
  if (Buffer.isBuffer(req.body)) return req.body;
  const chunks = [];
  let n = 0;
  for await (const c of req) { n += c.length; if (n > max) throw new DeckError(`The file is over ${Math.round(max / 1048576)} MB.`, 413); chunks.push(c); }
  return Buffer.concat(chunks);
}

async function handleUpload(app, req, res, url) {
  const who = await identify(app, req);
  if (!who) return json(res, 401, { error: { code: 'sign_in', message: 'Sign in first.' } });
  if (!who.scopes.includes('write')) return json(res, 403, { error: { code: 'scope', message: 'This connection may not write.' } });
  if (who.via === 'web' && req.headers.origin && req.headers.origin !== hostOf(req)) return json(res, 403, { error: { code: 'forbidden', message: 'Wrong origin.' } });
  const data = await readBody(req, app.files.max);
  const file = await app.files.put(who.me, { name: url.searchParams.get('name') ?? 'file', type: req.headers['content-type'], data });
  json(res, 200, { result: file });
}

async function handleDownload(app, req, res, p) {
  const id = /^\/files\/decks\/(f_[\w-]+)/.exec(p)?.[1];
  const row = id ? await app.files.row(id) : null;
  if (!row) return json(res, 404, { error: { code: 'not_found', message: 'No such file.' } });
  if (!Number(row.public)) {
    const who = await identify(app, req);
    if (!who || who.me.team_id !== row.team_id) return json(res, 401, { error: { code: 'sign_in', message: 'Sign in to download this file.' } });
  }
  const data = await app.files.read(row);
  const inline = /^image\//.test(row.type) || row.type === 'application/pdf';
  res.writeHead(200, {
    'content-type': row.type, 'content-length': data.length,
    'cache-control': Number(row.public) ? 'public, max-age=31536000, immutable' : 'private, no-store',
    'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${row.name.replace(/"/g, '')}"`,
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox", 'x-content-type-options': 'nosniff',
  }).end(data);
}

function serveStatic(res, p) {
  const file = path.join(PUBLIC, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC)) return res.writeHead(404).end();
  return serveFile(res, file);
}

function serveFile(res, file, type) {
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': type ?? TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': /\/fonts\//.test(file) ? 'public, max-age=604800' : 'no-cache' }).end(fs.readFileSync(file));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createServer();
  const port = Number(process.env.PORT || 3996);
  server.listen(port, async () => {
    const app = await server.ready;
    console.log(`wOS Decks on http://localhost:${port} (${app.db.kind}, files on ${app.files.mode}, sign-in: ${app.authProvider}). Agents connect to /mcp.`);
  });
  const stop = async () => { server.close(); (await server.ready).close?.(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

export { getTool, EXAMPLES_TEAM };

// In the suite, this file is the app's server part: register(ctx) returns the tool handlers (lib/suite.mjs).
export default register;
