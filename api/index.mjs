// Vercel: the whole app is one function, the same server as npm start, WebSockets included (Vercel
// Functions hold WebSocket connections on Fluid Compute). Copies of the function hear each other's
// changes through Postgres LISTEN/NOTIFY; if a socket drops, the editor polls until it is back.
// If the server cannot even load, say why in the log and answer 503 instead of a bare crash.
let server, why = '';
const loading = import('../server.mjs').then((m) => { server = m.createServer(); }).catch((e) => { console.error('decks: could not load the server:', e); why = String(e?.message ?? e).split('\n')[0].slice(0, 200); });

export default async function handler(req, res) {
  await loading;
  if (!server) { res.statusCode = 503; res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ error: { code: 'unavailable', message: `Decks could not start: ${why}` } })); }
  server.emit('request', req, res);
}
