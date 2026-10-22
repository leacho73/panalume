// Home Assistant websocket client. Talks to our own server's /api/websocket,
// which authenticates on our behalf. Entity state lives in a SvelteMap so each
// card only re-renders when the entities it reads change.
import { SvelteMap } from 'svelte/reactivity';

export const states = new SvelteMap();
export const templates = new SvelteMap();
export const conn = $state({ connected: false, haVersion: '' });

let ws;
let nextId = 1;
const pending = new Map();
const subs = new Map(); // local key -> { msg, cb, id }
let subKey = 0;
let backoff = 500;

function wsUrl() {
  const base = location.pathname.replace(/[^/]*$/, '');
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${base}api/websocket`;
}

function connect() {
  ws = new WebSocket(wsUrl());
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (Array.isArray(msg)) return msg.forEach(handle);
    handle(msg);
  };
  ws.onclose = () => {
    conn.connected = false;
    for (const p of pending.values()) p.reject(new Error('disconnected'));
    pending.clear();
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 10000);
  };
}

function handle(msg) {
  if (msg.type === 'auth_ok') {
    conn.connected = true;
    conn.haVersion = msg.ha_version;
    backoff = 500;
    for (const s of subs.values()) startSub(s);
    return;
  }
  if (msg.type === 'event') {
    for (const s of subs.values()) if (s.id === msg.id) s.cb(msg.event);
    return;
  }
  if (msg.type === 'result') {
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    msg.success ? p.resolve(msg.result) : p.reject(msg.error);
  }
}

export function send(msg) {
  return new Promise((resolve, reject) => {
    if (!conn.connected) return reject(new Error('not connected'));
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ ...msg, id }));
  });
}

function startSub(s) {
  if (!conn.connected) return;
  s.id = nextId++;
  pending.set(s.id, { resolve() {}, reject: (e) => console.warn('subscription failed', s.msg, e) });
  ws.send(JSON.stringify({ ...s.msg, id: s.id }));
}

/** Subscribe to a websocket subscription; returns an unsubscribe function. */
export function subscribe(msg, cb) {
  const key = subKey++;
  const s = { msg, cb, id: 0 };
  subs.set(key, s);
  startSub(s);
  return () => {
    subs.delete(key);
    if (conn.connected && s.id) send({ type: 'unsubscribe_events', subscription: s.id }).catch(() => {});
  };
}

// ---- entities (compressed subscribe_entities protocol) ----
function apply(ev) {
  if (ev.a) for (const [id, e] of Object.entries(ev.a)) {
    states.set(id, { entity_id: id, state: e.s, attributes: e.a || {}, last_changed: e.lc, last_updated: e.lu ?? e.lc });
  }
  if (ev.c) for (const [id, d] of Object.entries(ev.c)) {
    const old = states.get(id);
    if (!old) continue;
    const next = { ...old, attributes: { ...old.attributes } };
    const add = d['+'];
    if (add) {
      if ('s' in add) next.state = add.s;
      if (add.a) Object.assign(next.attributes, add.a);
      if (add.lc) next.last_changed = next.last_updated = add.lc;
      else if (add.lu) next.last_updated = add.lu;
    }
    if (d['-']?.a) for (const k of d['-'].a) delete next.attributes[k];
    states.set(id, next);
  }
  if (ev.r) for (const id of ev.r) states.delete(id);
}

/** Home Assistant's own rule for a valid entity ID (e.g. `sensor._status` isn't one). */
export const validEntityId = (id) => /^(?!.*__)[\da-z](?:[\da-z_]*[\da-z])?\.[\da-z](?:[\da-z_]*[\da-z])?$/.test(id);

let entitySub = null;
let watchedKey = '';
/** Subscribe to exactly these entities (null = all). */
export function watchEntities(ids) {
  // HA rejects the whole subscription if any ID is invalid, which would leave
  // every card without live updates, so leave bad ones out.
  if (ids) ids = [...ids].filter(validEntityId);
  const key = ids ? [...ids].sort().join(',') : '*';
  if (key === watchedKey) return;
  watchedKey = key;
  entitySub?.();
  entitySub = subscribe(ids ? { type: 'subscribe_entities', entity_ids: [...ids] } : { type: 'subscribe_entities' }, apply);
}

// ---- templates ----
const tplSubs = new Set();
/** Live-rendered HA template result (reactive). Subscribes on first use. */
export function renderTemplate(tpl, variables) {
  const key = variables ? tpl + '\u0000' + JSON.stringify(variables) : tpl;
  if (!tplSubs.has(key)) {
    tplSubs.add(key);
    const msg = { type: 'render_template', template: tpl, report_errors: true };
    if (variables) msg.variables = variables;
    queueMicrotask(() =>
      subscribe(msg, (ev) => {
        templates.set(key, ev.error ? `⚠ ${ev.error}` : ev.result);
      }),
    );
  }
  return templates.get(key);
}

export function callService(domain, service, data = {}, target) {
  const msg = { type: 'call_service', domain, service, service_data: data };
  if (target) msg.target = target;
  return send(msg).catch((e) => {
    console.error(e);
    toast(e?.message || 'Service call failed');
  });
}

export const toasts = $state([]);
export function toast(text) {
  const id = Math.random();
  toasts.push({ text, id });
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id);
    if (i >= 0) toasts.splice(i, 1);
  }, 4000);
}

export async function history(entityIds, hours) {
  const start = new Date(Date.now() - hours * 3600e3).toISOString();
  return send({
    type: 'history/history_during_period',
    start_time: start,
    entity_ids: entityIds,
    minimal_response: true,
    no_attributes: true,
    significant_changes_only: false,
  });
}

/** HA image URL (camera, artwork) routed through our authenticated proxy. */
export function haImage(url) {
  if (!url) return '';
  return url.startsWith('/') ? `ha${url}` : url;
}

connect();
