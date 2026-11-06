<script module>
  export const meta = {
    type: 'graph', name: 'History graph', icon: 'mdi:chart-line', category: 'Info',
    size: { w: 420, h: 220 }, tap: 'none',
    defaults: { entities: [], hours: 24, fill: true },
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'entities', label: 'Entities', type: 'entities' },
      { key: 'colors', label: 'Colours (comma separated)', type: 'text' },
      { key: 'curves', label: 'Line styles (comma separated: smooth, straight or step)', type: 'text', placeholder: 'smooth, step', hint: 'One per entity, in the same order. Step suits things that switch, like heating on / off or a set temperature. Blank = smooth.' },
      { key: 'hours', label: 'Hours', type: 'number' },
      { key: 'min', label: 'Y min', type: 'text' },
      { key: 'max', label: 'Y max', type: 'text' },
      { key: 'fill', label: 'Fill', type: 'bool' },
    ],
  };
  export const PALETTE = ['#7aa2ff', '#ffc861', '#5bd88f', '#ff7a90', '#b48cff', '#4fd1d9'];
</script>

<script>
  import Chart from '../components/Chart.svelte';
  import { t } from '../lib/tpl.js';
  import { states } from '../lib/ha.svelte.js';
  import { name, stateText } from '../lib/entity.js';
  import { useHistory } from '../lib/history.svelte.js';
  let { props } = $props();
  const ids = $derived(props.entities || []);
  const hist = useHistory(() => ids, () => Number(props.hours) || 24);
  const colors = $derived((props.colors || '').split(',').map((s) => s.trim()).filter(Boolean));
  const color = (i) => colors[i] || PALETTE[i % PALETTE.length];
  // Line style per entity: smooth (default), straight (also "linear") or step.
  const curves = $derived((props.curves || '').split(',').map((s) => s.trim().toLowerCase()));
  const curve = (i) => ({ step: 'step', steps: 'step', straight: 'straight', linear: 'straight', line: 'straight' })[curves[i]] || 'smooth';
  const series = $derived(ids.map((id, i) => ({ points: hist.series[id] || [], color: color(i), curve: curve(i) })));
</script>

<div class="g">
  {#if props.title}<div class="title">{t(props.title)}</div>{/if}
  <div class="legend">
    {#each ids as id, i}<span><i style="background:{color(i)}"></i>{name(states.get(id), null) || id} <b>{stateText(states.get(id))}</b></span>{/each}
  </div>
  <div class="chart"><Chart {series} hours={Number(props.hours) || 24} fill={props.fill} showAxis min={t(props.min)} max={t(props.max)} /></div>
</div>

<style>
  .g { height: 100%; display: flex; flex-direction: column; gap: 6px; }
  .title { font-weight: 600; }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: .8em; color: var(--muted); }
  .legend span { display: flex; align-items: center; gap: 5px; }
  .legend i { width: 8px; height: 8px; border-radius: 50%; }
  .legend b { color: var(--text); font-weight: 600; }
  .chart { flex: 1; min-height: 0; }
</style>
