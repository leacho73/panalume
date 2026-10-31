// Shared settings and auto-detection for the washing machine, dishwasher and
// tumble dryer cards (components/Appliance.svelte draws them).
import { states } from './ha.svelte.js';

export const KINDS = {
  washer: { name: 'Washing machine', icon: 'mdi:washing-machine', color: '#4fb4ff' },
  dryer: { name: 'Tumble dryer', icon: 'mdi:tumble-dryer', color: '#ff9a57' },
  dishwasher: { name: 'Dishwasher', icon: 'mdi:dishwasher', color: '#5bd88f' },
};

const has = (id) => (id && states.has(id) ? id : '');
const keys = () => [...states.keys()];

// Integrations name their entities "<device>_<thing>"; find the device by a
// tell-tale entity, then fill in its siblings.
function siblings(p, map) {
  const out = {};
  for (const [k, list] of Object.entries(map)) out[k] = [].concat(list).map((x) => has(x.replace('*', p))).find(Boolean) || '';
  return out;
}
const device = (id, re) => states.get(id)?.attributes.friendly_name?.replace(re, '').trim() || '';
const leak = (re) => keys().find((k) => /^binary_sensor\..*(leak|water)/.test(k) && re.test(k)) || '';

export const AUTOFILL = {
  // Samsung SmartThings washer (or any "<x>_machine_state" + "<x>_job_state").
  washer() {
    const p = keys().map((k) => k.match(/^sensor\.(.+)_machine_state$/)?.[1]).find((x) => x && states.has(`sensor.${x}_job_state`) && !/dry/.test(x));
    if (!p) return {};
    return {
      name: device(`sensor.${p}_machine_state`, /machine state$/i),
      ...siblings(p, {
        state: 'sensor.*_machine_state', phase: 'sensor.*_job_state', finish: 'sensor.*_completion_time', power: 'sensor.*_power',
        control: 'select.*',
      }),
      options: [`select.${p}_spin_level`, `select.${p}_water_temperature`, `number.${p}_rinse_cycles`].filter(has),
      alerts: [],
      leak: leak(/wash/),
    };
  },
  // LG ThinQ dishwasher: "<x>_current_status" + "<x>_current_cycle", the time left
  // as the clock time it ends, a clean indicator light and a rinse aid level.
  dishLG() {
    const p = keys().map((k) => k.match(/^sensor\.(.+)_current_status$/)?.[1]).find((x) => x && states.has(`sensor.${x}_current_cycle`));
    if (!p) return {};
    return {
      name: device(`sensor.${p}_current_status`, /current status$/i),
      ...siblings(p, {
        state: 'sensor.*_current_status', program: ['sensor.*_current_cycle', 'select.*_active_program'],
        total: 'sensor.*_total_time', remaining: 'sensor.*_remaining_time', power: 'sensor.*_power',
        door: ['binary_sensor.*_door', 'sensor.*_door'],
        clean: 'binary_sensor.*_clean_indicator_light',
        rinse: 'sensor.*_rinse_aid_dispenser_level', salt: 'sensor.*_salt_level',
      }),
      alerts: [`binary_sensor.${p}_machine_clean_reminder`, `binary_sensor.${p}_rinse_refill_needed`, `binary_sensor.${p}_salt_refill_needed`].filter(has),
      leak: leak(/dish/),
    };
  },
  // Home Connect (Bosch / Neff / Siemens) dishwasher.
  dishwasher() {
    const lg = AUTOFILL.dishLG();
    if (lg.state) return lg;
    const p = keys().map((k) => k.match(/^sensor\.(.+)_operation_state$/)?.[1]).find((x) => x && (states.has(`sensor.${x}_program_progress`) || /dish/.test(x)));
    if (!p) return {};
    return {
      name: device(`sensor.${p}_operation_state`, /operation state$/i),
      ...siblings(p, {
        state: 'sensor.*_operation_state', program: ['select.*_active_program', 'sensor.*_active_program', 'select.*_selected_program'], progress: 'sensor.*_program_progress',
        finish: 'sensor.*_program_finish_time', door: 'sensor.*_door', stop: ['button.*_stop_programme', 'button.*_stop_program'], power: 'sensor.*_power',
      }),
      alerts: [`sensor.${p}_salt_nearly_empty`, `sensor.${p}_rinse_aid_nearly_empty`].filter(has),
      leak: leak(/dish/),
    };
  },
  // Haier / Candy / Hoover (hOn) dryer: "<x>_program_name" + "<x>_remaining_time".
  dryer() {
    const cands = keys().map((k) => k.match(/^sensor\.(.+)_remaining_time$/)?.[1]).filter((x) => x && states.has(`sensor.${x}_program_name`));
    const p = cands.find((x) => /dry|tumble/.test(x)) || cands.find((x) => states.has(`sensor.${x}_dry_level`));
    if (!p) return {};
    return {
      name: device(`sensor.${p}_program_name`, /program(me)? name$/i),
      ...siblings(p, {
        state: 'binary_sensor.*_status', program: 'sensor.*_program_name', remaining: 'sensor.*_remaining_time', finish: 'sensor.*_end_time',
        door: 'binary_sensor.*_door_status', paused: 'binary_sensor.*_paused', power: 'sensor.*_power',
      }),
      options: [`sensor.${p}_dry_level`].filter(has),
      alerts: [],
      leak: leak(/dry|tumble/),
    };
  },
};

// A dishwasher has two things the other two do not: a salt and rinse aid level,
// and a light that stays on after the cycle because the load inside is clean.
const DISH_ONLY = {
  sections: [{ key: 'consumables', label: 'Salt & rinse aid' }],
  fields: [
    { key: 'total', label: 'Cycle length (minutes)', type: 'entity', domain: 'sensor', section: 'time', hint: 'The full programme, so the card can say "of 1h 45m" beside the time left.' },
    { key: 'clean', label: 'Clean indicator (on when the load is clean)', type: 'entity', domain: 'binary_sensor', section: 'alerts' },
    { key: 'salt', label: 'Salt level (level, %, or "needs salt")', type: 'entity', section: 'consumables' },
    { key: 'rinse', label: 'Rinse aid level (level, %, or "needs rinse aid")', type: 'entity', section: 'consumables' },
  ],
};

export function applianceMeta(kind) {
  const k = KINDS[kind];
  const dish = kind === 'dishwasher';
  return {
    type: kind, name: k.name, icon: k.icon, category: 'Controls',
    size: { w: 420, h: 220 }, tap: 'none', hold: 'none',
    defaults: {},
    autofill: AUTOFILL[kind],
    sections: [
      { key: 'picture', label: 'Picture & progress' }, { key: 'program', label: 'Programme' }, { key: 'time', label: 'Time left' },
      { key: 'options', label: 'Settings' }, { key: 'power', label: 'Power' }, { key: 'alerts', label: 'Alerts' }, { key: 'controls', label: 'Start / pause / stop' },
      ...(dish ? DISH_ONLY.sections : []),
    ],
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'state', label: 'Status (operation / machine state, or on/off)', type: 'entity' },
      { key: 'program', label: 'Programme', type: 'entity', section: 'program' },
      { key: 'phase', label: 'Phase (wash, rinse, spin…)', type: 'entity', section: 'program' },
      { key: 'progress', label: 'Progress %', type: 'entity', domain: 'sensor', section: 'picture' },
      { key: 'remaining', label: 'Remaining time (minutes)', type: 'entity', domain: 'sensor', section: 'time' },
      { key: 'finish', label: 'Finish time (timestamp)', type: 'entity', domain: 'sensor', section: 'time' },
      { key: 'power', label: 'Power (W)', type: 'entity', domain: 'sensor', section: 'power' },
      { key: 'running_above', label: 'Running only above (W)', type: 'number', section: 'power', hint: 'For smart plugs: below this the machine shows as idle, even with the plug on (e.g. 5 W, over what the plug itself uses). Blank = off. With no status entity, the power alone says when it\'s running.' },
      { key: 'door', label: 'Door', type: 'entity', section: 'alerts' },
      { key: 'paused', label: 'Paused', type: 'entity', domain: 'binary_sensor' },
      { key: 'options', label: 'Settings to show (spin, temperature…)', type: 'entities', section: 'options' },
      { key: 'alerts', label: 'Alerts (shown when on, e.g. salt low, child lock)', type: 'entities', section: 'alerts' },
      { key: 'leak', label: 'Leak sensor', type: 'entity', domain: 'binary_sensor', section: 'alerts' },
      { key: 'control', label: 'Control select (run / pause / stop options)', type: 'entity', domain: 'select', section: 'controls' },
      { key: 'stop', label: 'Stop button', type: 'entity', domain: 'button', section: 'controls' },
      ...(dish ? DISH_ONLY.fields : []),
    ],
  };
}
