<script module>
  export const meta = {
    type: 'entities', name: 'Entities list', icon: 'mdi:format-list-bulleted', category: 'Controls',
    size: { w: 320, h: 260 }, tap: 'none',
    defaults: { title: '', entities: [] },
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'entities', label: 'Entities', type: 'entities' },
    ],
  };
</script>

<script>
  import Icon from '../components/Icon.svelte';
  import Toggle from '../components/Toggle.svelte';
  import { t } from '../lib/tpl.js';
  import { states } from '../lib/ha.svelte.js';
  import { name, stateText, entityIcon, isActive, canToggle, toggle, domain, lightColor } from '../lib/entity.js';
  import { app } from '../lib/config.svelte.js';
  let { props } = $props();
  const ACTION = new Set(['scene', 'script', 'button', 'input_button']);
</script>

<div class="ents">
  {#if props.title}<div class="title">{t(props.title)}</div>{/if}
  <div class="rows">
    {#if !(props.entities || []).length}
      <div class="hint">Pick the entities to list in the card's settings.</div>
    {/if}
    {#each props.entities || [] as id}
      {@const e = states.get(id)}
      <div class="row" role="button" tabindex="0" data-stop onclick={() => (app.popup = { entity: id })} onkeydown={() => {}}>
        <span class="ic" class:on={isActive(e)} style={lightColor(e) ? `color:${lightColor(e)}` : ''}><Icon icon={entityIcon(e)} size="1.3em" /></span>
        <span class="n">{name(e, null) || id}</span>
        {#if e && canToggle(id) && !['media_player', 'climate', 'cover', 'water_heater', 'vacuum'].includes(domain(id))}
          <Toggle on={isActive(e)} onclick={(ev) => { ev.stopPropagation(); toggle(e); }} />
        {:else if e && ACTION.has(domain(id))}
          <button class="run" data-stop onclick={(ev) => { ev.stopPropagation(); toggle(e); }}>Run</button>
        {:else}
          <span class="s">{stateText(e)}</span>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .hint { color: var(--muted); font-size: .82em; padding: 2px 2px 6px; }
  .ents { height: 100%; display: flex; flex-direction: column; }
  .title { font-weight: 600; font-size: 1.1em; margin-bottom: 6px; }
  .rows { overflow: auto; flex: 1; margin: 0 -6px; }
  .row { display: flex; align-items: center; gap: 12px; padding: 7px 6px; border-radius: 12px; cursor: pointer; min-height: 44px; }
  .row:active { background: rgba(255,255,255,.06); }
  .ic { color: var(--muted); display: grid; }
  .ic.on { color: var(--on); }
  .n { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .s { color: var(--muted); white-space: nowrap; }
  .run { background: rgba(255,255,255,.1); color: var(--accent); border: 0; border-radius: 10px; padding: 6px 12px; font: inherit; font-weight: 600; }
</style>
