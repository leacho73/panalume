<script module>
  export const meta = {
    type: 'climate', name: 'Thermostat', icon: 'mdi:thermostat', category: 'Controls',
    size: { w: 300, h: 340 }, tap: 'none', hold: 'more-info',
    defaults: { entity: '', show_modes: true },
    sections: [
      { key: 'dial', label: 'Dial' }, { key: 'current', label: 'Current temp' }, { key: 'action', label: 'Heating / cooling status' },
      { key: 'humidity', label: 'Humidity' }, { key: 'modes', label: 'Modes' }, { key: 'presets', label: 'Presets' }, { key: 'fan', label: 'Fan' },
    ],
    fields: [
      { key: 'entity', label: 'Climate / water heater', type: 'entity', domain: ['climate', 'water_heater'] },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'icon', label: 'Icon', type: 'icon' },
    ],
  };
</script>

<script>
  // Thermostat: drag the dial (or use −/+) to set the target; colour follows
  // what the unit is doing — warm when heating, cool when cooling, grey when off.
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { stateWord, attrWord } from '../lib/i18n.svelte.js';
  import { name, domain, formatNumber } from '../lib/entity.js';
  import { callService } from '../lib/ha.svelte.js';
  let { props, w = 300, h = 340 } = $props();
  const show = (k) => !props.hide?.[k] && (k !== 'modes' || props.show_modes !== false);
  const e = $derived(ent(props.entity));
  const a = $derived(e?.attributes || {});
  const d = $derived(domain(e?.entity_id));
  const unit = $derived(a.temperature_unit || '°');
  const step = $derived(a.target_temp_step || (unit === '°F' ? 1 : 0.5));
  const min = $derived(a.min_temp ?? 7);
  const max = $derived(a.max_temp ?? 35);
  const target = $derived(a.temperature ?? a.target_temp_high ?? a.target_temp_low);
  const cur = $derived(a.current_temperature);
  const off = $derived(!e || e.state === 'off' || e.state === 'unavailable');
  const mode = $derived(d === 'water_heater' ? a.operation_mode || e?.state : e?.state);
  const action = $derived(a.hvac_action || (d === 'water_heater' ? (e?.state !== 'off' ? 'idle' : 'off') : off ? 'off' : 'idle'));
  const modes = $derived(d === 'water_heater' ? a.operation_list || [] : a.hvac_modes || []);

  const COLORS = { heating: '#ff8a4c', preheating: '#ff8a4c', cooling: '#4fb4ff', drying: '#ffc861', fan: '#5bd88f', idle: '#7aa2ff', off: '#8a94a8' };
  const MODE_COLOR = { heat: '#ff8a4c', cool: '#4fb4ff', heat_cool: '#b48cff', auto: '#5bd88f', dry: '#ffc861', fan_only: '#5bd88f', off: '#8a94a8' };
  const color = $derived(COLORS[action] && action !== 'idle' ? COLORS[action] : MODE_COLOR[mode] || '#7aa2ff');
  const MODE = { off: ['mdi:power', 'Off'], heat: ['mdi:fire', 'Heat'], cool: ['mdi:snowflake', 'Cool'], auto: ['mdi:thermostat-auto', 'Auto'], heat_cool: ['mdi:sun-snowflake-variant', 'Heat/Cool'], dry: ['mdi:water-percent', 'Dry'], fan_only: ['mdi:fan', 'Fan'], eco: ['mdi:leaf', 'Eco'], heat_pump: ['mdi:heat-pump', 'Heat pump'], electric: ['mdi:flash', 'Electric'], performance: ['mdi:rocket-launch', 'Boost'], high_demand: ['mdi:rocket-launch', 'High demand'], gas: ['mdi:fire', 'Gas'] };
  const ACTION = { heating: ['mdi:fire', 'Heating'], preheating: ['mdi:fire', 'Pre-heating'], cooling: ['mdi:snowflake', 'Cooling'], drying: ['mdi:water-percent', 'Drying'], fan: ['mdi:fan', 'Fan'], idle: ['mdi:pause-circle-outline', 'Idle'], off: ['mdi:power', 'Off'] };
  const label = (m) => stateWord('climate', null, m) || MODE[m]?.[1] || m.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  // Some units don't say what they're doing, only
  // their mode (e.g. Tuya air conditioners, Hive and other hot water): show the
  // mode then, rather than claiming they're idle.
  const actView = $derived(!a.hvac_action && !off && mode
    ? [MODE[mode]?.[0] || 'mdi:thermostat', label(mode)]
    : [ACTION[action]?.[0] || 'mdi:thermostat', attrWord('climate', 'hvac_action', action) || ACTION[action]?.[1] || action]);

  // Pending target while adjusting; sent after a short pause.
  let pending = $state(null);
  let timer;
  const shown = $derived(pending ?? target);
  const clamp = (v) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  function setTarget(v, now = false) {
    pending = clamp(v);
    clearTimeout(timer);
    timer = setTimeout(send, now ? 0 : 900);
  }
  function send() {
    if (pending == null || !e) return;
    const v = pending;
    const data = a.temperature == null && a.target_temp_low != null ? { target_temp_low: v, target_temp_high: Math.max(v + 2, a.target_temp_high ?? v + 2) } : { temperature: v };
    callService(d, 'set_temperature', data, { entity_id: e.entity_id }).finally(() => setTimeout(() => (pending = null), 1500));
  }
  function setMode(m) {
    if (d === 'water_heater') callService(d, 'set_operation_mode', { operation_mode: m }, { entity_id: e.entity_id });
    else callService(d, 'set_hvac_mode', { hvac_mode: m }, { entity_id: e.entity_id });
  }

  // Dial geometry: 270° arc, gap at the bottom.
  const R = 80, CX = 100, CY = 100, START = 135, SWEEP = 270;
  const frac = (v) => Math.min(1, Math.max(0, (v - min) / (max - min || 1)));
  const pt = (f) => { const ang = ((START + SWEEP * f) * Math.PI) / 180; return [CX + R * Math.cos(ang), CY + R * Math.sin(ang)]; };
  const arc = (f0, f1) => {
    const [x0, y0] = pt(f0), [x1, y1] = pt(f1);
    return `M${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 ${SWEEP * (f1 - f0) > 180 ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
  };
  let svg;
  let dragging = $state(false);
  function valueAt(ev) {
    const r = svg.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * 200 - CX, y = ((ev.clientY - r.top) / r.height) * 200 - CY;
    let ang = (Math.atan2(y, x) * 180) / Math.PI;
    let rel = (ang - START + 360) % 360;
    if (rel > SWEEP) rel = rel > SWEEP + (360 - SWEEP) / 2 ? 0 : SWEEP;
    return min + (rel / SWEEP) * (max - min);
  }
  function down(ev) {
    if (off || shown == null) return;
    ev.stopPropagation();
    svg.setPointerCapture(ev.pointerId);
    dragging = true;
    pending = clamp(valueAt(ev));
    clearTimeout(timer);
  }
  const move = (ev) => dragging && (pending = clamp(valueAt(ev)));
  function up() { if (!dragging) return; dragging = false; setTarget(pending, true); }

  const wide = $derived(w > h * 1.35);
  // Room left for the dial after the header, buttons and pickers; below ~130px
  // the card switches to a compact − temperature + row.
  const extrasShown = $derived((show('presets') && (a.preset_modes || []).length) || (show('fan') && (a.fan_modes || []).length));
  const dialSpace = $derived(wide ? h - 74 : h - 74 - (!off && target != null ? 50 : 0) - (show('modes') && modes.length ? 54 : 0) - (extrasShown ? 42 : 0));
  const useDial = $derived(show('dial') && dialSpace >= 130 && w >= 150);
  const presets = $derived(a.preset_modes || []);
  const fans = $derived(a.fan_modes || []);
</script>

<div class="clim" class:off class:wide style="--c:{color}">
  <div class="glow"></div>
  <div class="head">
    <span class="ic"><Icon icon={t(props.icon) || (d === 'water_heater' ? 'mdi:water-boiler' : 'mdi:thermostat')} size="1.2em" /></span>
    <span class="name">{t(props.name) || name(e)}</span>
    {#if show('humidity') && (a.current_humidity ?? a.humidity) != null}<span class="hum"><Icon icon="mdi:water-percent" size="1em" />{a.current_humidity ?? a.humidity}%</span>{/if}
  </div>

  <div class="body">
    {#if useDial}
      <div class="dial" data-stop>
        <svg bind:this={svg} viewBox="0 0 200 200" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} role="slider" aria-valuenow={shown} aria-valuemin={min} aria-valuemax={max} tabindex="-1">
          <path d={arc(0, 1)} class="track" />
          {#if shown != null && !off}
            <path d={arc(0, frac(shown))} class="fill" />
            {@const [kx, ky] = pt(frac(shown))}
            <circle cx={kx} cy={ky} r={dragging ? 11 : 9} class="knob" />
          {/if}
          {#if cur != null}
            {@const [mx, my] = pt(frac(cur))}
            <circle cx={mx} cy={my} r="3.5" class="cur" />
          {/if}
        </svg>
        <div class="centre">
          {#if show('action')}<div class="act" class:pulse={action === 'heating' || action === 'cooling'}><Icon icon={actView[0]} size="1em" /> {actView[1]}</div>{/if}
          {#if !off && shown == null && cur != null}
            <!-- No settable target (e.g. some water heaters): show the current temperature big. -->
            <div class="tgt">{formatNumber(cur, 1)}<small>{unit}</small></div>
            <div class="now">Current</div>
          {:else}
            <div class="tgt" class:pending={pending != null}>{off ? 'Off' : shown != null ? formatNumber(shown, step < 1 ? 1 : 0) : '—'}{#if !off && shown != null}<small>{unit}</small>{/if}</div>
            {#if show('current') && cur != null}<div class="now">Now {formatNumber(cur, 1)}{unit}</div>{/if}
          {/if}
        </div>
      </div>
    {:else}
      <div class="row" data-stop>
        {#if !off && shown != null}<button class="rb" onclick={() => setTarget((pending ?? target) - step)} aria-label="Lower"><Icon icon="mdi:minus" size="1.3em" /></button>{/if}
        <div class="rc">
          {#if show('action')}<div class="act" class:pulse={action === 'heating' || action === 'cooling'}><Icon icon={actView[0]} size="1em" /> {actView[1]}</div>{/if}
          <div class="tgt" class:pending={pending != null}>{off ? 'Off' : shown != null ? formatNumber(shown, step < 1 ? 1 : 0) : cur != null ? formatNumber(cur, 1) : '—'}{#if !off && (shown ?? cur) != null}<small>{unit}</small>{/if}</div>
          {#if show('current') && cur != null && shown != null}<div class="now">Now {formatNumber(cur, 1)}{unit}</div>{/if}
        </div>
        {#if !off && shown != null}<button class="rb" onclick={() => setTarget((pending ?? target) + step)} aria-label="Raise"><Icon icon="mdi:plus" size="1.3em" /></button>{/if}
      </div>
    {/if}

    <div class="side">
      {#if useDial && !off && shown != null}
        <div class="pm" data-stop>
          <button onclick={() => setTarget((pending ?? target) - step)} aria-label="Lower"><Icon icon="mdi:minus" size="1.3em" /></button>
          <button onclick={() => setTarget((pending ?? target) + step)} aria-label="Raise"><Icon icon="mdi:plus" size="1.3em" /></button>
        </div>
      {/if}
      {#if show('modes') && modes.length}
        <div class="modes" data-stop>
          {#each modes as m}
            <button class:sel={m === mode} style="--mc:{MODE_COLOR[m] || 'var(--accent)'}" onclick={() => setMode(m)} title={label(m)}>
              <Icon icon={MODE[m]?.[0] || 'mdi:circle-medium'} size="1.15em" />{#if (wide ? w / 2 : w) / modes.length >= 62}<span>{label(m)}</span>{/if}
            </button>
          {/each}
        </div>
      {/if}
      {#if (show('presets') && presets.length) || (show('fan') && fans.length)}
        <div class="extras" data-stop>
          {#if show('presets') && presets.length}
            <select value={a.preset_mode} onchange={(ev) => callService(d, 'set_preset_mode', { preset_mode: ev.currentTarget.value }, { entity_id: e.entity_id })}>
              {#each presets as p}<option value={p}>{label(p)}</option>{/each}
            </select>
          {/if}
          {#if show('fan') && fans.length}
            <select value={a.fan_mode} onchange={(ev) => callService(d, 'set_fan_mode', { fan_mode: ev.currentTarget.value }, { entity_id: e.entity_id })}>
              {#each fans as f}<option value={f}>Fan {f}</option>{/each}
            </select>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .clim { position: relative; height: 100%; display: flex; flex-direction: column; gap: 6px; isolation: isolate; }
  .glow { position: absolute; inset: calc(var(--pad) * -1); z-index: -1; background: radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--c) 22%, transparent), transparent 70%); transition: background .6s; pointer-events: none; }
  .off .glow { opacity: .3; }
  .head { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .ic { width: 2em; height: 2em; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--c) 22%, transparent); color: var(--c); flex: none; }
  .name { font-weight: 600; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hum { display: flex; align-items: center; gap: 2px; color: var(--muted); font-size: .85em; }
  .body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
  .wide .body { flex-direction: row; align-items: center; }
  .dial { position: relative; flex: 1; min-height: 0; aspect-ratio: 1; max-width: 100%; margin: 0 auto; touch-action: none; }
  .wide .dial { height: 100%; flex: none; }
  .dial svg { width: 100%; height: 100%; display: block; cursor: grab; }
  .track { fill: none; stroke: rgba(255,255,255,.08); stroke-width: 14; stroke-linecap: round; }
  .fill { fill: none; stroke: var(--c); stroke-width: 14; stroke-linecap: round; filter: drop-shadow(0 0 6px color-mix(in srgb, var(--c) 60%, transparent)); transition: stroke .4s; }
  .knob { fill: #fff; stroke: var(--c); stroke-width: 4; filter: drop-shadow(0 2px 4px rgba(0,0,0,.4)); transition: r .15s; }
  .cur { fill: var(--text); opacity: .9; }
  .centre { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; }
  .act { display: flex; align-items: center; gap: 4px; font-size: .78em; color: var(--c); font-weight: 600; text-transform: uppercase; letter-spacing: .06em; }
  .pulse :global(svg) { animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .35; transform: scale(.85); } }
  .tgt { font-size: 2.6em; font-weight: 600; letter-spacing: -.03em; line-height: 1.05; transition: opacity .2s; }
  .tgt.pending { color: var(--c); }
  .tgt small { font-size: .38em; color: var(--muted); font-weight: 500; vertical-align: top; margin-left: 2px; }
  .now { font-size: .8em; color: var(--muted); }
  .row { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .rc { flex: 1; display: flex; flex-direction: column; align-items: center; min-width: 0; }
  .rb { width: 2.6em; height: 2.6em; flex: none; border-radius: 50%; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.06); color: inherit; display: grid; place-items: center; }
  .rb:active { background: color-mix(in srgb, var(--c) 45%, transparent); }
  .side { display: flex; flex-direction: column; gap: 8px; }
  .wide .side { flex: 1; min-width: 0; }
  .pm { display: flex; justify-content: center; gap: 12px; }
  .wide .pm { justify-content: flex-start; }
  .pm button { width: 2.6em; height: 2.6em; border-radius: 50%; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.06); color: inherit; display: grid; place-items: center; transition: background .15s; }
  .pm button:active { background: color-mix(in srgb, var(--c) 45%, transparent); }
  .modes { display: flex; gap: 4px; }
  .wide .modes { flex-wrap: wrap; }
  .modes button { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 2px; border-radius: 12px; border: 0; background: rgba(255,255,255,.05); color: var(--muted); font-size: .72em; transition: all .2s; }
  .modes button span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .modes .sel { background: color-mix(in srgb, var(--mc) 26%, transparent); color: var(--text); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--mc) 55%, transparent); }
  .modes .sel :global(svg) { color: var(--mc); }
  .extras { display: flex; gap: 6px; }
  .extras select { flex: 1; min-width: 0; font-size: .8em; padding: 6px 8px; border-radius: 10px; background: rgba(255,255,255,.06); }
</style>
