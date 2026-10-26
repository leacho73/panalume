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
      { key: 'badge', label: 'Corner badge (optional, another entity, e.g. a battery)', type: 'entity', hint: 'Shown in the top-right corner: a ring for percentages, otherwise its value.' },
      { key: 'badge_style', label: 'Badge style', type: 'select', options: [{ value: '', label: 'Automatic' }, { value: 'ring', label: 'Ring' }, { value: 'value', label: 'Just the value' }] },
    ],
  };
</script>

<script>
  import Icon from '../components/Icon.svelte';
  import { t, ent, truthy } from '../lib/tpl.js';
  import { name, stateText, entityIcon, isActive, lightColor, formatNumber } from '../lib/entity.js';
  let { props } = $props();
  const e = $derived(ent(props.entity));
  const v = $derived({ entity_id: props.entity });
  const on = $derived(props.active ? truthy(t(props.active, v)) : isActive(e));
  const iconColor = $derived(String(t(props.icon_color, v) || '').trim());
  const color = $derived(iconColor || t(props.active_color, v) || lightColor(e) || 'var(--on)');

  // Corner badge: another entity's value, as a small ring when it's a percentage (e.g. a battery).
  const be = $derived(props.badge ? ent(props.badge) : null);
  const bLive = $derived(!!be && !['unavailable', 'unknown'].includes(be.state));
  const bNum = $derived(bLive ? Number(be.state) : NaN);
  const bPct = $derived(be?.attributes.unit_of_measurement === '%' && Number.isFinite(bNum));
  const bRing = $derived(props.badge_style === 'ring' ? Number.isFinite(bNum) : props.badge_style === 'value' ? false : bPct);
  const bBattery = $derived(be?.attributes.device_class === 'battery' || /battery/.test(props.badge || ''));
  const bColor = $derived(bBattery ? (bNum <= 15 ? '#ff6b6b' : bNum <= 30 ? '#ffb547' : '#5bd88f') : 'var(--accent)');
  const R = 15, C = 2 * Math.PI * R;
</script>

<div class="btn {props.layout}" class:wrap={props.wrap} class:on class:tinted={!!iconColor} class:badged={!!be} style="--ac:{color}">
  {#if be}
    <div class="badge" class:ring={bRing} style="--bc:{bColor}" title={name(be)}>
      {#if bRing}
        <svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r={R} class="tr" /><circle cx="18" cy="18" r={R} class="fl" stroke-dasharray={C} stroke-dashoffset={C * (1 - Math.max(0, Math.min(100, bNum)) / 100)} /></svg>
        <span>{formatNumber(bNum, 0)}<small>%</small></span>
      {:else}<span class="val">{bLive ? stateText(be) : '—'}</span>{/if}
    </div>
  {/if}
  <div class="ic"><Icon icon={String(t(props.icon, v) || '').trim() || entityIcon(e)} size={props.layout === 'icon' ? '2.4em' : '1.6em'} /></div>
  {#if props.layout !== 'icon'}
    <div class="txt">
      <div class="name">{String(t(props.name, v) || '').trim() || name(e)}</div>
      {#if props.show_state !== false}<div class="state">{String(t(props.state, v) || '').trim() || stateText(e)}</div>{/if}
    </div>
  {/if}
</div>

<style>
  .btn { position: relative; height: 100%; display: flex; flex-direction: column; justify-content: space-between; gap: 8px; min-width: 0; }
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
  .badge { position: absolute; top: 0; right: 0; display: grid; place-items: center; color: var(--muted); font-size: .72em; font-variant-numeric: tabular-nums; pointer-events: none; }
  .badge.ring { width: 2.9em; height: 2.9em; }
  .badge svg { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
  .badge .tr { fill: none; stroke: rgba(255,255,255,.1); stroke-width: 3; }
  .badge .fl { fill: none; stroke: var(--bc); stroke-width: 3; stroke-linecap: round; transition: stroke-dashoffset .6s; }
  .badge.ring span { position: relative; font-weight: 600; color: var(--text); font-size: .95em; }
  .badge small { font-size: .7em; opacity: .7; }
  .badge .val { padding: 2px 7px; border-radius: 99px; background: rgba(255,255,255,.08); max-width: 7em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badged.horizontal .txt { padding-right: 3.2em; }
</style>
