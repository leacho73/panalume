<script module>
  import { areaRegistry } from '../lib/area-registry.svelte.js';
  import { states } from '../lib/ha.svelte.js';
  import { areaStatusWatch, defaultIndicators } from '../lib/area-status.js';
  export const meta = {
    type: 'area-status', name: 'Area Status', icon: 'mdi:home-analytics', category: 'Info',
    size: { w: 760, h: 80 }, tap: 'none',
    defaults: { title: '', area: '', show_labels: false, hide_empty: true, indicators: defaultIndicators() },
    fields: [
      { key: 'title', label: 'Area name (blank = selected area)', type: 'text' },
      { key: 'indicators', label: 'Area and indicators', type: 'area-status' },
      { key: 'show_labels', label: 'Show indicator labels', type: 'bool' },
      { key: 'hide_empty', label: 'Hide indicators with no matching entities', type: 'bool' },
    ],
    watch: (props) => areaStatusWatch(props, areaRegistry, states),
  };
</script>

<script>
  import Icon from '../components/Icon.svelte';
  import { useAreaRegistry } from '../lib/area-registry.svelte.js';
  import { INDICATOR_TYPES, indicatorEntities, indicatorSummary } from '../lib/area-status.js';
  import { entityIcon, name, stateText } from '../lib/entity.js';
  import { t } from '../lib/tpl.js';
  import { app } from '../lib/config.svelte.js';
  let { props } = $props();
  useAreaRegistry();
  let dialog = $state(), details = $state(null);
  const title = $derived(t(props.title) || areaRegistry.areas.find((a) => a.area_id === props.area)?.name || 'Area Status');
  const indicators = $derived.by(() => (props.indicators || []).filter((item) => item.enabled !== false).map((item) => {
    const ids = indicatorEntities(props, item, areaRegistry, states);
    return { item, ids, summary: indicatorSummary(item.kind, ids, states) };
  }).filter((row) => row.ids.length || (!props.hide_empty && !row.item.entities?.length)));
  const detailIds = $derived(details ? indicatorEntities(props, details, areaRegistry, states) : []);
  function show(item) { details = item; dialog.showModal(); }
</script>

<div class="area-status">
  <div class="area-title">{title}</div>
  <div class="indicators">
    {#each indicators as { item, ids, summary } (item.id)}
      {@const label = t(item.label) || (item.kind === 'entity' && summary.entity ? name(summary.entity) : '') || INDICATOR_TYPES[item.kind]?.label || 'Sensor'}
      <button class:active={summary.active} class:alarm={item.kind === 'smoke' && summary.active} class:missing={summary.missing > 0} disabled={!ids.length} data-stop title={`${label}: ${summary.entity ? stateText(summary.entity) : summary.text}`} aria-label={`${label}: ${summary.entity ? stateText(summary.entity) : summary.text}`} onclick={() => show(item)}>
        <Icon icon={item.icon || (item.kind === 'entity' && summary.entity ? entityIcon(summary.entity) : INDICATOR_TYPES[item.kind]?.icon) || 'mdi:gauge'} size="1.25em" />
        {#if props.show_labels}<span class="label">{label}</span>{/if}
        <span class="value">{summary.entity ? stateText(summary.entity) : summary.text}</span>
      </button>
    {/each}
    {#if !indicators.length}<span class="hint">{areaRegistry.loading ? 'Reading area sensors…' : 'Choose an area or select indicators in the card settings.'}</span>{/if}
  </div>
</div>

<dialog bind:this={dialog} data-stop onclick={(e) => { if (e.target === dialog) dialog.close(); }} onclose={() => details = null}>
  <header><strong>{title} · {details?.label || INDICATOR_TYPES[details?.kind]?.label || 'Sensors'}</strong><button aria-label="Close status details" onclick={() => dialog.close()}>Close</button></header>
  <div class="details">
    {#each detailIds as id (id)}
      {@const entity = states.get(id)}
      <button onclick={() => { dialog.close(); app.popup = { entity: id }; }}><Icon icon={entityIcon(entity)} size="1.2em" /><span>{name(entity) || id}</span><strong>{stateText(entity)}</strong></button>
    {/each}
  </div>
</dialog>

<style>
  .area-status { height: 100%; display: flex; flex-direction: row; align-items: center; gap: 18px; min-width: 0; container-type: inline-size; }
  .area-title { font-weight: 600; font-size: 1.2em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 0 1 auto; max-width: 40%; }
  .indicators { display: flex; flex: 1; align-items: center; gap: 18px; overflow: auto; min-width: 0; min-height: 0; padding: 2px; scrollbar-width: thin; }
  button { font: inherit; color: inherit; background: none; border: 0; border-radius: 8px; cursor: pointer; }
  .indicators button { display: flex; align-items: center; gap: 7px; padding: 6px 3px; white-space: nowrap; min-height: 36px; flex: none; }
  .indicators button :global(svg) { color: var(--muted); }
  .indicators button.active :global(svg) { color: var(--on); }
  .indicators button.alarm :global(svg), .indicators button.alarm .value { color: #ff6b6b; }
  .indicators button.missing .value { color: var(--muted); }
  .label, .hint { color: var(--muted); font-size: .85em; }
  .value { font-size: .95em; }
  button:hover { background: rgba(255,255,255,.06); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  button:disabled { cursor: default; opacity: .6; }
  dialog { color: var(--text); background: rgb(22,26,38); border: 1px solid rgba(122,162,255,.3); border-radius: 16px; padding: 16px; width: min(480px, calc(100vw - 48px)); max-height: 80dvh; box-shadow: 0 16px 60px #0008; }
  dialog::backdrop { background: #0009; }
  header { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
  header strong { flex: 1; }
  header button { padding: 10px; background: #ffffff10; }
  .details { display: flex; flex-direction: column; overflow: auto; max-height: 60dvh; }
  .details button { display: flex; align-items: center; gap: 12px; padding: 12px 8px; text-align: left; }
  .details span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .details strong { font-weight: 500; }
</style>
