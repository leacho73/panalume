// A view built from one of Home Assistant's areas: a card for each thing in it
// (thermostats, lights, switches, media players, cameras…) and one list for its
// sensors. After that they're ordinary cards, to move, resize or remove.
import { send, states } from './ha.svelte.js';
import { cards } from './registry.js';

export async function areas() {
  const list = await send({ type: 'config/area_registry/list' });
  return (list || []).sort((a, b) => a.name.localeCompare(b.name));
}

// Which card each kind of entity gets, in the order they're laid out.
const KIND = [
  ['climate', 'climate'], ['water_heater', 'climate'], ['humidifier', 'humidifier'],
  ['light', 'light'],
  ['switch', 'button'], ['input_boolean', 'button'], ['fan', 'button'], ['siren', 'button'], ['valve', 'button'], ['scene', 'button'], ['script', 'button'], ['button', 'button'], ['input_button', 'button'],
  ['cover', 'cover'], ['lock', 'lock'], ['alarm_control_panel', 'alarm'],
  ['media_player', 'media'], ['vacuum', 'vacuum'], ['lawn_mower', 'lawn-mower'], ['todo', 'todo'],
  ['camera', 'camera'],
];
const ORDER = Object.fromEntries(KIND.map(([d], i) => [d, i]));
const CARD = Object.fromEntries(KIND);
const LISTED = new Set(['sensor', 'binary_sensor']);

/** The cards for an area: [{ type, props, w, h }], in layout order. */
export async function areaCards(areaId) {
  const [devs, reg] = await Promise.all([send({ type: 'config/device_registry/list' }), send({ type: 'config/entity_registry/list_for_display' })]);
  const devArea = new Map((devs || []).map((d) => [d.id, d.area_id]));
  // In the area (its own, or its device's), not a settings / diagnostic entity, not hidden.
  const ids = (reg?.entities || []).filter((e) => (e.ai || devArea.get(e.di)) === areaId && e.ec == null && !e.hb && states.has(e.ei)).map((e) => e.ei);
  const dom = (id) => id.split('.')[0];
  const out = [];
  for (const id of ids.filter((x) => CARD[dom(x)]).sort((a, b) => ORDER[dom(a)] - ORDER[dom(b)] || a.localeCompare(b))) {
    const type = CARD[dom(id)];
    const m = cards[type]?.meta;
    if (!m) continue;
    // Switches and the like as small tiles; everything else at its usual size.
    const tile = type === 'button';
    out.push({ type, props: { ...structuredClone(m.defaults || {}), entity: id, ...(tile ? { layout: 'horizontal' } : {}) }, w: tile ? 220 : m.size.w, h: tile ? 72 : m.size.h });
  }
  const listed = ids.filter((x) => LISTED.has(dom(x))).sort();
  if (listed.length) out.push({ type: 'entities', props: { ...structuredClone(cards.entities.meta.defaults), title: 'Sensors', entities: listed }, w: 320, h: Math.min(520, 60 + listed.length * 40) });
  return out;
}
