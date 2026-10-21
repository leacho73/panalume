// Tiny server: static files, config storage, icon lookup and an authenticated
// proxy to Home Assistant (websocket + HTTP for camera/artwork images).
// In the add-on, HA is reached via the Supervisor; in dev via HA_URL + HA_TOKEN.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import * as mdi from '@mdi/js';
import { fusionDashboard } from './fusion.js';

const PORT = Number(process.env.PORT || 8099);
const SUP = process.env.SUPERVISOR_TOKEN;
const HA_URL = (process.env.HA_URL || (SUP ? 'http://supervisor/core' : 'http://localhost:8123')).replace(/\/$/, '');
const TOKEN = SUP || process.env.HA_TOKEN || (process.env.HA_TOKEN_FILE && fs.readFileSync(process.env.HA_TOKEN_FILE, 'utf8').trim());
const DATA = process.env.DATA_DIR || (SUP ? '/data' : path.resolve('data'));
const DIST = path.resolve(process.env.DIST_DIR || 'dist');
const CONFIG = path.join(DATA, 'dashboard.json');
fs.mkdirSync(DATA, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function serveStatic(req, res, urlPath) {
  let file = path.join(DIST, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  const ext = path.extname(file);
  const immutable = urlPath.startsWith('/assets/');
  const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' };
  const gz = fs.existsSync(file + '.gz') && /gzip/.test(req.headers['accept-encoding'] || '');
  if (gz) headers['Content-Encoding'] = 'gzip';
  res.writeHead(200, headers);
  fs.createReadStream(gz ? file + '.gz' : file).pipe(res);
}

function iconPath(name) {
  const key = 'mdi' + name.replace(/^mdi:/, '').split('-').map((s) => s[0]?.toUpperCase() + s.slice(1)).join('');
  return mdi[key] || null;
}

// Who may edit: Home Assistant admins. Ingress tells us who's looking
// (X-Remote-User-Id); the direct port has no HA login, so it's left open.
let users = { at: 0, admins: null };
async function haUsers() {
  if (Date.now() - users.at < 60e3 && users.admins) return users.admins;
  const list = await new Promise((ok, fail) => {
    const ws = new WebSocket(HA_URL.replace(/^http/, 'ws') + '/api/websocket');
    const t = setTimeout(() => { ws.terminate(); fail(new Error('timeout')); }, 8000);
    ws.on('error', (e) => { clearTimeout(t); fail(e); });
    ws.on('message', (d) => {
      const m = JSON.parse(d);
      if (m.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: TOKEN }));
      else if (m.type === 'auth_ok') ws.send(JSON.stringify({ id: 1, type: 'config/auth/list' }));
      else if (m.type === 'auth_invalid') { clearTimeout(t); ws.close(); fail(new Error('auth')); }
      else if (m.type === 'result') { clearTimeout(t); ws.close(); m.success ? ok(m.result) : fail(new Error(m.error?.message || 'users')); }
    });
  });
  users = { at: Date.now(), admins: new Set(list.filter((u) => u.is_owner || u.group_ids?.includes('system-admin')).map((u) => u.id)) };
  return users.admins;
}
async function isAdmin(req) {
  const id = req.headers['x-remote-user-id'];
  if (!id) return true;
  try { return (await haUsers()).has(id); } catch (e) { console.error('user check:', e.message); return true; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/api/config') {
      if (req.method === 'GET') return send(res, 200, fs.existsSync(CONFIG) ? fs.readFileSync(CONFIG) : 'null');
      if (req.method === 'PUT') {
        if (!(await isAdmin(req))) return send(res, 403, '{"error":"Only Home Assistant admins can change the dashboard"}');
        let body = '';
        for await (const c of req) body += c;
        JSON.parse(body);
        fs.writeFileSync(CONFIG + '.tmp', body);
        fs.renameSync(CONFIG + '.tmp', CONFIG);
        broadcast({ type: 'config', from: req.headers['x-client'] || '' });
        return send(res, 200, '{"ok":true}');
      }
    }
    if (p === '/api/me') return send(res, 200, JSON.stringify({ admin: await isAdmin(req), name: req.headers['x-remote-user-display-name'] || null }));
    if (p === '/api/icons') {
      const out = {};
      for (const n of (url.searchParams.get('n') || '').split(',').slice(0, 200)) if (n) out[n] = iconPath(n);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' });
      return res.end(JSON.stringify(out));
    }
    if (p === '/api/icon-names') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' });
      return res.end(JSON.stringify(Object.keys(mdi).map((k) => 'mdi:' + k.slice(3).replace(/([a-z0-9])([A-Z0-9])/g, '$1-$2').toLowerCase())));
    }
    if (p === '/api/fusion') {
      return send(res, 200, JSON.stringify(await fusionDashboard({ sup: SUP, haUrl: HA_URL, token: TOKEN })));
    }
    if (p.startsWith('/ha/')) {
      // Proxy HA image endpoints (camera_proxy, media_player_proxy, local files).
      // Signed media links (/media/…?authSig=, e.g. photos from local media) carry
      // their own permission and aren't under /api, which the Supervisor's proxy
      // only passes on, so in the app they go straight to Home Assistant.
      const signed = !p.startsWith('/ha/api/') && url.searchParams.has('authSig');
      const direct = signed && SUP ? await coreDirect() : null;
      const target = (direct || HA_URL) + p.slice(3) + url.search;
      const r = await fetch(target, { headers: direct ? {} : { Authorization: `Bearer ${TOKEN}` } });
      res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      if (!r.body) return res.end();
      const reader = r.body.getReader();
      req.on('close', () => reader.cancel().catch(() => {}));
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(value)) await new Promise((ok) => res.once('drain', ok));
      }
      return res.end();
    }
    serveStatic(req, res, p);
  } catch (e) {
    console.error(p, e.message);
    if (!res.headersSent) send(res, 500, JSON.stringify({ error: e.message }));
    else res.end();
  }
});

// Websocket proxy: authenticate to HA server-side, then tell the browser auth_ok
// and pipe frames both ways. The browser never sees the token.
const wss = new WebSocketServer({ noServer: true, perMessageDeflate: true });
// Live channel: tells every open screen when the layout is saved (so it reloads
// it) and which build is running (so screens reload after an add-on update).
const BUILD = fs.existsSync(path.join(DIST, 'index.html')) ? crypto.createHash('sha1').update(fs.readFileSync(path.join(DIST, 'index.html'))).digest('hex').slice(0, 12) : 'dev';
const live = new WebSocketServer({ noServer: true });
function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const c of live.clients) if (c.readyState === WebSocket.OPEN) c.send(data);
}
setInterval(() => broadcast({ type: 'ping' }), 30000);

// Live camera: MJPEG frames from HA sent over a websocket. Browsers only allow
// ~6 HTTP connections per host, so a few <img> MJPEG streams would starve
// everything else (streams freeze, switching camera never loads).
const cams = new WebSocketServer({ noServer: true });
const SOI = Buffer.from([0xff, 0xd8]), EOI = Buffer.from([0xff, 0xd9]);
// The Supervisor's proxy buffers whole responses, so a never-ending MJPEG stream
// never arrives through it. In the add-on, open streams on Core directly using
// the camera's own access token; if that fails, poll snapshots instead.
let coreBase;
async function coreDirect() {
  if (!SUP) return HA_URL;
  if (coreBase !== undefined) return coreBase;
  try {
    const info = (await (await fetch('http://supervisor/core/info', { headers: { Authorization: `Bearer ${SUP}` } })).json()).data;
    return (coreBase = info.ssl ? null : `http://homeassistant:${info.port || 8123}`);
  } catch {
    return null;
  }
}
const auth = { Authorization: `Bearer ${TOKEN}` };

async function camStream(ws, entity) {
  const ac = new AbortController();
  ws.on('close', () => ac.abort());
  ws.on('error', () => ac.abort());
  const send = (frame) => ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 1e6 && ws.send(Buffer.from(frame), { binary: true });
  let got = false;
  try {
    const base = await coreDirect();
    if (base) {
      let url = `${base}/api/camera_proxy_stream/${entity}`;
      if (SUP) {
        const st = await (await fetch(`${HA_URL}/api/states/${entity}`, { headers: auth, signal: ac.signal })).json();
        url += `?token=${st.attributes.access_token}`;
      }
      // Give up on a stream that never sends a frame, or stalls.
      const stream = new AbortController();
      ac.signal.addEventListener('abort', () => stream.abort());
      let last = Date.now();
      const dog = setInterval(() => Date.now() - last > (got ? 20000 : 8000) && stream.abort(), 2000);
      try {
        const r = await fetch(url, { headers: SUP ? {} : auth, signal: stream.signal });
        if (!r.ok || !r.body) throw new Error('HTTP ' + r.status);
        let buf = Buffer.alloc(0);
        for await (const chunk of r.body) {
          buf = buf.length ? Buffer.concat([buf, chunk]) : Buffer.from(chunk);
          // Pull out complete JPEGs (by the part's Content-Length, else SOI..EOI);
          // send only the newest, and skip frames while the browser is behind.
          let frame = null;
          for (;;) {
            const s = buf.indexOf(SOI);
            if (s < 0) { buf = buf.subarray(Math.max(0, buf.length - 1)); break; }
            const len = Number([...buf.subarray(Math.max(0, s - 400), s).toString('latin1').matchAll(/content-length:\s*(\d+)/gi)].pop()?.[1]);
            let end;
            if (len > 0) end = buf.length >= s + len ? s + len : -1;
            else { const e = buf.indexOf(EOI, s + 2); end = e < 0 ? -1 : e + 2; }
            if (end < 0) break;
            frame = buf.subarray(s, end);
            buf = buf.subarray(end);
          }
          if (buf.length > 8e6) buf = Buffer.alloc(0);
          if (frame) { got = true; last = Date.now(); send(frame); }
        }
      } finally {
        clearInterval(dog);
      }
    }
  } catch (e) {
    if (!ac.signal.aborted) console.error('camera stream', entity, e.message);
  }
  // No stream: send snapshots as fast as the camera gives them (max ~2/s).
  while (!got && !ac.signal.aborted && ws.readyState === WebSocket.OPEN) {
    const t0 = Date.now();
    try {
      const r = await fetch(`${HA_URL}/api/camera_proxy/${entity}`, { headers: auth, signal: ac.signal });
      if (r.ok) send(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      if (ac.signal.aborted) break;
    }
    await new Promise((ok) => setTimeout(ok, Math.max(200, 500 - (Date.now() - t0))));
  }
  ws.close();
}

server.on('upgrade', (req, socket, head) => {
  if (req.url.split('?')[0].endsWith('/api/camera')) {
    const entity = new URL(req.url, 'http://x').searchParams.get('entity') || '';
    if (!/^camera\.[a-z0-9_]+$/.test(entity)) return socket.destroy();
    return cams.handleUpgrade(req, socket, head, (ws) => camStream(ws, entity));
  }
  if (req.url.split('?')[0].endsWith('/api/live')) {
    return live.handleUpgrade(req, socket, head, (ws) => ws.send(JSON.stringify({ type: 'hello', build: BUILD })));
  }
  if (!req.url.split('?')[0].endsWith('/api/websocket')) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (client) => {
    const ha = new WebSocket(HA_URL.replace(/^http/, 'ws') + '/api/websocket', { perMessageDeflate: true });
    const queue = [];
    let ready = false;
    ha.on('message', (data, isBinary) => {
      if (!ready) {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'auth_required') return ha.send(JSON.stringify({ type: 'auth', access_token: TOKEN }));
        if (msg.type === 'auth_ok') {
          ready = true;
          client.send(JSON.stringify(msg));
          queue.splice(0).forEach((m) => ha.send(m));
          return;
        }
        client.send(JSON.stringify(msg));
        return client.close();
      }
      client.send(data, { binary: isBinary });
    });
    client.on('message', (data) => (ready ? ha.send(data.toString()) : queue.push(data.toString())));
    const close = () => { client.close(); ha.close(); };
    ha.on('close', close); ha.on('error', close);
    client.on('close', close); client.on('error', close);
  });
});

// Pre-compress static assets once at startup.
if (fs.existsSync(DIST)) {
  for (const f of fs.readdirSync(DIST, { recursive: true })) {
    const full = path.join(DIST, f);
    if (/\.(js|css|html|svg|json)$/.test(f) && fs.statSync(full).isFile()) fs.writeFileSync(full + '.gz', zlib.gzipSync(fs.readFileSync(full), { level: 9 }));
  }
}

// Home Assistant keeps the sidebar entry it registered when the app was first
// shown there, including whether it's admin-only. Re-add it once per version
// (as turning "Show in sidebar" off and on would), so a change to who can open
// it (e.g. all users since 0.28.0) takes effect without anyone doing anything.
async function refreshPanel() {
  if (!SUP) return;
  const sup = (p, init) => fetch(`http://supervisor${p}`, { ...init, headers: { Authorization: `Bearer ${SUP}`, 'Content-Type': 'application/json' } }).then((r) => r.json());
  try {
    const info = (await sup('/addons/self/info')).data;
    const mark = path.join(DATA, 'panel-version');
    if (!info?.ingress_panel || (fs.existsSync(mark) && fs.readFileSync(mark, 'utf8') === info.version)) return;
    const r = await sup('/addons/self/options', { method: 'POST', body: JSON.stringify({ ingress_panel: true }) });
    if (r.result !== 'ok') throw new Error(r.message || 'refused');
    fs.writeFileSync(mark, info.version);
    console.log('Sidebar entry refreshed');
  } catch (e) {
    console.error('Could not refresh the sidebar entry:', e.message);
  }
}

server.listen(PORT, () => console.log(`Panalume on :${PORT} -> ${HA_URL}`));
refreshPanel();
