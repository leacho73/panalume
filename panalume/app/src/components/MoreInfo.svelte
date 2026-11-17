<script>
  // Default pop-up content for an entity: domain controls + history + attributes.
  import Icon from './Icon.svelte';
  import Slider from './Slider.svelte';
  import Toggle from './Toggle.svelte';
  import Chart from './Chart.svelte';
  import Media from '../cards/Media.svelte';
  import Climate from '../cards/Climate.svelte';
  import Cover from '../cards/Cover.svelte';
  import Camera from '../cards/Camera.svelte';
  import Weather from '../cards/Weather.svelte';
  import Alarm from '../cards/Alarm.svelte';
  import Select from '../cards/Select.svelte';
  import Number from '../cards/Number.svelte';
  import { states, callService } from '../lib/ha.svelte.js';
  import { name, stateText, entityIcon, domain, canToggle, isActive, toggle, lightColor, relTime } from '../lib/entity.js';
  import { useHistory } from '../lib/history.svelte.js';
  let { entity } = $props();
  const e = $derived(states.get(entity));
  // Blinds whose slats tilt get a taller cover box, to fit the tilt row.
  const tilts = $derived(!!((+e?.attributes.supported_features || 0) & 176) || e?.attributes.current_tilt_position != null);
  let vw = $state(innerWidth);
  const bigClimate = $derived(vw >= 700);
  const d = $derived(domain(entity));
  const a = $derived(e?.attributes || {});
  const numeric = $derived(e && e.state !== '' && !isNaN(+e.state));
  const hist = useHistory(() => (numeric ? [entity] : []), () => 24);
  const lightSvc = (data) => callService('light', 'turn_on', data, { entity_id: entity });
  const HIDE = new Set(['friendly_name', 'icon', 'entity_picture', 'supported_features', 'supported_color_modes', 'access_token', 'entity_picture_local', 'attribution', 'source_list', 'sound_mode_list', 'group_members', 'hvac_modes', 'options', 'operation_list', 'fan_modes', 'preset_modes', 'swing_modes', 'effect_list']);
  const attrs = $derived(Object.entries(a).filter(([k, v]) => !HIDE.has(k) && v != null && typeof v !== 'object'));
  const SWATCH = [[0, 0], [30, 90], [50, 80], [120, 70], [180, 70], [220, 80], [270, 70], [320, 70]];
</script>

<svelte:window bind:innerWidth={vw} />

<div class="mi">
  <div class="hd">
    <span class="ic" style={lightColor(e) ? `color:${lightColor(e)}` : isActive(e) ? 'color:var(--on)' : ''}><Icon icon={entityIcon(e)} size="1.8em" /></span>
    <div class="t"><div class="n">{name(e) || entity}</div><div class="s">{stateText(e)} · {e ? relTime(e.last_changed) : ''}</div></div>
    {#if e && canToggle(entity) && !['media_player', 'climate', 'water_heater', 'cover'].includes(d)}<Toggle on={isActive(e)} onclick={() => toggle(e)} />{/if}
  </div>

  {#if d === 'light' && e}
    <div class="light">
      {#if a.supported_color_modes?.some((m) => m !== 'onoff')}
        <div class="bri"><Slider vertical height={110} value={e.state === 'on' ? Math.round(((a.brightness ?? 255) / 255) * 100) : 0} min={0} max={100} color={lightColor(e) || 'var(--on)'} onchange={(v) => (v ? lightSvc({ brightness_pct: v }) : callService('light', 'turn_off', {}, { entity_id: entity }))} /></div>
      {/if}
      <div class="lopts">
        {#if a.supported_color_modes?.includes('color_temp')}
          <div class="lbl">Colour temperature</div>
          <div class="ct"><Slider value={a.color_temp_kelvin ?? a.min_color_temp_kelvin} min={a.min_color_temp_kelvin || 2000} max={a.max_color_temp_kelvin || 6500} step={50} color="linear-gradient(90deg,#ffa756,#fff,#9cc8ff)" onchange={(v) => lightSvc({ color_temp_kelvin: v })} /></div>
        {/if}
        {#if a.supported_color_modes?.some((m) => ['hs', 'rgb', 'rgbw', 'rgbww', 'xy'].includes(m))}
          <div class="lbl">Colour</div>
          <div class="sw">
            {#each SWATCH as [hh, ss]}<button style="background:hsl({hh} {ss}% {ss ? 60 : 100}%)" aria-label="colour" onclick={() => lightSvc({ hs_color: [hh, ss] })}></button>{/each}
          </div>
        {/if}
      </div>
    </div>
  {:else if d === 'media_player'}
    <div class="box" style="height:240px"><Media props={{ entity, artwork: 'cover', show_volume: true, show_source: true, show_group: true }} h={240} /></div>
  {:else if d === 'climate' || d === 'water_heater'}
    <!-- On a tablet-sized screen the thermostat is shown bigger, buttons and all. -->
    <div class="box" style="height:{bigClimate ? 330 : 220}px"><div style="zoom:{bigClimate ? 1.5 : 1};height:220px"><Climate props={{ entity, show_modes: true }} w={300} h={220} /></div></div>
  {:else if d === 'cover'}
    <div class="box" style="height:{tilts ? 180 : 120}px"><Cover props={{ entity }} w={360} h={tilts ? 180 : 120} /></div>
  {:else if d === 'camera' || d === 'image'}
    <div class="box cam" style="height:300px"><Camera props={{ entity, mode: 'live', fit: 'contain' }} /></div>
  {:else if d === 'weather'}
    <div class="box" style="height:210px"><Weather props={{ entity, forecast: 'daily', days: 7 }} /></div>
  {:else if d === 'alarm_control_panel'}
    <div class="box" style="height:380px"><Alarm props={{ entity, keypad: true }} /></div>
  {:else if d === 'select' || d === 'input_select'}
    <div class="box"><Select props={{ entity, style: 'buttons' }} /></div>
  {:else if ['number', 'input_number', 'fan'].includes(d)}
    <div class="box" style="height:100px"><Number props={{ entity }} /></div>
  {/if}

  {#if numeric && (hist.series[entity]?.length || 0) > 1}
    <div class="lbl">Last 24 hours</div>
    <div class="hist"><Chart series={[{ points: hist.series[entity], color: 'var(--accent)' }]} hours={24} showAxis /></div>
  {/if}

  {#if attrs.length}
    <details>
      <summary>Attributes</summary>
      <dl>{#each attrs as [k, v]}<dt>{k.replace(/_/g, ' ')}</dt><dd>{String(v)}</dd>{/each}</dl>
    </details>
  {/if}
</div>

<style>
  .mi { display: flex; flex-direction: column; gap: 16px; --pad: 0px; }
  .hd { display: flex; align-items: center; gap: 14px; }
  .ic { color: var(--muted); }
  .t { flex: 1; min-width: 0; }
  .n { font-size: 1.25em; font-weight: 600; }
  .s { color: var(--muted); font-size: .9em; }
  .box { position: relative; }
  .cam { border-radius: 14px; overflow: hidden; }
  .light { display: flex; gap: 20px; align-items: stretch; }
  .bri { height: 260px; display: flex; justify-content: center; padding: 0 10px; }
  .lopts { flex: 1; display: flex; flex-direction: column; gap: 10px; }
  .lbl { color: var(--muted); font-size: .85em; }
  .sw { display: flex; flex-wrap: wrap; gap: 10px; }
  .sw button { width: 40px; height: 40px; border-radius: 50%; border: 2px solid rgba(255,255,255,.2); }
  .hist { height: 140px; }
  details { color: var(--muted); font-size: .9em; }
  summary { cursor: pointer; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; margin: 10px 0 0; }
  dt { text-transform: capitalize; }
  dd { margin: 0; color: var(--text); word-break: break-word; }
</style>
