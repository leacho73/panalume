<script module>
  export const meta = {
    type: 'button', name: 'Button / Tile', icon: 'mdi:gesture-tap-button', category: 'Controls',
    size: { w: 180, h: 120 }, tap: 'toggle', hold: 'more-info',
    defaults: { entity: '', layout: 'vertical', show_state: true },
    fields: [
      { key: 'entity', label: 'Entity', type: 'entity' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'icon', label: 'Icon', type: 'icon' },
      { key: 'state', label: 'State text (override)', type: 'text' },
      { key: 'show_state', label: 'Show state', type: 'bool' },
      { key: 'wrap', label: 'Wrap long names onto two lines', type: 'bool' },
      { key: 'layout', label: 'Layout', type: 'select', options: ['vertical', 'horizontal', 'icon'] },
      { key: 'active', label: 'Active (template, overrides)', type: 'text' },
      { key: 'active_color', label: 'Active colour', type: 'color' },
      { key: 'icon_color', label: 'Icon colour (always, template ok)', type: 'color' },
    ],
  };
</script>

<script>
  import Icon from '../components/Icon.svelte';
  import { t, ent, truthy } from '../lib/tpl.js';
  import { name, stateText, entityIcon, isActive, lightColor } from '../lib/entity.js';
  let { props } = $props();
  const e = $derived(ent(props.entity));
  const v = $derived({ entity_id: props.entity });
  const on = $derived(props.active ? truthy(t(props.active, v)) : isActive(e));
  const iconColor = $derived(String(t(props.icon_color, v) || '').trim());
  const color = $derived(iconColor || t(props.active_color, v) || lightColor(e) || 'var(--on)');
</script>

<div class="btn {props.layout}" class:wrap={props.wrap} class:on class:tinted={!!iconColor} style="--ac:{color}">
  <div class="ic"><Icon icon={String(t(props.icon, v) || '').trim() || entityIcon(e)} size={props.layout === 'icon' ? '2.4em' : '1.6em'} /></div>
  {#if props.layout !== 'icon'}
    <div class="txt">
      <div class="name">{String(t(props.name, v) || '').trim() || name(e)}</div>
      {#if props.show_state !== false}<div class="state">{String(t(props.state, v) || '').trim() || stateText(e)}</div>{/if}
    </div>
  {/if}
</div>

<style>
  .btn { height: 100%; display: flex; flex-direction: column; justify-content: space-between; gap: 8px; min-width: 0; }
  .btn.horizontal { flex-direction: row; align-items: center; justify-content: flex-start; gap: 14px; }
  .btn.icon { align-items: center; justify-content: center; }
  .ic { width: 2.6em; height: 2.6em; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.08); color: var(--muted); transition: all .25s; flex: none; }
  .icon .ic { width: auto; height: auto; background: none; }
  .tinted .ic { color: var(--ac); }
  .on .ic { background: color-mix(in srgb, var(--ac) 22%, transparent); color: var(--ac); }
  .icon.on .ic { background: none; }
  .txt { min-width: 0; }
  .name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .wrap .name { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.2; overflow-wrap: anywhere; }
  .state { color: var(--muted); font-size: .88em; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
