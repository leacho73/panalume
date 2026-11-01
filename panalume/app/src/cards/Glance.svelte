<script module>
  export const meta = {
    type: 'glance', name: 'Glance', icon: 'mdi:eye', category: 'Info',
    size: { w: 420, h: 110 }, tap: 'none',
    defaults: { entities: [], show_name: true, show_state: true },
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'entities', label: 'Entities', type: 'entities' },
      { key: 'show_name', label: 'Show names', type: 'bool' },
      { key: 'show_state', label: 'Show states', type: 'bool' },
      { key: 'tap', label: 'Tap', type: 'select', options: ['more-info', 'toggle'] },
    ],
  };
</script>

<script>
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/tpl.js';
  import { states } from '../lib/ha.svelte.js';
  import { name, stateText, entityIcon, isActive, toggle, lightColor } from '../lib/entity.js';
  import { app } from '../lib/config.svelte.js';
  let { props } = $props();
</script>

<div class="gl">
  {#if props.title}<div class="title">{t(props.title)}</div>{/if}
  <div class="items">
    {#if !(props.entities || []).length}
      <div class="hint">Pick what to glance at in the card's settings.</div>
    {/if}
    {#each props.entities || [] as id}
      {@const e = states.get(id)}
      <button class="it" data-stop onclick={() => (props.tap === 'toggle' && e ? toggle(e) : (app.popup = { entity: id }))}>
        <span class="ic" class:on={isActive(e)} style={lightColor(e) ? `color:${lightColor(e)}` : ''}><Icon icon={entityIcon(e)} size="1.6em" /></span>
        {#if props.show_name}<span class="n">{name(e, null) || id}</span>{/if}
        {#if props.show_state}<span class="s">{stateText(e)}</span>{/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .hint { color: var(--muted); font-size: .82em; }
  .gl { height: 100%; display: flex; flex-direction: column; }
  .title { font-weight: 600; margin-bottom: 4px; }
  .items { flex: 1; display: flex; justify-content: space-around; align-items: center; gap: 4px; min-height: 0; }
  .it { display: flex; flex-direction: column; align-items: center; gap: 4px; background: none; border: 0; color: inherit; font: inherit; min-width: 0; flex: 1; padding: 4px; border-radius: 12px; }
  .it:active { background: rgba(255,255,255,.06); }
  .ic { color: var(--muted); display: grid; }
  .ic.on { color: var(--on); }
  .n { font-size: .8em; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .s { font-size: .8em; color: var(--muted); white-space: nowrap; }
</style>
