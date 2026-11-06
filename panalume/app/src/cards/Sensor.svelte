<script module>
  export const meta = {
    type: 'sensor', name: 'Sensor', icon: 'mdi:thermometer', category: 'Info',
    size: { w: 220, h: 140 }, tap: 'more-info',
    defaults: { entity: '', graph: true, hours: 24 },
    sections: [{ key: 'icon', label: 'Icon' }, { key: 'name', label: 'Name' }, { key: 'state', label: 'Value / state' }, { key: 'unit', label: 'Unit' }],
    fields: [
      { key: 'entity', label: 'Entity', type: 'entity' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'icon', label: 'Icon', type: 'icon' },
      { key: 'value', label: 'Value (blank = the state)', type: 'text', placeholder: 'e.g. Motion, or a template', hint: 'Type your own text or a template to show instead of the state.' },
      { key: 'unit', label: 'Unit (override)', type: 'text' },
      { key: 'digits', label: 'Decimals', type: 'number' },
      { key: 'value_size', label: 'Value size %', type: 'number', placeholder: 'auto', hint: 'Only the value. Blank shrinks it to fit the card.' },
      { key: 'graph', label: 'Show graph', type: 'bool' },
      { key: 'hours', label: 'Graph hours', type: 'number' },
      { key: 'graph_color', label: 'Graph colour', type: 'color' },
    ],
  };
</script>

<script>
  import Icon from '../components/Icon.svelte';
  import Chart from '../components/Chart.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { name, entityIcon, formatNumber, stateText } from '../lib/entity.js';
  import { useHistory } from '../lib/history.svelte.js';
  let { props } = $props();
  const show = (k) => !props.hide?.[k];
  const e = $derived(ent(props.entity));
  const raw = $derived(props.value ? t(props.value) : e?.state);
  const numeric = $derived(raw !== '' && raw != null && !Number.isNaN(Number(raw)));
  const unit = $derived(props.unit != null && props.unit !== '' ? t(props.unit) : e?.attributes.unit_of_measurement || '');
  const display = $derived(numeric ? formatNumber(raw, props.digits === '' || props.digits == null ? undefined : Number(props.digits)) : props.value ? raw : stateText(e));
  const hist = useHistory(() => (props.graph && e ? [e.entity_id] : []), () => Number(props.hours) || 24);
  const pts = $derived(e ? hist.series[e.entity_id] || [] : []);
  // The value shrinks to fit the card (so a long state like "Detected" isn't cut
  // off), unless a size is set.
  const vs = $derived(Number(props.value_size) || 0);
  const chars = $derived(Math.max(2, String(display ?? '').length + (numeric && unit && show('unit') ? String(unit).length * 0.5 + 0.3 : 0)));
</script>

<div class="sensor" style="--n:{chars}">
  {#if show('icon') || show('name')}
    <div class="head">
      {#if show('icon')}<Icon icon={t(props.icon) || entityIcon(e)} size="1.2em" />{/if}
      {#if show('name')}<span class="name">{t(props.name) || name(e)}</span>{/if}
    </div>
  {/if}
  {#if show('state')}
    <div class="val" class:fixed={vs} style={vs ? `font-size:${vs}%` : ''}><span class="num">{display}</span>{#if numeric && unit && show('unit')}<span class="unit">{unit}</span>{/if}</div>
  {/if}
  {#if props.graph && pts.length > 1}
    <div class="graph"><Chart series={[{ points: pts, color: t(props.graph_color) || 'var(--accent)' }]} hours={Number(props.hours) || 24} /></div>
  {/if}
</div>

<style>
  .sensor { height: 100%; display: flex; flex-direction: column; position: relative; container-type: size; }
  .head { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: .9em; z-index: 1; }
  .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .val { margin-top: 6px; z-index: 1; display: flex; align-items: baseline; gap: 4px; min-width: 0; }
  .num { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 2.2em; font-size: min(2.2em, calc(100cqw / (var(--n) * .62)), 42cqh); font-weight: 600; letter-spacing: -.02em; line-height: 1.05; }
  .fixed .num { font-size: 2.2em; }
  .unit { color: var(--muted); font-size: 1em; flex: none; }
  .graph { position: absolute; left: calc(var(--pad) * -1); right: calc(var(--pad) * -1); bottom: calc(var(--pad) * -1); height: 45%; pointer-events: none; opacity: .9; }
</style>
