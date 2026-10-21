import { param } from './params.js';
import { toast, validEntityId } from './ha.svelte.js';
// Dashboard config: cards are defined once and placed on layouts. The main
// (tablet) layout is shown everywhere by default: desktop scales it, phone gets
// an automatic single-column reflow. Either can be switched to a custom layout.
// Each layout has a design width (the stage is scaled to fit the screen), an
// optional sidebar, and per-zone placements ('sidebar' or a view id).
import { reflow } from './reflow.js';
import { t, truthy } from './tpl.js';
import { clientId } from './live.js';

export const DEVICES = {
  tablet: { label: 'Tablet', width: 1280, sidebar: 300, display: 'width' },
  phone: { label: 'Phone', width: 420, sidebar: 0, mode: 'auto', display: 'width' },
  desktop: { label: 'Desktop', width: 1600, sidebar: 320, mode: 'same', display: 'actual' },
};
/** How a layout is sized on the screen. */
export const DISPLAYS = { width: 'Fill the screen width (scroll down)', screen: 'Fit the whole view on screen (no scrolling — wall tablets)', actual: 'Actual size, centred (big monitors)' };
export const MODES = { same: 'Same as tablet (scaled to fit)', auto: 'Automatic (tablet layout in one column)', custom: 'Its own layout' };
/** Short versions for the device picker at the bottom of the editor. */
export const MODE_SHORT = { same: 'same as tablet', auto: 'automatic', custom: 'own layout' };
export const GRID = 10;

const GOOGLE_INTER = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap';

export const DEFAULT_THEME = {
  font: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontUrl: '', // Inter is built in (src/inter.css); a Google Fonts link here loads another font
  background: 'radial-gradient(1200px 800px at 10% -10%, #1d2a4a 0%, transparent 60%), radial-gradient(1000px 700px at 110% 110%, #2a1d3d 0%, transparent 55%), #0b0f17',
  text: '#eef2f8',
  muted: 'rgba(238,242,248,.6)',
  accent: '#7aa2ff',
  on: '#ffc861',
  cardBg: 'rgba(255,255,255,.06)',
  cardBorder: '1px solid rgba(255,255,255,.08)',
  cardRadius: 22,
  cardBlur: 18,
  cardShadow: '0 8px 30px rgba(0,0,0,.25)',
  cardPadding: 16,
  cardScale: 100,
  sidebarBg: 'rgba(255,255,255,.03)',
  customCss: '',
};

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function starter() {
  const views = [{ id: 'home', name: 'Home', icon: 'mdi:home' }];
  const cards = {
    clock: { id: 'clock', type: 'clock', props: { seconds: false, date: true }, style: { background: 'transparent', border: 'none', shadow: 'none' } },
    nav: { id: 'nav', type: 'nav', props: { direction: 'vertical' }, style: { background: 'transparent', border: 'none', shadow: 'none' } },
    welcome: { id: 'welcome', type: 'markdown', props: { content: '# Welcome\nTap **Edit** (top-right, or press **E**) to add cards, drag them anywhere and resize from the corner.\n\nAny text can be a template, e.g. `{{ states("sun.sun") }}`' }, style: {} },
  };
  const layouts = {};
  for (const [dev, d] of Object.entries(DEVICES)) {
    const side = d.sidebar > 0;
    layouts[dev] = {
      width: d.width,
      sidebar: { enabled: side, side: 'left', width: d.sidebar || 300 },
      zones: {
        sidebar: side ? [{ card: 'clock', x: 20, y: 30, w: d.sidebar - 40, h: 130 }, { card: 'nav', x: 20, y: 180, w: d.sidebar - 40, h: 200 }] : [],
        home: [
          ...(side ? [] : [{ card: 'clock', x: 20, y: 20, w: d.width - 40, h: 120 }]),
          { card: 'welcome', x: 20, y: side ? 20 : 160, w: Math.min(560, d.width - 40), h: 200 },
        ],
      },
    };
  }
  return { version: 1, theme: { ...DEFAULT_THEME }, views, cards, layouts };
}

export function detectDevice() {
  const q = param('device');
  if (q && DEVICES[q]) return q;
  const saved = localStorage.getItem('hd-device');
  if (saved && DEVICES[saved]) return saved;
  const w = Math.min(innerWidth, screen.width || innerWidth);
  if (w < 700) return 'phone';
  // Touch-only screens are tablets whatever their reported width (high-DPI
  // tablets can report 1400+ CSS px). Anything with a mouse is a desktop.
  const touchOnly = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  if (touchOnly || (matchMedia('(pointer: coarse)').matches && w <= 1400)) return 'tablet';
  return 'desktop';
}

export const app = $state({
  // False for Home Assistant users who aren't admins: they can use the dashboard but not edit it.
  canEdit: true,
  config: null,
  device: detectDevice(),
  view: (location.hash.slice(1) || 'home'),
  editing: false,
  selected: null, // { zone, index } — the primary selected card
  multi: [], // extra indices selected (shift/ctrl-click or drag-select)
  single: false, // edit one card of a group on its own
  popup: null, // { cardId } | { entity }
  dirty: false,
  saving: false,
  panel: null, // 'card' | 'theme' | 'views' | 'add'
  // Which edge the editor panel docks to: 'left' | 'right' | 'bottom', or '' for automatic (right, or bottom on narrow screens).
  panelSide: (() => { try { const s = localStorage.getItem('hd-panel-side'); return ['left', 'right', 'bottom'].includes(s) ? s : ''; } catch { return ''; } })(),
});

/** Dock the editor panel to the left, right or bottom edge (remembered on this device). */
export function setPanelSide(side) {
  app.panelSide = ['left', 'right', 'bottom'].includes(side) ? side : '';
  try { localStorage.setItem('hd-panel-side', app.panelSide); } catch {}
}

/** A card its "Visible when" template currently hides. */
export const cardHidden = (c) => !!c?.visible && !truthy(t(c.visible, { entity_id: c.props?.entity }));

/** The layout a device actually shows (main, a reflow of main, or its own). */
export function layout(dev = app.device) {
  const ls = app.config.layouts;
  const l = ls[dev];
  if (dev === 'tablet' || l.mode === 'custom') return l;
  if (l.mode === 'same') return ls.tablet;
  // Outside editing, hidden cards are left out of the automatic phone layout, so
  // the rest close up (and small cards re-pair) instead of leaving gaps.
  return reflow(ls.tablet, l.width, app.config.views, app.config.cards, app.editing ? null : (p) => cardHidden(app.config.cards[p.card]));
}

/** Which stored layout edits on this device go to. */
export const editTarget = (dev = app.device) => (dev === 'tablet' || app.config.layouts[dev].mode === 'custom' ? dev : app.config.layouts[dev].mode === 'same' ? 'tablet' : null);

/** An automatic layout becomes custom the moment it's edited. */
export function ensureEditable() {
  if (editTarget() !== null) return;
  const l = app.config.layouts[app.device];
  const r = layout();
  app.config.layouts[app.device] = { ...r, width: l.width, mode: 'custom', display: l.display };
  toast(`${DEVICES[app.device].label} layout is now custom — switch back to automatic in Layout`);
}

export function setMode(dev, mode) {
  const l = app.config.layouts[dev];
  if (mode === 'custom' && l.mode !== 'custom') {
    const r = $state.snapshot(layout(dev));
    app.config.layouts[dev] = { ...r, width: l.mode === 'same' ? r.width : l.width, mode: 'custom', display: l.display };
  } else {
    app.config.layouts[dev] = { width: DEVICES[dev].width, mode, display: l.display, sidebar: { enabled: false, side: 'left', width: 300 }, zones: { sidebar: [] } };
  }
  app.selected = null;
  changed();
}

export async function load() {
  let cfg = null;
  try {
    cfg = await fetch('api/config', { cache: 'no-store' }).then((r) => r.json());
  } catch {}
  init(cfg ?? starter());
}

/** Another screen saved: pick up its layout unless we're editing here. */
export async function reloadFromServer() {
  if (app.editing || app.dirty) return;
  try {
    const cfg = await fetch('api/config', { cache: 'no-store' }).then((r) => r.json());
    if (cfg && !app.editing && !app.dirty) init(cfg);
  } catch {}
}

export function importConfig(cfg) {
  init(cfg);
  changed();
}

let firstInit = true;
let homeView = null;
/** This screen's own view: ?view= if given, else the first view. */
export const startView = () => (app.config.views.some((v) => v.id === homeView) ? homeView : app.config.views[0]?.id);
function init(cfg) {
  for (const [dev, d] of Object.entries(DEVICES)) {
    cfg.layouts[dev] ??= { width: d.width, sidebar: { enabled: false, side: 'left', width: 300 }, zones: { sidebar: [] } };
    cfg.layouts[dev].zones.sidebar ??= [];
    if (dev !== 'tablet') cfg.layouts[dev].mode ??= d.mode;
    cfg.layouts[dev].display ??= d.display;
  }
  cfg.theme = { ...DEFAULT_THEME, ...cfg.theme };
  // Inter used to load from Google Fonts by default; it's built in now.
  if (cfg.theme.fontUrl === GOOGLE_INTER) cfg.theme.fontUrl = '';
  for (const c of Object.values(cfg.cards)) normalise(c);
  app.config = cfg;
  lastSaved = JSON.stringify(cfg);
  // ?view= (a view's id or name) picks the starting view, e.g. upstairs tablets.
  if (firstInit) {
    const want = (param('view') || '').toLowerCase();
    const v = want && cfg.views.find((x) => x.id.toLowerCase() === want || x.name.toLowerCase() === want);
    if (v) app.view = v.id;
    homeView = v?.id ?? null;
  }
  firstInit = false;
  if (!cfg.views.some((v) => v.id === app.view)) app.view = cfg.views[0]?.id;
}

function normalise(c) {
  c.props ??= {};
  c.style ??= {};
  c.tap ??= {};
  c.hold ??= {};
  // Cameras imported from ha-fusion were saved as "more-info"; they now open full screen.
  if (c.type === 'camera' && c.tap.action === 'more-info' && !c.tap.entity) delete c.tap.action;
  return c;
}

let saveTimer;
let lastSaved = '';
const undoStack = [];
export const undo = $state({ count: 0 });
export function changed() {
  if (app.config && editTarget() === 'phone') closeGaps(app.config.layouts.phone);
  app.dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 800);
}

export async function save() {
  clearTimeout(saveTimer);
  if (!app.canEdit) return;
  app.saving = true;
  const body = JSON.stringify($state.snapshot(app.config));
  try {
    const r = await fetch('api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Client': clientId }, body });
    if (!r.ok) throw new Error('save failed');
    if (lastSaved && lastSaved !== body) undoStack.push(lastSaved);
    if (undoStack.length > 50) undoStack.shift();
    undo.count = undoStack.length;
    lastSaved = body;
    app.dirty = false;
  } finally {
    app.saving = false;
  }
}

export async function undoLast() {
  if (app.dirty) await save();
  const prev = undoStack.pop();
  undo.count = undoStack.length;
  if (!prev) return;
  app.selected = null;
  app.config = JSON.parse(prev);
  lastSaved = prev;
  await fetch('api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Client': clientId }, body: prev });
}

export function setDevice(d) {
  app.device = d;
  app.selected = null;
  app.multi = [];
  localStorage.setItem('hd-device', d);
}

export function setView(id) {
  app.view = id;
  app.selected = null;
  app.multi = [];
  history.replaceState(null, '', '#' + id);
}

export function zoneList(zone, l = layout()) {
  return (l.zones[zone] ??= []);
}

/** Stored layouts that hold their own placements (main + any custom ones). */
const storedLayouts = () => Object.entries(app.config.layouts).filter(([dev, l]) => dev === 'tablet' || l.mode === 'custom').map(([, l]) => l);

export function selectedPlacement() {
  const s = app.selected;
  if (!s) return null;
  return layout().zones[s.zone]?.[s.index] || null;
}

export function selectedCard() {
  const p = selectedPlacement();
  return p ? app.config.cards[p.card] : null;
}

// New cards go on every stored layout (at the bottom), so they show on all devices.
function placeEverywhere(cardId, zone, size) {
  ensureEditable();
  const here = layout();
  for (const l of new Set([here, ...storedLayouts()])) {
    const z = zone === 'sidebar' && !l.sidebar.enabled ? app.view : zone;
    const list = zoneList(z, l);
    const y = list.reduce((m, p) => Math.max(m, p.y + p.h), 0) + GRID * 2;
    const w = Math.min(size.w, zoneWidth(z, l) - GRID * 4);
    list.push({ card: cardId, x: GRID * 2, y, w, h: size.h });
  }
  const list = zoneList(zone, here);
  app.selected = { zone, index: list.length - 1 };
  app.multi = [];
}

export function addCard(type, meta, zone = app.view) {
  const id = uid();
  // Auto-filled entity IDs that aren't valid (e.g. a device that isn't there) are left blank.
  const auto = Object.fromEntries(Object.entries(meta.autofill?.({ cards: app.config.cards }) || {}).map(([k, v]) => [k, typeof v === 'string' && /^[a-z_]+\./.test(v) && !validEntityId(v) ? '' : v]));
  app.config.cards[id] = normalise({ id, type, props: { ...structuredClone(meta.defaults || {}), ...auto } });
  placeEverywhere(id, zone, { w: meta.size?.w || 200, h: meta.size?.h || 120 });
  app.panel = 'card';
  changed();
  return id;
}

export function placeExisting(cardId, zone = app.view) {
  ensureEditable();
  const list = zoneList(zone);
  const y = list.reduce((m, p) => Math.max(m, p.y + p.h), 0) + GRID * 2;
  list.push({ card: cardId, x: GRID * 2, y, w: 240, h: 140 });
  app.selected = { zone, index: list.length - 1 };
  changed();
}

export function zoneWidth(zone, l = layout()) {
  const sb = l.sidebar.enabled ? l.sidebar.width : 0;
  return zone === 'sidebar' ? sb : l.width - sb;
}

/** Indices (in the selected zone) of everything that moves together. */
export function selectionSet() {
  const s = app.selected;
  if (!s) return [];
  if (app.multi.length > 1) return [...app.multi];
  const list = layout().zones[s.zone] || [];
  const g = list[s.index]?.group;
  if (!g || app.single) return [s.index];
  return list.map((p, i) => (p.group === g ? i : -1)).filter((i) => i >= 0);
}

/** Unplace removes from this layout only; delete removes the card everywhere. */
export function removeSelected(deleteCard = false) {
  const s = app.selected;
  if (!s) return;
  ensureEditable();
  const list = zoneList(s.zone);
  const idx = selectionSet().sort((a, b) => b - a);
  const ids = idx.map((i) => list[i].card);
  for (const i of idx) list.splice(i, 1);
  app.selected = null;
  app.multi = [];
  if (deleteCard) {
    for (const l of Object.values(app.config.layouts)) for (const [z, zl] of Object.entries(l.zones)) l.zones[z] = zl.filter((p) => !ids.includes(p.card));
    for (const id of ids) delete app.config.cards[id];
  }
  changed();
}

export function groupSelected() {
  ensureEditable();
  const list = zoneList(app.selected.zone);
  const g = uid();
  for (const i of selectionSet()) list[i].group = g;
  app.multi = [];
  app.single = false;
  changed();
}

export function ungroupSelected() {
  ensureEditable();
  const list = zoneList(app.selected.zone);
  for (const i of selectionSet()) delete list[i].group;
  app.multi = [];
  changed();
}

export function duplicateSelected() {
  ensureEditable();
  const p = selectedPlacement();
  const card = selectedCard();
  if (!p || !card) return;
  const id = uid();
  app.config.cards[id] = { ...$state.snapshot(card), id };
  const list = zoneList(app.selected.zone);
  list.push({ ...$state.snapshot(p), card: id, x: p.x + GRID * 2, y: p.y + GRID * 2 });
  app.selected = { zone: app.selected.zone, index: list.length - 1 };
  changed();
}

/** Copy the selected card(s) to another view, on every layout they're on:
 *  at the same spot if it's free there, otherwise below what's already there. */
export function copyToView(view) {
  ensureEditable();
  const zone = app.selected?.zone;
  if (!zone) return;
  const src = zoneList(zone);
  const ids = new Map(selectionSet().map((i) => [src[i].card, uid()]));
  for (const [old, id] of ids) app.config.cards[id] = { ...$state.snapshot(app.config.cards[old]), id };
  const group = ids.size > 1 ? uid() : null;
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const l of new Set([layout(), ...storedLayouts()])) {
    const ps = Object.values(l.zones).flat().filter((p) => ids.has(p.card));
    if (!ps.length) continue;
    const dst = zoneList(view, l);
    const copies = ps.map((p) => {
      const q = { ...$state.snapshot(p), card: ids.get(p.card) };
      if (group) q.group = group; else delete q.group;
      return q;
    });
    const w = zoneWidth(view, l);
    if (copies.some((q) => q.x + q.w > w || dst.some((r) => hit(q, r)))) {
      const x0 = Math.min(...copies.map((q) => q.x)), y0 = Math.min(...copies.map((q) => q.y));
      const bottom = dst.reduce((m, r) => Math.max(m, r.y + r.h), 0);
      for (const q of copies) { q.x = q.x - x0 + GRID * 2; q.y = q.y - y0 + bottom + GRID * 2; }
    }
    dst.push(...copies);
  }
  changed();
  const name = app.config.views.find((v) => v.id === view)?.name || view;
  toast(`Copied ${ids.size > 1 ? ids.size + ' cards' : 'the card'} to ${name}`);
}

export function isPlacedAnywhere(cardId) {
  for (const l of Object.values(app.config.layouts)) for (const z of Object.values(l.zones)) if (z.some((p) => p.card === cardId)) return true;
  return false;
}

export function copyLayout(from) {
  ensureEditable();
  const src = $state.snapshot(layout(from));
  const dst = layout();
  const scale = dst.width / src.width;
  dst.sidebar = { ...src.sidebar };
  dst.zones = {};
  for (const [z, list] of Object.entries(src.zones)) {
    const s = z === 'sidebar' ? 1 : scale;
    dst.zones[z] = list.map((p) => ({ ...p, x: Math.round((p.x * s) / GRID) * GRID, w: Math.round((p.w * s) / GRID) * GRID }));
  }
  app.selected = null;
  changed();
}

export function addView(name) {
  const id = uid();
  app.config.views.push({ id, name, icon: 'mdi:view-dashboard' });
  setView(id);
  changed();
}

export function removeView(id) {
  if (app.config.views.length < 2) return;
  app.config.views = app.config.views.filter((v) => v.id !== id);
  for (const l of Object.values(app.config.layouts)) delete l.zones[id];
  if (app.view === id) setView(app.config.views[0].id);
  changed();
}

// Changing the design width or the sidebar changes how wide the main area and
// the sidebar are. Cards that would spill off the edge (or that filled the old
// width) are scaled across to fit, so equal gaps stay equal. Scaling is always
// from where things were when the edit began (until it pauses for 2 s), so
// typing "350" (via 3 and 35) doesn't drift.
let fitBase = null, fitTimer;
const zw = (z, l) => zoneWidth(z === 'sidebar' ? 'sidebar' : 'main', l);
function refit(list, from, to) {
  const right = list.reduce((m, p) => Math.max(m, p.x + p.w), 0);
  const k = right > from ? (right > to ? to / (right + Math.max(0, Math.min(...list.map((p) => p.x)))) : 1)
    : right > to || right >= from - GRID * 3 ? to / from : 1;
  return list.map((p) => {
    const x = Math.round(p.x * k);
    return { ...p, x, w: Math.max(GRID * 4, Math.round((p.x + p.w) * k) - x) };
  });
}
export function setMainWidth(apply) {
  const l = layout();
  // Start afresh after a pause, but not while the box is empty or half typed.
  clearTimeout(fitTimer);
  const settle = () => (fitTimer = setTimeout(() => (zw('main', l) > 100 && (!l.sidebar.enabled || zw('sidebar', l) > 100) ? (fitBase = null) : settle()), 2000));
  settle();
  if (fitBase?.l !== l) fitBase = { l, main: zw('main', l), sidebar: zw('sidebar', l), zones: $state.snapshot(l.zones) };
  apply(l);
  for (const [z, list] of Object.entries(fitBase.zones)) {
    const from = fitBase[z === 'sidebar' ? 'sidebar' : 'main'], to = zw(z, l);
    if (l.zones[z] && from > 100 && to > 100) l.zones[z] = refit(list, from, to);
  }
  changed();
}

const overlaps = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 4;
/** The gap most cards in a list sit apart by. */
export function usualGap(list) {
  const n = new Map();
  for (const a of list) for (const b of list) {
    if (a === b) continue;
    const gx = b.x - (a.x + a.w), gy = b.y - (a.y + a.h);
    if (gx >= 4 && gx <= 48 && overlaps(a.y, a.y + a.h, b.y, b.y + b.h)) n.set(Math.round(gx), (n.get(Math.round(gx)) || 0) + 1);
    if (gy >= 4 && gy <= 48 && overlaps(a.x, a.x + a.w, b.x, b.x + b.w)) n.set(Math.round(gy), (n.get(Math.round(gy)) || 0) + 1);
  }
  let best = 20, c = 0;
  for (const [g, k] of n) if (k > c || (k === c && g < best)) { best = g; c = k; }
  return best;
}

/** Phone: an empty band across the whole screen (e.g. where a card was deleted)
 *  shrinks to the usual gap, so everything below moves up. Side-by-side cards keep their rows. */
export function closeGaps(l) {
  for (const list of Object.values(l.zones)) {
    if (list.length < 2) continue;
    const G = usualGap(list);
    const order = [...list].sort((a, b) => a.y - b.y);
    let bottom = order[0].y + order[0].h, shift = 0;
    const ys = new Map();
    for (const p of order) {
      if (p.y > bottom + G) shift += p.y - (bottom + G);
      bottom = Math.max(bottom, p.y + p.h);
      ys.set(p, p.y - shift);
    }
    for (const [p, y] of ys) if (p.y !== y) p.y = y;
  }
}

/** Scale any view (or the sidebar) whose cards run past its right edge back inside it. */
export function fitOverflow(l) {
  let any = false;
  for (const [z, list] of Object.entries(l.zones)) {
    const w = zw(z, l);
    if (w < 100) continue;
    const right = list.reduce((m, p) => Math.max(m, p.x + p.w), 0);
    if (right <= w) continue;
    const k = w / (right + Math.max(0, Math.min(...list.map((p) => p.x)))); // right margin = left margin
    for (const p of list) {
      const x = Math.round(p.x * k);
      p.w = Math.max(GRID * 4, Math.round((p.x + p.w) * k) - x);
      p.x = x;
    }
    any = true;
  }
  if (any) changed();
}
