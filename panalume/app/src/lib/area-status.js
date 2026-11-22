export const INDICATOR_TYPES = {
  temperature: { label: 'Temperature', icon: 'mdi:thermometer' },
  humidity: { label: 'Humidity', icon: 'mdi:water-percent' },
  lights: { label: 'Lights', icon: 'mdi:lightbulb-group-outline' },
  covers: { label: 'Covers', icon: 'mdi:blinds-horizontal' },
  illuminance: { label: 'Illuminance', icon: 'mdi:brightness-5' },
  smoke: { label: 'Smoke', icon: 'mdi:smoke-detector-variant' },
  windows: { label: 'Windows', icon: 'mdi:window-open-variant' },
  doors: { label: 'Doors', icon: 'mdi:door-open' },
  motion: { label: 'Motion', icon: 'mdi:motion-sensor' },
  entity: { label: 'Sensor', icon: 'mdi:gauge' },
};
export const DEFAULT_INDICATOR_ORDER = ['lights', 'covers', 'temperature', 'humidity', 'illuminance', 'windows', 'doors', 'motion', 'smoke'];
const newIndicator = (kind) => ({ id: kind, kind, enabled: true, entities: [], excluded: [] });
export const defaultIndicators = () => DEFAULT_INDICATOR_ORDER.map(newIndicator);
export const singleReading = (kind) => ['temperature', 'humidity', 'illuminance', 'entity'].includes(kind);

const excludedByRegistry = (registry) => new Set((registry.entities || []).filter((e) => e.hidden_by || e.disabled_by).map((e) => e.entity_id));
export const areaEntityIds = (area, registry) => {
  if (!area) return [];
  const devices = new Map((registry.devices || []).map((d) => [d.id, d.area_id]));
  return (registry.entities || []).filter((e) => !e.disabled_by && !e.hidden_by && (e.area_id || devices.get(e.device_id)) === area).map((e) => e.entity_id).sort();
};
const unknown = (e) => !e || ['', 'unknown', 'unavailable'].includes(e.state);
const matches = (kind, e) => {
  const domain = e?.entity_id?.split('.')[0], dc = e?.attributes?.device_class;
  if (kind === 'lights') return domain === 'light';
  if (kind === 'covers') return domain === 'cover';
  if (kind === 'smoke') return domain === 'binary_sensor' && dc === 'smoke';
  if (kind === 'windows') return domain === 'binary_sensor' && ['window', 'opening'].includes(dc);
  if (kind === 'doors') return domain === 'binary_sensor' && ['door', 'garage_door'].includes(dc);
  if (kind === 'motion') return domain === 'binary_sensor' && ['motion', 'occupancy', 'presence'].includes(dc);
  return domain === 'sensor' && dc === kind;
};

// Expand light groups to leaves, deduplicating both nested groups and direct members.
export function groupLeaves(ids, states, excluded = [], domain = 'light') {
  const leaves = new Set(), seen = new Set(), omit = new Set(excluded);
  function visit(id) {
    if (seen.has(id) || omit.has(id)) return;
    seen.add(id);
    const members = states.get(id)?.attributes?.entity_id;
    if (Array.isArray(members) && members.some((x) => x.startsWith(domain + '.'))) {
      for (const member of members) if (member.startsWith(domain + '.')) visit(member);
    } else leaves.add(id);
  }
  ids.forEach(visit);
  return [...leaves];
}
export const lightLeaves = (ids, states, excluded) => groupLeaves(ids, states, excluded, 'light');

export function indicatorEntities(props, item, registry, states) {
  // Wait for visibility metadata, including for explicitly selected entities.
  if (registry.ready === false) return [];
  const blocked = excludedByRegistry(registry);
  const manual = item.entities?.length;
  let ids = manual ? [...new Set(item.entities)] : areaEntityIds(props.area, registry).filter((id) => matches(item.kind, states.get(id)));
  ids = ids.filter((id) => !blocked.has(id) && !item.excluded?.includes(id));
  if (['lights', 'covers'].includes(item.kind)) ids = groupLeaves(ids, states, [...blocked, ...(item.excluded || [])], item.kind === 'lights' ? 'light' : 'cover');
  // Without an explicit choice use one available reading, never average different sensors/units.
  if (singleReading(item.kind)) {
    if (!manual) ids = [...ids.filter((id) => !unknown(states.get(id))), ...ids.filter((id) => unknown(states.get(id)))];
    ids = ids.slice(0, 1);
  }
  return ids;
}

export function indicatorSummary(kind, ids, states) {
  const entries = ids.map((id) => states.get(id)), missing = entries.filter(unknown).length;
  const active = entries.filter((e) => !unknown(e) && e.state === (kind === 'covers' ? 'open' : 'on')).length;
  if (!ids.length) return { text: '—', active: false, missing: 0 };
  if (missing === ids.length) return { text: 'Unavailable', active: false, missing };
  if (!['lights', 'covers', 'windows', 'doors', 'motion', 'smoke'].includes(kind)) return { entity: entries[0], active: false, missing };
  const moving = kind === 'covers' ? entries.filter((e) => ['opening', 'closing'].includes(e?.state)).length : 0;
  let text = kind === 'lights' ? `${active} on` : ['motion', 'smoke'].includes(kind) ? (active ? 'Detected' : missing ? '0 detected' : 'Clear') : (active || missing || moving ? `${active} open` : 'Closed');
  if (moving) text += ` · ${moving} moving`;
  if (missing) text += ` · ${missing} unavailable`;
  return { text, active: active > 0 || moving > 0, missing };
}

// Registry-backed automatic entities must join Panalume's existing filtered subscription.
export function areaStatusWatch(props, registry, states) {
  const blocked = excludedByRegistry(registry);
  const ids = new Set(areaEntityIds(props.area, registry));
  for (const item of props.indicators || []) for (const id of item.entities || []) if (!blocked.has(id)) ids.add(id);
  // Keep intermediate groups watched too, so their membership changes remain live.
  for (const id of ids) if (id.startsWith('light.') || id.startsWith('cover.')) {
    const prefix = id.split('.')[0] + '.';
    const members = states.get(id)?.attributes?.entity_id;
    if (Array.isArray(members)) for (const member of members) if (member.startsWith(prefix) && !blocked.has(member)) ids.add(member);
  }
  return [...ids];
}
