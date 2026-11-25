// Banners Home Assistant can send to the dashboards (#123). An automation fires a
// `panalume_notify` event:
//
//   action: event.fire
//   data:
//     event_type: panalume_notify
//     event_data:
//       message: Front door open      # required
//       title: Front door             # optional
//       icon: mdi:door-open           # optional
//       severity: warning             # info | warning | critical, or color: '#hex'
//       seconds: 20                   # how long it stays; 0 = until tapped (default 10)
//       screen: hallway               # optional: only the screen with this name (Layout tab)
//       user: Guest                   # optional: only screens signed in as this user (name or id)
//       tag: door                     # optional: a later message with the same tag replaces it,
//       dismiss: true                 #   and dismiss: true (with or without a tag) takes it away
//
// Every screen shows it over whatever view is open; messages that arrive together queue.
import { subscribe, me } from './ha.svelte.js';

export const banner = $state({ current: null, queue: [] });
// Bumped when a banner arrives, so the screensaver gets out of the way.
export const attention = $state({ at: 0 });

// This screen's own name for messages, kept in this browser only.
export function screenName() {
  try { return localStorage.getItem('hd-screen-name') || ''; } catch { return ''; }
}
export function setScreenName(v) {
  try { v ? localStorage.setItem('hd-screen-name', v) : localStorage.removeItem('hd-screen-name'); } catch {}
}

const low = (v) => String(v ?? '').trim().toLowerCase();
const recent = new Map(); // message text → when it was last shown, to drop repeats
let timer;

function next() {
  clearTimeout(timer);
  banner.current = banner.queue.shift() || null;
  const s = banner.current?.seconds;
  if (banner.current && s > 0) timer = setTimeout(next, s * 1000);
}
export const dismissBanner = next;

function receive(d = {}) {
  if (d.screen && low(d.screen) !== low(screenName())) return;
  if (d.user && ![low(me.name), low(me.id)].includes(low(d.user))) return;
  if (d.dismiss) {
    const keep = (b) => d.tag != null && b.tag !== String(d.tag);
    banner.queue = banner.queue.filter(keep);
    if (banner.current && !keep(banner.current)) next();
    return;
  }
  const message = String(d.message ?? '').trim();
  if (!message) return;
  // The same words again within 10 seconds (a bouncing sensor) are dropped.
  const now = Date.now();
  if (now - (recent.get(message) || 0) < 10e3 && d.tag == null) return;
  recent.set(message, now);
  const seconds = d.seconds ?? d.duration;
  const b = {
    message, title: d.title ? String(d.title) : '', icon: d.icon ? String(d.icon) : '',
    severity: ['warning', 'critical'].includes(low(d.severity)) ? low(d.severity) : 'info',
    color: d.color ? String(d.color) : '', tag: d.tag != null ? String(d.tag) : null,
    seconds: Number.isFinite(Number(seconds)) ? Math.max(0, Number(seconds)) : 10, id: now + Math.random(),
  };
  attention.at = now;
  // A message with a tag replaces the one with the same tag, wherever it is.
  if (b.tag != null && banner.current?.tag === b.tag) { banner.current = b; clearTimeout(timer); if (b.seconds > 0) timer = setTimeout(next, b.seconds * 1000); return; }
  if (b.tag != null) banner.queue = banner.queue.filter((x) => x.tag !== b.tag);
  banner.queue.push(b);
  if (!banner.current) next();
}

subscribe({ type: 'subscribe_events', event_type: 'panalume_notify' }, (ev) => receive(ev?.data));
