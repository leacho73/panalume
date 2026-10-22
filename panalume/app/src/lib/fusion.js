// Convert an ha-fusion dashboard into our config: views → views, rooms → title +
// button grid, cameras → camera cards, sidebar → sidebar cards. Button templates
// (state / name / icon / color / service) carry over as live HA templates.
// An Energy view is added using auto-detected energy cards.
import { cards as registry } from './registry.js';
import { DEFAULT_THEME, DEVICES } from './config.svelte.js';
import { states } from './ha.svelte.js';
import { myenergiPower } from './octopus.js';

const GAP = 12;
let n = 0;
const uid = () => 'f' + (n++).toString(36) + Math.random().toString(36).slice(2, 6);
const CLEAR = { background: 'transparent', border: 'none', shadow: 'none', blur: '0' };
const MORE_INFO = new Set(['climate', 'camera', 'lock', 'sensor', 'binary_sensor', 'person', 'select', 'water_heater', 'weather', 'device_tracker']);

function parseTpl(s) {
  if (!s) return {};
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch { return {}; }
}

function serviceAction(src) {
  const m = String(src).match(/service:\s*([\w]+\.[\w]+)/);
  if (!m) return null;
  const data = String(src).split(/data:\s*/)[1]?.trim();
  return { action: 'service', service: m[1], data: data && data.startsWith('{') ? data : '' };
}

export function fromFusion(db, { energy = true } = {}) {
  const cfg = { version: 1, theme: { ...DEFAULT_THEME }, views: [], cards: {}, layouts: {} };
  const add = (type, props, extra = {}) => {
    const id = uid();
    cfg.cards[id] = { id, type, props, style: {}, tap: {}, hold: {}, ...extra };
    return id;
  };

  function button(it) {
    const tpl = parseTpl(it.template);
    const entity = it.entity_id || '';
    const props = { entity, layout: 'horizontal', show_state: true };
    if (tpl.name || it.name) props.name = tpl.name || it.name;
    if (tpl.icon || it.icon) props.icon = (tpl.icon || it.icon).trim();
    if (tpl.state) props.state = tpl.state;
    if (tpl.color) props.icon_color = tpl.color;
    const tap = tpl.service ? serviceAction(tpl.service) : MORE_INFO.has(entity.split('.')[0]) ? { action: 'more-info' } : {};
    return add('button', props, { tap: tap || {} });
  }

  // Lay a list of fusion items into a column; returns placements and height.
  function column(items, x, y, w) {
    const out = [];
    let cy = y;
    let row = [];
    const cols = Math.max(1, Math.floor((w + GAP) / (190 + GAP)));
    const bw = Math.floor((w - GAP * (cols - 1)) / cols);
    const flush = () => {
      row.forEach((id, i) => out.push({ card: id, x: x + i * (bw + GAP), y: cy, w: bw, h: 72 }));
      if (row.length) cy += 72 + GAP;
      row = [];
    };
    for (const it of items || []) {
      if (it.type === 'camera') {
        flush();
        const id = add('camera', { entity: it.entity_id, mode: it.stream ? 'live' : 'snapshot', refresh: 5, fit: 'cover', show_name: true }, { style: { padding: '0' }, tap: {} });
        const h = Math.round((w * 9) / 16);
        out.push({ card: id, x, y: cy, w, h });
        cy += h + GAP;
      } else if (it.type === 'button') {
        row.push(button(it));
        if (row.length === cols) flush();
      } else if (it.sections || it.items) {
        flush();
        const r = column(it.sections || it.items, x, cy, w);
        out.push(...r.out);
        cy = r.y;
      }
    }
    flush();
    return { out, y: cy };
  }

  function view(v, width) {
    const out = [];
    let y = 20;
    for (const sec of v.sections || []) {
      const all = sec.type === 'horizontal-stack' ? sec.sections || [] : [sec];
      // Narrow screens stack a row's rooms vertically.
      const rows = width < 700 ? all.map((g) => [g]) : [all];
      for (const groups of rows) {
        const gw = Math.floor((width - 40 - GAP * 2 * (groups.length - 1)) / groups.length);
        let maxY = y;
        groups.forEach((g, i) => {
          const x = 20 + i * (gw + GAP * 2);
          let gy = y;
          // Each room (heading + its cards) is a group, so it drags as one.
          const group = uid();
          if (g.name) {
            out.push({ card: add('markdown', { content: `### ${g.name}` }, { style: { ...CLEAR, padding: '0 4' } }), x, y: gy, w: gw, h: 30, group });
            gy += 34;
          }
          const r = column(g.sections || g.items || (g.type ? [g] : []), x, gy, gw);
          out.push(...r.out.map((p) => ({ ...p, group })));
          maxY = Math.max(maxY, r.y);
        });
        y = maxY + GAP;
      }
    }
    return out;
  }

  function sidebar(items, w) {
    const out = [];
    let y = 20;
    const x = 16, cw = w - 32;
    let lines = [];
    const flushLines = () => {
      if (!lines.length) return;
      const h = 32 + lines.length * 22;
      out.push({ card: add('textlist', { items: lines.join('\n---\n') }, { style: { padding: '14', fontSize: '15' } }), x, y, w: cw, h });
      y += h + GAP;
      lines = [];
    };
    for (let i = 0; i < (items || []).length; i++) {
      const it = items[i];
      if (it.type === 'date' || it.type === 'time') {
        flushLines();
        if (items[i + 1] && ['date', 'time'].includes(items[i + 1].type)) i++;
        out.push({ card: add('clock', { date: true, hour12: !!it.hour12, seconds: !!it.seconds }, { style: CLEAR }), x, y, w: cw, h: 110 });
        y += 110 + GAP;
      } else if (it.type?.startsWith('weather')) {
        flushLines();
        if (states.size && !states.has(it.entity_id)) continue;
        const daily = it.type === 'weatherforecast' || it.forecast_type !== 'hourly';
        out.push({ card: add('weather', { entity: it.entity_id, forecast: daily ? 'daily' : 'hourly', days: it.number_of_items || it.days_to_show || 5 }), x, y, w: cw, h: 190 });
        y += 190 + GAP;
      } else if (it.type === 'template') lines.push(it.template);
      else if (it.type === 'divider') flushLines();
      else if (it.entity_id) lines.push(`{{ state_attr('${it.entity_id}','friendly_name') }}: {{ states('${it.entity_id}') }}`);
    }
    flushLines();
    return { out, y };
  }

  const ICONS = { downstairs: 'mdi:sofa', upstairs: 'mdi:bed', garden: 'mdi:flower', outside: 'mdi:tree' };
  const sbW = db.sidebarWidth || 360;
  // One main (tablet) layout; desktop shows it scaled and phone reflows it automatically.
  const width = 1280;
  const sb = !db.hide_sidebar;
  const mainW = width - (sb ? sbW : 0);
  const zones = {};
  (db.views || []).forEach((v, i) => {
    const id = 'v' + i;
    cfg.views.push({ id, name: v.name || `View ${i + 1}`, icon: ICONS[(v.name || '').toLowerCase()] || 'mdi:view-dashboard' });
    zones[id] = view(v, mainW);
  });
  const nav = add('nav', { direction: 'horizontal', show_icons: true, show_names: true }, { style: { padding: '6', radius: '18' } });
  const side = sidebar(db.sidebar, sb ? sbW : width);
  if (sb) zones.sidebar = [{ card: nav, x: 16, y: 16, w: sbW - 32, h: 56 }, ...side.out.map((p) => ({ ...p, y: p.y + 70 }))];
  else {
    zones.sidebar = [];
    for (const v of cfg.views) {
      for (const p of zones[v.id]) p.y += 70;
      zones[v.id].unshift({ card: nav, x: 20, y: 12, w: mainW - 40, h: 56 });
    }
  }
  cfg.layouts.tablet = { width, sidebar: { enabled: sb, side: 'left', width: sbW }, zones };
  cfg.layouts.phone = { width: DEVICES.phone.width, mode: 'auto', sidebar: { enabled: false, side: 'left', width: 300 }, zones: { sidebar: [] } };
  cfg.layouts.desktop = { width: DEVICES.desktop.width, mode: 'same', sidebar: { enabled: false, side: 'left', width: 300 }, zones: { sidebar: [] } };
  if (energy) addEnergy(cfg, add);
  return cfg;
}

function addEnergy(cfg, add) {
  const meta = (t) => registry[t].meta;
  const card = (t, extra = {}) => add(t, { ...structuredClone(meta(t).defaults || {}), ...(meta(t).autofill?.() || {}), ...extra });
  const items = [];
  const has = (t, key) => !!meta(t).autofill?.()[key];
  if (has('octopus-rates', 'rates')) items.push(['octopus-rates', card('octopus-rates'), 2, 290]);
  items.push(['powerflow', null, 1, 290]);
  if (has('octopus-sessions', 'saving')) items.push(['octopus-sessions', card('octopus-sessions'), 1, 380]);
  if (has('octopus-intelligent', 'dispatching')) items.push(['octopus-intelligent', card('octopus-intelligent'), 1, 380]);
  if (has('energy-today', 'cost')) items.push(['energy-today', card('energy-today'), 1, 300]);
  if (has('heatpump', 'power_in')) items.push(['heatpump', card('heatpump'), 1, 300]);
  if (has('battery', 'soc')) items.push(['battery', card('battery'), 1, 260]);
  if (has('predbat', 'plan')) items.push(['predbat', card('predbat'), 1, 420]);
  if (has('myenergi', 'mode')) items.push(['myenergi', card('myenergi'), 1, 230]);
  const evName = (p) => p.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  for (const id of states.keys()) {
    let m;
    if ((m = id.match(/^sensor\.((?!octopus)[a-z0-9_]+?)_state_of_charge$/)) && !m[1].endsWith('target')) {
      // Audi / VW style
      const p = m[1];
      const s = (x, d = 'sensor') => `${d}.${p}_${x}`;
      items.push(['ev', add('ev', { name: evName(p), soc: id, range: s('range'), charging: s('charging_state'), power: s('charging_power'), target: s('target_state_of_charge'), remaining: s('remaining_charge_time'), plug: s('plug_state', 'binary_sensor'), lock: s('doors_lock', 'binary_sensor'), climate: s('climatisation', 'climate'), mileage: s('mileage') }), 1, 200]);
    } else if ((m = id.match(/^sensor\.([a-z0-9_]+)_battery_autonomy$/))) {
      // Renault style
      const p = m[1];
      const s = (x, d = 'sensor') => `${d}.${p}_${x}`;
      items.push(['ev', add('ev', { name: evName(p), soc: s('battery'), range: id, charging: s('charge_state'), power: s('admissible_charging_power'), target: s('target_charge_level', 'number'), remaining: s('charging_remaining_time'), plug: s('plug', 'binary_sensor'), mileage: s('mileage') }), 1, 200]);
    }
  }
  // Power flow from common solar / grid / battery sensors if we can spot them.
  const f = (re) => [...states.keys()].find((k) => re.test(k)) || '';
  const pf = items.find((i) => i[0] === 'powerflow');
  const solar = f(/^sensor\..*solar.*(production|generation|pv).*_w$|^sensor\.myenergi_hub_.+_power_generation/);
  if (solar) pf[1] = add('powerflow', { solar, grid: f(/^sensor\.myenergi_hub_.+_power_grid/), battery: f(/^sensor\.solaredge_b1_dc_power$/), battery_invert: true, battery_soc: f(/^sensor\.solaredge_b1_state_of_energy$/), ev: myenergiPower(f(/^sensor\.myenergi_hub_.+_power_charging/)), ev_label: 'Zappi' });
  else items.splice(items.indexOf(pf), 1);
  if (!items.length) return;

  cfg.views.push({ id: 'energy', name: 'Energy', icon: 'mdi:lightning-bolt' });
  for (const l of [cfg.layouts.tablet]) {
    const mainW = l.width - (l.sidebar.enabled ? l.sidebar.width : 0);
    const cols = mainW >= 1100 ? 3 : mainW >= 700 ? 2 : 1;
    const cw = Math.floor((mainW - 40 - GAP * (cols - 1)) / cols);
    const colY = Array(cols).fill(20);
    const out = [];
    for (const [, id, span, h] of items) {
      const s = Math.min(span, cols);
      // Place in the left-most columns run with the lowest top.
      let best = 0, bestY = Infinity;
      for (let c = 0; c + s <= cols; c++) {
        const y = Math.max(...colY.slice(c, c + s));
        if (y < bestY) { bestY = y; best = c; }
      }
      out.push({ card: id, x: 20 + best * (cw + GAP), y: bestY, w: cw * s + GAP * (s - 1), h });
      for (let c = best; c < best + s; c++) colY[c] = bestY + h + GAP;
    }
    l.zones.energy = out;
  }
}
