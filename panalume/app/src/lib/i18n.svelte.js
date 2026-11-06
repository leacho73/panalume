// States in Home Assistant's own language. Home Assistant translates states
// (On / Ligado / Eingeschaltet, Open / Aberta…) for every language it supports;
// Panalume asks for those once and uses them wherever it shows a state.
// Panalume's own words (menus, the editor) stay in English.
import { send } from './ha.svelte.js';

let words = $state.raw({});
let loaded = '';

/** Load Home Assistant's state translations for a language (English needs none). */
export function loadTranslations(lang) {
  lang = String(lang || '');
  if (!lang || /^en\b/.test(lang) || loaded === lang) return;
  loaded = lang;
  send({ type: 'frontend/get_translations', language: lang, category: 'entity_component' })
    .then((r) => (words = r?.resources || {}))
    .catch(() => (loaded = ''));
}

/** A state in Home Assistant's language, or undefined (e.g. English, or no translation). */
export function stateWord(domain, deviceClass, state) {
  if (state == null || state === '') return undefined;
  const base = `component.${domain}.entity_component.`;
  return (deviceClass && words[`${base}${deviceClass}.state.${state}`]) || words[`${base}_.state.${state}`];
}

/** An attribute's value in Home Assistant's language, e.g. a thermostat's "heating". */
export function attrWord(domain, attr, value) {
  if (value == null || value === '') return undefined;
  return words[`component.${domain}.entity_component._.state_attributes.${attr}.state.${value}`];
}
