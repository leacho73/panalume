// Entity names as Home Assistant 2026.11 builds them ("Name it once"): from the
// entity's own name and its device's, out of the entity and device registries, the
// way Home Assistant's frontend does. An entity with no name of its own (the device's
// main entity) is named after its device. The friendly_name attribute, which Home
// Assistant is phasing out, is only used on older Home Assistant and for entities
// that aren't in the registry (see name() in entity.js).
import { SvelteMap } from 'svelte/reactivity';
import { conn, send, subscribe, onConnect } from './ha.svelte.js';

const ents = new SvelteMap(); // entity_id → { en, di, np }
const devs = new SvelteMap(); // device id → { name, np, via }

// Named by parts from 2026.11; before that the registry's names don't add up the same way.
const byParts = () => {
  const [y, m] = String(conn.haVersion || '').split('.').map(Number);
  return y > 2026 || (y === 2026 && m >= 11);
};

let timer;
async function load() {
  if (!byParts()) return;
  try {
    const [e, d] = await Promise.all([send({ type: 'config/entity_registry/list_for_display' }), send({ type: 'config/device_registry/list' })]);
    ents.clear();
    for (const x of e?.entities || []) ents.set(x.ei, { en: x.en, di: x.di, np: x.np });
    devs.clear();
    for (const x of d || []) devs.set(x.id, { name: (x.name_by_user || x.name || '').trim(), np: x.next_name_part, via: x.via_device_id });
  } catch (err) {
    console.warn('entity names', err);
  }
}
const later = () => { clearTimeout(timer); timer = setTimeout(load, 1500); };
onConnect(load);
// Renames in Home Assistant show up without a reload.
subscribe({ type: 'subscribe_events', event_type: 'entity_registry_updated' }, later);
subscribe({ type: 'subscribe_events', event_type: 'device_registry_updated' }, later);

/** The name Home Assistant shows for an entity, or undefined to fall back on friendly_name. */
export function haName(id) {
  const e = id && ents.get(id);
  if (!e) return undefined;
  const own = e.en || undefined;
  const dev = e.di ? devs.get(e.di) : undefined;
  const device = dev && (e.np === 'device' || !own) ? dev.name : undefined;
  const parent = e.np === 'device' && dev?.np === 'parent_device' && dev.via ? devs.get(dev.via)?.name : undefined;
  return [parent, device, own].filter(Boolean).join(' ') || undefined;
}
