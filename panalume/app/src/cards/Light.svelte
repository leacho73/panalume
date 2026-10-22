<script module>
  export const meta = {
    type: 'light', name: 'Light', icon: 'mdi:lightbulb', category: 'Controls',
    size: { w: 300, h: 170 }, tap: 'toggle', hold: 'more-info',
    defaults: { entity: '' },
    sections: [
      { key: 'brightness', label: 'Brightness slider' }, { key: 'temp', label: 'Warm / cool' }, { key: 'colours', label: 'Colours' },
      { key: 'state', label: 'State text' }, { key: 'members', label: 'Group count' }, { key: 'glow', label: 'Glow' },
    ],
    fields: [
      { key: 'entity', label: 'Light', type: 'entity', domain: 'light' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'icon', label: 'Icon', type: 'icon' },
      { key: 'colours', label: 'Colour buttons (pick up to 6, or type colours)', type: 'swatches', section: 'colours', placeholder: '#ff4d4d, #ffc861, #5bd88f, #4fb4ff, #b48cff' },
    ],
  };
</script>

<script>
  // Light: the card glows in the light's own colour; brightness slider, quick
  // warm/cool and colour buttons. Tap toggles, hold for full controls.
  import Icon from '../components/Icon.svelte';
  import Slider from '../components/Slider.svelte';
  import { canMix } from '../lib/compat.js';
  import { t, ent } from '../lib/tpl.js';
  import { stateWord } from '../lib/i18n.svelte.js';
  import { name, entityIcon, lightColor, toggle } from '../lib/entity.js';
  import { callService, states } from '../lib/ha.svelte.js';
  let { props, h = 170 } = $props();
  const show = (k) => !props.hide?.[k];
  const e = $derived(ent(props.entity));
  const a = $derived(e?.attributes || {});
  const on = $derived(e?.state === 'on');
  const pct = $derived(on ? Math.max(1, Math.round(((a.brightness ?? 255) / 255) * 100)) : 0);
  const modes = $derived(a.supported_color_modes || []);
  const dimmable = $derived(modes.some((m) => m !== 'onoff'));
  const hasTemp = $derived(modes.includes('color_temp'));
  const hasColor = $derived(modes.some((m) => ['hs', 'rgb', 'rgbw', 'rgbww', 'xy'].includes(m)));
  const color = $derived(lightColor(e) || '#ffc861');
  const svc = (data) => callService('light', 'turn_on', data, { entity_id: e.entity_id });
  // Light groups: how many members are on.
  const members = $derived(Array.isArray(a.entity_id) ? a.entity_id : null);
  const membersOn = $derived(members ? members.filter((m) => states.get(m)?.state === 'on').length : 0);
  const swatches = $derived(String(t(props.colours) || '#ff4d4d, #ffc861, #5bd88f, #4fb4ff, #b48cff').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6));
  function hexRgb(c) {
    const m = c.match(/^#([0-9a-f]{6})$/i);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const compact = $derived(h < 150);
</script>

<div class="light" class:on class:compact style="--lc:{color}">
  {#if show('glow')}<div class="glow" style="opacity:{on ? 0.25 + (pct / 100) * 0.75 : 0}"></div>{/if}
  <div class="top">
    <button class="ic" data-stop onclick={() => e && toggle(e)} aria-label="Toggle">
      <Icon icon={t(props.icon) || entityIcon(e)} size="1.5em" />
    </button>
    <div class="txt">
      <div class="name">{t(props.name) || name(e)}</div>
      {#if show('state')}
        <div class="state">
          {on ? (dimmable ? `${pct}%` : stateWord('light', null, 'on') || 'On') : e?.state === 'off' ? stateWord('light', null, 'off') || 'Off' : e?.state || '—'}
          {#if show('members') && members}<span class="mem">{' · '}{membersOn}/{members.length} on</span>{/if}
        </div>
      {/if}
    </div>
  </div>

  {#if dimmable && show('brightness')}
    <div class="bri">
      <Slider value={pct} min={1} max={100} color={canMix ? 'linear-gradient(90deg, color-mix(in srgb, var(--lc) 45%, transparent), var(--lc))' : 'var(--lc)'} height={compact ? 34 : 42}
        label={on ? '' : 'Off'} unit="%" onchange={(v) => svc({ brightness_pct: v })} />
    </div>
  {/if}

  {#if !compact && ((hasTemp && show('temp')) || (hasColor && show('colours')))}
    <div class="quick" data-stop>
      {#if hasTemp && show('temp')}
        <button class="ct warm" title="Warm" onclick={() => svc({ color_temp_kelvin: a.min_color_temp_kelvin || 2700 })}></button>
        <button class="ct neutral" title="Neutral" onclick={() => svc({ color_temp_kelvin: 4000 })}></button>
        <button class="ct cool" title="Cool" onclick={() => svc({ color_temp_kelvin: a.max_color_temp_kelvin || 6500 })}></button>
      {/if}
      {#if hasColor && show('colours')}
        {#if hasTemp && show('temp')}<span class="sep"></span>{/if}
        {#each swatches as c}
          {@const rgb = hexRgb(c)}
          <button class="sw" style="background:{c}" title={c} onclick={() => rgb && svc({ rgb_color: rgb })}></button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .light { position: relative; height: 100%; display: flex; flex-direction: column; justify-content: space-between; gap: 10px; isolation: isolate; }
  .glow { position: absolute; inset: calc(var(--pad) * -1); z-index: -1; pointer-events: none; transition: opacity .5s, background .5s;
    background: radial-gradient(90% 120% at 12% 10%, color-mix(in srgb, var(--lc) 45%, transparent), transparent 65%); }
  .top { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .ic { width: 2.8em; height: 2.8em; border-radius: 50%; display: grid; place-items: center; border: 0; flex: none; background: rgba(255,255,255,.08); color: var(--muted); transition: all .3s; }
  .on .ic { background: var(--lc); color: rgba(0,0,0,.75); box-shadow: 0 0 18px color-mix(in srgb, var(--lc) 70%, transparent); }
  .txt { flex: 1; min-width: 0; }
  .name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .state { color: var(--muted); font-size: .85em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mem { color: var(--muted); }
  .quick { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .quick button { flex: 1 1 0; min-width: 0; max-width: 1.9em; aspect-ratio: 1; border-radius: 50%; border: 2px solid rgba(255,255,255,.15); padding: 0; transition: transform .15s; }
  .quick button:active { transform: scale(.88); }
  .warm { background: #ffb46b; } .neutral { background: #fff1dc; } .cool { background: #cfe3ff; }
  .sep { flex: none; width: 1px; height: 1.4em; background: rgba(255,255,255,.12); margin: 0 2px; }
</style>
