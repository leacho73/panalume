<script module>
  import { states } from '../lib/ha.svelte.js';
  // The first fan that isn't part of a hot tub (those are pumps).
  const autofill = () => ({ entity: [...states.keys()].filter((id) => id.startsWith('fan.') && !/pump|blower/.test(id)).sort()[0] || '' });
  export const meta = {
    type: 'fan', name: 'Fan', icon: 'mdi:fan', category: 'Controls',
    size: { w: 340, h: 250 }, tap: 'none', hold: 'more-info',
    defaults: { entity: '' },
    autofill,
    sections: [
      { key: 'speed', label: 'Speed' }, { key: 'presets', label: 'Modes' }, { key: 'extras', label: 'Oscillate / direction' },
      { key: 'light', label: 'Light', section: 'light' }, { key: 'sensors', label: 'Sensors', section: 'sensors' },
    ],
    fields: [
      { key: 'entity', label: 'Fan or air purifier', type: 'entity', domain: 'fan' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'icon', label: 'Icon', type: 'icon' },
      { key: 'light', label: 'Light (optional, e.g. a ceiling fan\'s light)', type: 'entity', domain: 'light', section: 'light' },
      { key: 'sensors', label: 'Sensors to show (optional, e.g. PM2.5, humidity, filter life)', type: 'entities', domain: 'sensor', section: 'sensors' },
    ],
  };
</script>

<script>
  // A fan or air purifier: a fan that spins at its speed, on / off, a speed slider,
  // its modes, oscillate and direction when it has them, plus an optional light
  // (ceiling fans) and a row of sensors (air quality, humidity, filter life).
  import Icon from '../components/Icon.svelte';
  import Slider from '../components/Slider.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { stateWord, attrWord } from '../lib/i18n.svelte.js';
  import { name, formatNumber, lightColor } from '../lib/entity.js';
  import { callService } from '../lib/ha.svelte.js';
  let { props, w = 340, h = 250 } = $props();
  const show = (k) => !props.hide?.[k];
  const e = $derived(ent(props.entity));
  const a = $derived(e?.attributes || {});
  const on = $derived(e?.state === 'on');
  // Home Assistant's fan features: speed 1, oscillate 2, direction 4, modes 8.
  const f = $derived(Number(a.supported_features) || 0);
  const hasSpeed = $derived(!!(f & 1) || a.percentage != null);
  const pct = $derived(on ? Math.round(a.percentage ?? 100) : 0);
  const step = $derived(Math.max(1, Number(a.percentage_step) || 1));
  const presets = $derived(Array.isArray(a.preset_modes) ? a.preset_modes : []);
  const canOsc = $derived(!!(f & 2) || a.oscillating != null);
  const canDir = $derived(!!(f & 4) || a.direction != null);
  const fan = (service, data = {}) => e && callService('fan', service, data, { entity_id: e.entity_id });
  const power = () => fan(on ? 'turn_off' : 'turn_on');
  const preset = (m) => attrWord('fan', 'preset_mode', m) || String(m).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  // One turn a second at full speed, slower below it.
  const spin = $derived(on ? `${(2.4 - 1.8 * (pct || 50) / 100).toFixed(2)}s` : '0s');
  const status = $derived(!e ? '' : on ? [hasSpeed && a.percentage != null ? `${pct}%` : '', a.preset_mode ? preset(a.preset_mode) : ''].filter(Boolean).join(' · ') || stateWord('fan', null, 'on') || 'On' : stateWord('fan', null, e.state) || e.state);

  const lt = $derived(ent(props.light));
  const ltOn = $derived(lt?.state === 'on');
  const ltPct = $derived(ltOn ? Math.max(1, Math.round(((lt.attributes.brightness ?? 255) / 255) * 100)) : 0);
  const ltDim = $derived((lt?.attributes.supported_color_modes || []).some((m) => m !== 'onoff'));
  const light = (service, data = {}) => lt && callService('light', service, data, { entity_id: lt.entity_id });

  const sensors = $derived((props.sensors || []).map((id) => ent(id)).filter(Boolean));
  const val = (s) => { const n = Number(s.state); return Number.isFinite(n) ? `${formatNumber(n, Math.abs(n) < 10 && !Number.isInteger(n) ? 1 : 0)}${s.attributes.unit_of_measurement ? (s.attributes.unit_of_measurement === '%' ? '' : ' ') + s.attributes.unit_of_measurement : ''}` : stateWord('sensor', s.attributes.device_class, s.state) || s.state; };
  const sname = (s) => { const full = name(s); const dev = name(e); return dev && full.startsWith(dev + ' ') ? full.slice(dev.length + 1) : full; };
  const small = $derived(h < 170);
</script>

<div class="fan" class:on class:small>
  <div class="head">
    <span class="ic" style:--spin={spin}><Icon icon={t(props.icon) || (/purif/i.test(e?.entity_id || '') ? 'mdi:air-purifier' : 'mdi:fan')} size="1.3em" /></span>
    <span class="nm">{t(props.name) || name(e) || 'Fan'}<small>{status}</small></span>
    {#if e}<button class="pw" class:on onclick={power} aria-label={on ? 'Turn off' : 'Turn on'} data-stop><Icon icon="mdi:power" size="1.1em" /></button>{/if}
  </div>

  {#if !e}
    <div class="msg">{props.entity ? 'Fan not found' : 'Pick a fan or air purifier in the card\'s settings.'}</div>
  {:else}
    {#if hasSpeed && show('speed')}
      <div data-stop><Slider value={pct} min={0} max={100} {step} unit="%" height={small ? 34 : 40} label={on ? '' : 'Off'}
        color="linear-gradient(90deg, rgba(91,216,143,.35), #5bd88f)" onchange={(v) => (v ? fan('set_percentage', { percentage: v }) : fan('turn_off'))} /></div>
    {/if}
    {#if !small && ((presets.length && show('presets')) || ((canOsc || canDir) && show('extras')))}
      <div class="row" data-stop>
        {#if presets.length && show('presets')}
          {#each presets.slice(0, 5) as m}
            <button class="chip" class:sel={on && a.preset_mode === m} onclick={() => fan('set_preset_mode', { preset_mode: m })}>{preset(m)}</button>
          {/each}
        {/if}
        {#if show('extras')}
          {#if canOsc}<button class="chip ico" class:sel={!!a.oscillating} title="Oscillate" aria-label="Oscillate" onclick={() => fan('oscillate', { oscillating: !a.oscillating })}><Icon icon="mdi:arrow-oscillating" size="1.15em" /></button>{/if}
          {#if canDir}<button class="chip ico" title={a.direction === 'reverse' ? 'Reverse' : 'Forward'} aria-label="Direction" onclick={() => fan('set_direction', { direction: a.direction === 'reverse' ? 'forward' : 'reverse' })}><Icon icon={a.direction === 'reverse' ? 'mdi:rotate-left' : 'mdi:rotate-right'} size="1.15em" /></button>{/if}
        {/if}
      </div>
    {/if}
    {#if lt && show('light')}
      <div class="lt" data-stop style:--lc={lightColor(lt) || '#ffc861'}>
        <button class="lb" class:on={ltOn} onclick={() => light('toggle')} aria-label="Light"><Icon icon="mdi:ceiling-light" size="1.1em" /></button>
        {#if ltDim}
          <div class="ls"><Slider value={ltPct} min={1} max={100} unit="%" height={32} label={ltOn ? '' : 'Light off'} color="var(--lc)" onchange={(v) => light('turn_on', { brightness_pct: v })} /></div>
        {:else}<span class="lname">{ltOn ? 'Light on' : 'Light off'}</span>{/if}
      </div>
    {/if}
    {#if sensors.length && show('sensors') && !small}
      <div class="sens">
        {#each sensors as s (s.entity_id)}<span><b>{val(s)}</b> {sname(s)}</span>{/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .fan { height: 100%; display: flex; flex-direction: column; justify-content: space-between; gap: 10px; min-height: 0; }
  .head { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .ic { width: 2.4em; height: 2.4em; flex: none; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.08); color: var(--muted); transition: background .3s, color .3s; }
  .on .ic { background: rgba(91,216,143,.22); color: #5bd88f; }
  .on .ic :global(svg) { animation: spin var(--spin) linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .nm { flex: 1; min-width: 0; font-weight: 600; display: flex; flex-direction: column; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nm small { font-weight: 500; font-size: .8em; color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
  .pw { width: 2.2em; height: 2.2em; flex: none; border-radius: 50%; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.06); color: var(--muted); display: grid; place-items: center; }
  .pw.on { background: rgba(91,216,143,.3); color: var(--text); }
  .msg { flex: 1; display: grid; place-items: center; text-align: center; color: var(--muted); font-size: .85em; }
  .row { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { padding: 6px 11px; border-radius: 99px; border: 0; background: rgba(255,255,255,.06); color: var(--muted); font: inherit; font-size: .8em; }
  .chip.ico { padding: 6px 9px; display: grid; place-items: center; }
  .chip.sel { background: rgba(91,216,143,.24); color: var(--text); box-shadow: inset 0 0 0 1px rgba(91,216,143,.55); }
  .lt { display: flex; align-items: center; gap: 8px; }
  .lb { width: 2.2em; height: 2.2em; flex: none; border-radius: 50%; border: 0; background: rgba(255,255,255,.08); color: var(--muted); display: grid; place-items: center; }
  .lb.on { background: var(--lc); color: rgba(0,0,0,.75); box-shadow: 0 0 14px color-mix(in srgb, var(--lc) 60%, transparent); }
  .ls { flex: 1; min-width: 0; }
  .lname { color: var(--muted); font-size: .85em; }
  .sens { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: .8em; color: var(--muted); }
  .sens b { color: var(--text); font-weight: 600; }
</style>
