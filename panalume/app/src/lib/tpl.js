// Any string setting may be an HA template ({{ }} / {% %}); it's rendered live by HA.
import { renderTemplate, states, me } from './ha.svelte.js';

export const isTpl = (v) => typeof v === 'string' && (v.includes('{{') || v.includes('{%'));

/** Resolve a possibly-templated value. */
export function t(v, vars) {
  if (!isTpl(v)) return v;
  // Templates can use `entity_id` (the card's entity), as in ha-fusion, and
  // `user` / `user_name` (who's looking, so a card can show for one tablet's login).
  // Until we know who's looking, a template using them stays blank (so a card meant
  // for one tablet doesn't flash up on the others).
  if (v.includes('user') && !me.known) return '';
  const use = { ...(vars && v.includes('entity_id') ? vars : {}), ...(v.includes('user') ? { user: me.id, user_name: me.name } : {}) };
  return renderTemplate(v, Object.keys(use).length ? use : undefined) ?? '';
}

/** Entity state object for a (possibly templated) entity id. */
export function ent(id) {
  const v = t(id);
  return v ? states.get(String(v).trim()) : undefined;
}

export const truthy = (v) => !['false', '0', 'off', 'no', 'none', ''].includes(String(v ?? '').trim().toLowerCase());
