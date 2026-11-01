<script module>
  export const meta = {
    type: 'select', name: 'Option picker', icon: 'mdi:form-dropdown', category: 'Controls',
    size: { w: 300, h: 110 }, tap: 'none',
    defaults: { entity: '', style: 'buttons' },
    fields: [
      { key: 'entity', label: 'Select / input_select', type: 'entity', domain: ['select', 'input_select'] },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'style', label: 'Style', type: 'select', options: ['buttons', 'dropdown'] },
    ],
  };
</script>

<script>
  import { t, ent } from '../lib/tpl.js';
  import { name, domain } from '../lib/entity.js';
  import { callService } from '../lib/ha.svelte.js';
  let { props } = $props();
  const e = $derived(ent(props.entity));
  const set = (o) => callService(domain(e.entity_id), 'select_option', { option: o }, { entity_id: e.entity_id });
</script>

<div class="sel">
  {#if !e}
    <div class="hint">Pick an input in the card's settings.</div>
  {:else}
  <div class="n">{t(props.name) || name(e)}</div>
  {#if props.style === 'dropdown'}
    <select data-stop value={e?.state} onchange={(ev) => set(ev.currentTarget.value)}>
      {#each e?.attributes.options || [] as o}<option value={o}>{o}</option>{/each}
    </select>
  {:else}
    <div class="opts" data-stop>
      {#each e?.attributes.options || [] as o}<button class:on={o === e.state} onclick={() => set(o)}>{o}</button>{/each}
    </div>
  {/if}
  {/if}
</div>

<style>
  .hint { color: var(--muted); font-size: .82em; }
  .sel { height: 100%; display: flex; flex-direction: column; gap: 8px; }
  .n { font-weight: 600; }
  .opts { display: flex; flex-wrap: wrap; gap: 6px; overflow: auto; }
  button { border: 0; border-radius: 12px; padding: 8px 12px; background: rgba(255,255,255,.07); color: var(--muted); font: inherit; font-size: .9em; }
  button.on { background: color-mix(in srgb, var(--accent) 30%, transparent); color: var(--text); }
  select { background: rgba(255,255,255,.08); color: inherit; border: 0; border-radius: 12px; padding: 10px; font: inherit; }
</style>
