import { conn, send, subscribe } from './ha.svelte.js';

export const areaRegistry = $state({ areas: [], entities: [], devices: [], ready: false, loading: false, error: '' });
let pending, users = 0, stops = [], timer;
export async function loadAreaRegistry() {
  if (pending) return pending;
  areaRegistry.loading = true;
  pending = Promise.all(['area', 'entity', 'device'].map((kind) => send({ type: `config/${kind}_registry/list` })))
    .then(([areas, entities, devices]) => { Object.assign(areaRegistry, { areas, entities, devices, ready: true, error: '' }); })
    .catch(() => { areaRegistry.error = 'Could not read Home Assistant areas. Retry or select entities manually.'; })
    .finally(() => { pending = null; areaRegistry.loading = false; });
  return pending;
}

// All cards/editors share three registry reads and subscriptions, released when unused.
export function useAreaRegistry() {
  $effect(() => {
    if (!conn.connected) return;
    if (++users === 1) {
      loadAreaRegistry();
      stops = ['area', 'entity', 'device'].map((kind) => subscribe({ type: 'subscribe_events', event_type: `${kind}_registry_updated` }, () => {
        clearTimeout(timer); timer = setTimeout(loadAreaRegistry, 250);
      }));
    }
    return () => { if (--users === 0) { clearTimeout(timer); stops.forEach((stop) => stop()); stops = []; } };
  });
}
