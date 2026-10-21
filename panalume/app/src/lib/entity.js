// Entity helpers: names, formatted states, default icons, toggling.
import { callService } from './ha.svelte.js';
import { stateWord } from './i18n.svelte.js';

export const domain = (id) => id?.split('.')[0] || '';

export function name(e, fallback) {
  return fallback || e?.attributes.friendly_name || e?.entity_id || '';
}

const OFF = new Set(['off', 'closed', 'idle', 'standby', 'unavailable', 'unknown', 'not_home', 'paused', 'disarmed', 'docked', 'locked', 'none', '']);
export function isActive(e) {
  if (!e) return false;
  if (domain(e.entity_id) === 'climate') return e.state !== 'off' && e.attributes.hvac_action !== 'idle' && e.attributes.hvac_action !== 'off';
  if (domain(e.entity_id) === 'lock') return e.state === 'unlocked';
  return !OFF.has(e.state) && !(Number(e.state) === 0 && e.state !== '');
}

export const unavailable = (e) => !e || e.state === 'unavailable' || e.state === 'unknown';

const TOGGLE = new Set(['light', 'switch', 'fan', 'input_boolean', 'automation', 'media_player', 'cover', 'lock', 'siren', 'humidifier', 'climate', 'water_heater', 'vacuum']);
export const canToggle = (id) => TOGGLE.has(domain(id));

export function toggle(e) {
  const id = e.entity_id;
  const d = domain(id);
  const target = { entity_id: id };
  if (d === 'cover') return callService('cover', 'toggle', {}, target);
  if (d === 'lock') return callService('lock', e.state === 'locked' ? 'unlock' : 'lock', {}, target);
  if (d === 'media_player') return callService('media_player', 'media_play_pause', {}, target);
  if (d === 'scene' || d === 'script') return callService(d, 'turn_on', {}, target);
  if (d === 'button' || d === 'input_button') return callService(d, 'press', {}, target);
  if (d === 'climate') return callService('climate', e.state === 'off' ? 'turn_on' : 'turn_off', {}, target);
  return callService('homeassistant', 'toggle', {}, target);
}

export function formatNumber(v, digits) {
  const n = Number(v);
  if (v === '' || v == null || Number.isNaN(n)) return v;
  const d = digits ?? (Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : Math.abs(n) % 1 === 0 ? 0 : 2);
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

const LABEL = { on: 'On', off: 'Off', unavailable: 'Unavailable', unknown: 'Unknown', home: 'Home', not_home: 'Away', open: 'Open', closed: 'Closed', playing: 'Playing', paused: 'Paused', idle: 'Idle', locked: 'Locked', unlocked: 'Unlocked', heat: 'Heat', cool: 'Cool', auto: 'Auto', heat_cool: 'Heat/Cool', dry: 'Dry', fan_only: 'Fan' };

// Binary sensor states in Home Assistant's own words, by device class.
const OPEN = ['Open', 'Closed'], DETECT = ['Detected', 'Clear'];
const BINARY = {
  door: OPEN, window: OPEN, opening: OPEN, garage_door: OPEN,
  motion: DETECT, occupancy: DETECT, presence: ['Home', 'Away'], smoke: DETECT, gas: DETECT, carbon_monoxide: DETECT, sound: DETECT, vibration: DETECT, tamper: DETECT,
  moisture: ['Wet', 'Dry'], lock: ['Unlocked', 'Locked'], plug: ['Plugged in', 'Unplugged'], connectivity: ['Connected', 'Disconnected'],
  battery: ['Low', 'Normal'], battery_charging: ['Charging', 'Not charging'], problem: ['Problem', 'OK'], safety: ['Unsafe', 'Safe'],
  cold: ['Cold', 'Normal'], heat: ['Hot', 'Normal'], light: ['Light', 'No light'], moving: ['Moving', 'Not moving'], power: ['Power', 'No power'],
  running: ['Running', 'Not running'], update: ['Update available', 'Up to date'],
};

export function stateText(e, { digits, unit = true } = {}) {
  if (!e) return '—';
  const d = domain(e.entity_id);
  if (d === 'light' && e.state === 'on' && e.attributes.brightness != null) return Math.round((e.attributes.brightness / 255) * 100) + '%';
  if (d === 'cover' && e.attributes.current_position != null && e.state === 'open') return e.attributes.current_position + '%';
  if (d === 'climate') {
    const t = e.attributes.current_temperature;
    return t != null ? `${formatNumber(t, 1)}°` : stateWord(d, null, e.state) || LABEL[e.state] || e.state;
  }
  if (e.attributes.device_class === 'timestamp' || d === 'input_datetime') return relTime(e.state);
  // In Home Assistant's language when it isn't English (Ligado, Aberta…).
  const word = stateWord(d, e.attributes.device_class, e.state);
  if (word) return word;
  if (d === 'binary_sensor' && (e.state === 'on' || e.state === 'off')) {
    const w = BINARY[e.attributes.device_class];
    if (w) return w[e.state === 'on' ? 0 : 1];
  }
  const n = Number(e.state);
  if (e.state !== '' && !Number.isNaN(n)) {
    const u = e.attributes.unit_of_measurement;
    return formatNumber(e.state, digits) + (unit && u ? (u === '%' || u === '°C' || u === '°F' ? '' : ' ') + u : '');
  }
  return LABEL[e.state] || e.state.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export function relTime(v) {
  const t = typeof v === 'number' ? v * 1000 : Date.parse(v);
  if (Number.isNaN(t)) return v;
  const s = Math.round((t - Date.now()) / 1000);
  const a = Math.abs(s);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (a < 60) return rtf.format(s, 'second');
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}

const DOMAIN_ICON = {
  light: ['mdi:lightbulb', 'mdi:lightbulb-outline'], switch: ['mdi:toggle-switch', 'mdi:toggle-switch-off-outline'],
  fan: ['mdi:fan', 'mdi:fan-off'], input_boolean: ['mdi:check-circle', 'mdi:close-circle-outline'],
  media_player: ['mdi:speaker-play', 'mdi:speaker'], cover: ['mdi:blinds-open', 'mdi:blinds'],
  lock: ['mdi:lock-open-variant', 'mdi:lock'], climate: ['mdi:thermostat', 'mdi:thermostat'],
  water_heater: ['mdi:water-boiler', 'mdi:water-boiler-off'], person: ['mdi:account', 'mdi:account-outline'],
  device_tracker: ['mdi:map-marker', 'mdi:map-marker-off'], camera: ['mdi:cctv', 'mdi:cctv'],
  scene: ['mdi:palette', 'mdi:palette'], script: ['mdi:script-text', 'mdi:script-text'], automation: ['mdi:robot', 'mdi:robot-off'],
  button: ['mdi:gesture-tap-button', 'mdi:gesture-tap-button'], input_button: ['mdi:gesture-tap-button', 'mdi:gesture-tap-button'],
  weather: ['mdi:weather-partly-cloudy', 'mdi:weather-partly-cloudy'], sun: ['mdi:white-balance-sunny', 'mdi:weather-night'],
  alarm_control_panel: ['mdi:shield-lock', 'mdi:shield-off'], vacuum: ['mdi:robot-vacuum', 'mdi:robot-vacuum'],
  number: ['mdi:ray-vertex', 'mdi:ray-vertex'], input_number: ['mdi:ray-vertex', 'mdi:ray-vertex'],
  select: ['mdi:format-list-bulleted', 'mdi:format-list-bulleted'], input_select: ['mdi:format-list-bulleted', 'mdi:format-list-bulleted'],
  update: ['mdi:package-up', 'mdi:package'], calendar: ['mdi:calendar', 'mdi:calendar'], siren: ['mdi:alarm-light', 'mdi:alarm-light-off'],
  binary_sensor: ['mdi:checkbox-marked-circle', 'mdi:checkbox-blank-circle-outline'],
};
const CLASS_ICON = {
  temperature: 'mdi:thermometer', humidity: 'mdi:water-percent', power: 'mdi:flash', energy: 'mdi:lightning-bolt',
  battery: 'mdi:battery', illuminance: 'mdi:brightness-5', voltage: 'mdi:sine-wave', current: 'mdi:current-ac',
  monetary: 'mdi:cash', pressure: 'mdi:gauge', carbon_dioxide: 'mdi:molecule-co2', gas: 'mdi:meter-gas', water: 'mdi:water',
  door: 'mdi:door', window: 'mdi:window-closed-variant', motion: 'mdi:motion-sensor', occupancy: 'mdi:home-account',
  presence: 'mdi:home-account', plug: 'mdi:power-plug', connectivity: 'mdi:wifi', timestamp: 'mdi:clock-outline', speed: 'mdi:speedometer',
  outlet: 'mdi:power-socket-uk', garage: 'mdi:garage', garage_door: 'mdi:garage', smoke: 'mdi:smoke-detector', moisture: 'mdi:water-alert',
};

export function entityIcon(e) {
  if (!e) return 'mdi:help-circle-outline';
  if (e.attributes.icon) return e.attributes.icon;
  const d = domain(e.entity_id);
  const dc = e.attributes.device_class;
  if (dc === 'door' || dc === 'garage_door') return isActive(e) ? 'mdi:door-open' : 'mdi:door-closed';
  if (dc === 'window') return isActive(e) ? 'mdi:window-open-variant' : 'mdi:window-closed-variant';
  if (dc && CLASS_ICON[dc]) return CLASS_ICON[dc];
  const pair = DOMAIN_ICON[d];
  if (pair) return isActive(e) ? pair[0] : pair[1];
  return 'mdi:eye';
}

/** Entity's light colour as CSS, for tinting icons. */
export function lightColor(e) {
  const a = e?.attributes;
  if (!a || e.state !== 'on') return null;
  if (a.rgb_color) return `rgb(${a.rgb_color.join(',')})`;
  if (a.hs_color) return `hsl(${a.hs_color[0]} ${Math.max(a.hs_color[1], 30)}% 60%)`;
  return null;
}
