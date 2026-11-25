<script module>
  export const meta = {
    type: 'gauge', name: 'Gauge', icon: 'mdi:gauge', category: 'Info',
    size: { w: 200, h: 180 }, tap: 'more-info',
    defaults: { entity: '', min: 0, max: 100 },
    fields: [
      { key: 'entity', label: 'Entity', type: 'entity' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'value', label: 'Value (override/template)', type: 'text' },
      { key: 'unit', label: 'Unit', type: 'text' },
      { key: 'min', label: 'Min', type: 'text' },
      { key: 'max', label: 'Max', type: 'text' },
      { key: 'green', label: 'Green from', type: 'text' },
      { key: 'yellow', label: 'Yellow from', type: 'text' },
      { key: 'red', label: 'Red from', type: 'text' },
      { key: 'bands', label: 'Colour bands (instead of green / yellow / red)', type: 'text', placeholder: '0 red, 20 orange, 40 green', hint: 'Each colour applies from its number up to the next one, so low can be red (fuel, battery) and a range can be green in the middle, e.g. 0 red, 75 yellow, 77 green, 81 yellow, 83 red. Colour names or #hex; template ok.' },
      { key: 'color', label: 'Colour (fixed/template)', type: 'color' },
    ],
  };
</script>

<script>
  import { t, ent } from '../lib/tpl.js';
  import { name, formatNumber } from '../lib/entity.js';
  let { props } = $props();
  const e = $derived(ent(props.entity));
  const v = $derived(Number(props.value ? t(props.value) : e?.state));
  const min = $derived(Number(t(props.min)) || 0);
  const max = $derived(Number(t(props.max)) || 100);
  const f = $derived(Number.isNaN(v) ? 0 : Math.min(1, Math.max(0, (v - min) / (max - min))));
  const num = (k) => (props[k] === '' || props[k] == null ? null : Number(t(props[k])));
  // The house's own shades for the usual names; anything else is used as given.
  const SHADE = { red: '#ff6b6b', orange: '#ff9a3c', amber: '#ffc861', yellow: '#ffc861', green: '#5bd88f', blue: '#4fb4ff' };
  // "0 red, 20 orange, 40 green" → bands from each number upwards, lowest first.
  const bands = $derived(String(t(props.bands) ?? '').split(',').map((b) => b.trim().match(/^(-?\d+(?:[.,]\d+)?)\s+(.+)$/)).filter(Boolean)
    .map((m) => ({ from: Number(m[1].replace(',', '.')), color: SHADE[m[2].trim().toLowerCase()] || m[2].trim() })).sort((a, b) => a.from - b.from));
  const color = $derived.by(() => {
    if (props.color) return t(props.color);
    if (bands.length) return Number.isNaN(v) ? 'var(--accent)' : [...bands].reverse().find((b) => v >= b.from)?.color || bands[0].color;
    const r = num('red'), y = num('yellow'), g = num('green');
    if (r != null && v >= r) return '#ff6b6b';
    if (y != null && v >= y) return '#ffc861';
    if (g != null && v >= g) return '#5bd88f';
    return 'var(--accent)';
  });
  const R = 40, C = Math.PI * R;
</script>

<div class="gauge">
  <svg viewBox="0 0 100 58">
    <path d="M10,50 A40,40 0 0 1 90,50" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="9" stroke-linecap="round" />
    <path d="M10,50 A40,40 0 0 1 90,50" fill="none" stroke-width="9" stroke-linecap="round" stroke-dasharray="{C * f} {C}" style="stroke:{color};transition: stroke-dasharray .6s" />
  </svg>
  <div class="val">{Number.isNaN(v) ? '—' : formatNumber(v)}<small>{t(props.unit) || e?.attributes.unit_of_measurement || ''}</small></div>
  <div class="name">{t(props.name) || name(e)}</div>
</div>

<style>
  .gauge { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  svg { width: 100%; max-height: 70%; flex: 1 1 auto; min-height: 0; }
  .val { font-size: 1.6em; font-weight: 600; margin-top: -1.2em; }
  small { font-size: .55em; color: var(--muted); margin-left: 2px; }
  .name { color: var(--muted); font-size: .9em; margin-top: 4px; text-align: center; }
</style>
