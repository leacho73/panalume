<script module>
  import { states } from '../lib/ha.svelte.js';
  // Gecko (in.touch2) names everything "<spa name>_<thing>"; find the spa by its heater.
  function gecko() {
    const ids = [...states.keys()];
    const heaters = ids.map((k) => k.match(/^climate\.(.+)_heater$/)?.[1]).filter(Boolean);
    const p = heaters.find((x) => states.has(`binary_sensor.${x}_circulating_pump`)) || heaters.find((x) => /tub|spa/.test(x));
    if (!p) return { heater: ids.find((k) => /^climate\..*(hot_?tub|spa)/.test(k)) || '' };
    const id = (k) => (states.has(k) ? k : '');
    return {
      name: states.get(`climate.${p}_heater`)?.attributes.friendly_name?.replace(/\s*heater$/i, '') || '',
      heater: `climate.${p}_heater`,
      current_temp: id(`sensor.${p}_current_temperature`),
      pump1: id(`fan.${p}_pump_1`), pump2: id(`fan.${p}_pump_2`), blower: id(`fan.${p}_blower`), light: id(`light.${p}_lights`) || id(`light.${p}_light`),
      watercare: id(`select.${p}_watercare`), economy: id(`switch.${p}_economy_mode`), standby: id(`switch.${p}_standby`),
      heating: id(`binary_sensor.${p}_heating`), circulating: id(`binary_sensor.${p}_circulating_pump`), ozone: id(`binary_sensor.${p}_ozone`),
      in_use: id(`binary_sensor.${p}_spa_in_use`), winter: id(`binary_sensor.${p}_smart_winter_mode_active`),
      filter_clean: id(`binary_sensor.${p}_filter_status_clean`), filter_purge: id(`binary_sensor.${p}_filter_status_purge`),
      rinse_due: id(`sensor.${p}_rinse_filter_due`), clean_due: id(`sensor.${p}_clean_filter_due`), water_due: id(`sensor.${p}_change_water_due`),
      errors: id(`sensor.${p}_error_s`), connection: id(`sensor.${p}_status`),
    };
  }
  export const meta = {
    type: 'hottub', name: 'Hot tub', icon: 'mdi:hot-tub', category: 'Controls',
    size: { w: 460, h: 380 }, tap: 'none', hold: 'none',
    defaults: { hide: { graph: true } },
    autofill: gecko,
    sections: [
      { key: 'status', label: 'Status' }, { key: 'tub', label: 'Tub picture' }, { key: 'target', label: 'Target − / +' }, { key: 'pumps', label: 'Pumps & light' },
      { key: 'mode', label: 'WaterCare mode' }, { key: 'switches', label: 'Economy / standby' }, { key: 'lights', label: 'Status lights' },
      { key: 'maintenance', label: 'Maintenance' }, { key: 'graph', label: '24h graph' },
    ],
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'heater', label: 'Heater (climate)', type: 'entity', domain: ['climate', 'water_heater'] },
      { key: 'current_temp', label: 'Water temperature sensor (for the graph)', type: 'entity', domain: 'sensor', section: 'graph' },
      { key: 'pump1', label: 'Pump 1', type: 'entity', domain: ['fan', 'switch'], section: 'pumps' },
      { key: 'pump2', label: 'Pump 2', type: 'entity', domain: ['fan', 'switch'], section: 'pumps' },
      { key: 'blower', label: 'Blower', type: 'entity', domain: ['fan', 'switch'], section: 'pumps' },
      { key: 'light', label: 'Light', type: 'entity', domain: ['light', 'switch'], section: 'pumps' },
      { key: 'watercare', label: 'WaterCare / mode select', type: 'entity', domain: ['select', 'input_select'], section: 'mode' },
      { key: 'economy', label: 'Economy switch', type: 'entity', domain: 'switch', section: 'switches' },
      { key: 'standby', label: 'Standby switch', type: 'entity', domain: 'switch', section: 'switches' },
      { key: 'heating', label: 'Heating', type: 'entity', domain: 'binary_sensor', section: 'lights' },
      { key: 'circulating', label: 'Circulating pump', type: 'entity', domain: 'binary_sensor', section: 'lights' },
      { key: 'ozone', label: 'Ozone', type: 'entity', domain: 'binary_sensor', section: 'lights' },
      { key: 'in_use', label: 'In use', type: 'entity', domain: 'binary_sensor', section: 'status' },
      { key: 'winter', label: 'Winter mode active', type: 'entity', domain: 'binary_sensor', section: 'lights' },
      { key: 'filter_clean', label: 'Filter cycle: clean', type: 'entity', domain: 'binary_sensor', section: 'lights' },
      { key: 'filter_purge', label: 'Filter cycle: purge', type: 'entity', domain: 'binary_sensor', section: 'lights' },
      { key: 'rinse_due', label: 'Rinse filter due (date)', type: 'entity', domain: ['sensor', 'date'], section: 'maintenance' },
      { key: 'clean_due', label: 'Clean filter due (date)', type: 'entity', domain: ['sensor', 'date'], section: 'maintenance' },
      { key: 'water_due', label: 'Change water due (date)', type: 'entity', domain: ['sensor', 'date'], section: 'maintenance' },
      { key: 'errors', label: 'Errors', type: 'entity', domain: 'sensor', section: 'status' },
      { key: 'connection', label: 'Connection status', type: 'entity', domain: 'sensor', section: 'status' },
    ],
  };
</script>

<script>
  // Hot tub: a top-down tub whose water warms in colour with the temperature,
  // bubbles while the pumps run, steam while heating and a glow with the light
  // on; target − / +, pumps, light, WaterCare mode and maintenance reminders.
  import Icon from '../components/Icon.svelte';
  import Chart from '../components/Chart.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { callService } from '../lib/ha.svelte.js';
  import { clock } from '../lib/clock.svelte.js';
  import { useHistory } from '../lib/history.svelte.js';
  import { name } from '../lib/entity.js';
  let { props, w = 460, h = 380 } = $props();
  const show = (k) => !props.hide?.[k];
  const on = (id) => ent(id)?.state === 'on';
  const heater = $derived(ent(props.heater));
  const a = $derived(heater?.attributes || {});
  const dom = $derived(props.heater?.split('.')[0]);
  const cur = $derived(Number(a.current_temperature ?? ent(props.current_temp)?.state));
  const target = $derived(Number(a.temperature));
  const step = $derived(Number(a.target_temp_step) || 0.5);
  const heating = $derived(on(props.heating) || a.hvac_action === 'heating');
  const pumpOn = (id) => { const e = ent(id); return !!e && e.state === 'on' && e.attributes.preset_mode !== 'OFF'; };
  const pumps = $derived([props.pump1, props.pump2, props.blower].filter(Boolean));
  const bubbling = $derived(pumps.some(pumpOn));
  const lit = $derived(on(props.light));
  const standby = $derived(on(props.standby));
  const offline = $derived(props.connection && ent(props.connection) && !/connected|online|ok/i.test(ent(props.connection).state));
  const err = $derived.by(() => { const s = ent(props.errors)?.state; return s && !/^(none|ok|unknown|unavailable|)$/i.test(s) ? s : ''; });

  let pending = $state(null);
  let timer;
  const shown = $derived(pending ?? target);
  function setTarget(v) {
    pending = Math.min(a.max_temp ?? 40, Math.max(a.min_temp ?? 10, Math.round(v / step) * step));
    clearTimeout(timer);
    timer = setTimeout(() => {
      callService(dom, 'set_temperature', { temperature: pending }, { entity_id: props.heater }).finally(() => setTimeout(() => (pending = null), 1500));
    }, 900);
  }

  // Water colour by temperature: cool blue → warm turquoise.
  const water = $derived.by(() => {
    const c = Number.isFinite(cur) ? cur : 30;
    const k = Math.max(0, Math.min(1, (c - 20) / 20));
    const hue = 218 - k * 42;
    return { a: `hsl(${hue} 80% ${52 + k * 6}%)`, b: `hsl(${hue + 12} 75% ${28 + k * 6}%)` };
  });

  const status = $derived(
    offline ? `Offline (${ent(props.connection).state})` : err ? err : standby ? 'Standby' : heating ? `Heating to ${target}°` : on(props.in_use) ? 'In use' : on(props.winter) ? 'Winter mode' : Number.isFinite(cur) && Number.isFinite(target) && cur >= target - 0.5 ? 'Ready' : 'Idle',
  );

  // Pumps: tap cycles OFF → LO → HI (fan presets) or toggles.
  function cycle(id) {
    const e = ent(id);
    if (!e) return;
    const modes = e.attributes.preset_modes;
    if (id.startsWith('fan.') && modes?.length) {
      const i = modes.indexOf(e.state === 'off' ? 'OFF' : e.attributes.preset_mode);
      return callService('fan', 'set_preset_mode', { preset_mode: modes[(i + 1) % modes.length] }, { entity_id: id });
    }
    callService(id.split('.')[0], 'toggle', {}, { entity_id: id });
  }
  const pumpLabel = (id) => { const e = ent(id); const m = e?.attributes.preset_mode; return e?.state === 'off' ? 'Off' : m && m !== 'OFF' ? ({ LO: 'Low', HI: 'High' }[m] || m) : e?.state === 'on' ? 'On' : 'Off'; };
  const nice = (id, fb) => (ent(id)?.attributes.friendly_name || fb).replace(t(props.name) || ent(props.heater)?.attributes.friendly_name?.replace(/\s*heater$/i, '') || '', '').trim() || fb;

  const due = $derived([
    ['Rinse filter', props.rinse_due], ['Clean filter', props.clean_due], ['Change water', props.water_due],
  ].filter(([, id]) => id && ent(id)).map(([label, id]) => {
    const d = Math.round((Date.parse(ent(id).state) - clock.now) / 864e5);
    if (!Number.isFinite(d)) return null;
    const ago = Math.abs(d);
    const span = ago >= 60 ? `${Math.round(ago / 30)} months` : ago >= 14 ? `${Math.round(ago / 7)} weeks` : `${ago} day${ago === 1 ? '' : 's'}`;
    return { label, text: d < 0 ? `overdue ${span}` : d === 0 ? 'today' : `in ${span}`, level: d < 0 ? 'bad' : d <= 7 ? 'warn' : '' };
  }).filter(Boolean));

  const leds = $derived([
    ['Heating', props.heating, 'mdi:fire', '#ff9a57'], ['Circulating', props.circulating, 'mdi:sync', '#4fb4ff'], ['Ozone', props.ozone, 'mdi:molecule', '#b48cff'],
    ['Filter clean', props.filter_clean, 'mdi:air-filter', '#5bd88f'], ['Purge', props.filter_purge, 'mdi:water-sync', '#5bd88f'], ['Winter mode', props.winter, 'mdi:snowflake', '#9fd8ff'],
  ].filter(([, id]) => id && ent(id)));

  const hist = useHistory(() => (show('graph') && props.current_temp ? [props.current_temp] : []), () => 24);
  // The tub fills the space left by the header and buttons, up to 200px.
  const narrow = $derived(w < 420);
  const tubSize = $derived(Math.max(80, narrow ? Math.min(w * 0.6, h * 0.34, 200) : Math.min(h - 150, w * 0.48, 200)));
  const uid = Math.random().toString(36).slice(2, 8);
  // Short cards: a small tub beside the name, target and icon-only buttons.
  // (The full layout needs about 300px, or 460px once it stacks on a narrow card.)
  const compact = $derived(h < 300 || (narrow && h < 460));
  const miniSize = $derived(Math.max(56, Math.min(h - 8, w * 0.36, 170)));
  const miniBtns = $derived(h >= 125);
</script>

{#snippet tubPic(size)}
  <div class="pic" style="width:{size}px;height:{size}px">
    <svg viewBox="0 0 200 200">
      <defs>
        <radialGradient id="w{uid}" cx="50%" cy="45%" r="65%"><stop offset="0" style="stop-color:{water.a}" /><stop offset="1" style="stop-color:{water.b}" /></radialGradient>
        <radialGradient id="g{uid}" cx="50%" cy="50%" r="50%"><stop offset=".6" stop-color="#7fe8ff" stop-opacity="0" /><stop offset="1" stop-color="#7fe8ff" stop-opacity=".55" /></radialGradient>
      </defs>
      {#if lit}<rect x="0" y="0" width="200" height="200" rx="46" fill="url(#g{uid})" class="glow" />{/if}
      <rect x="10" y="10" width="180" height="180" rx="40" style="fill:#3a3f4c;stroke:#555c6b;stroke-width:2" />
      <rect x="24" y="24" width="152" height="152" rx="30" fill="url(#w{uid})" />
      <!-- seats -->
      <rect x="24" y="24" width="152" height="30" rx="14" style="fill:rgba(255,255,255,.08)" />
      <rect x="24" y="146" width="152" height="30" rx="14" style="fill:rgba(255,255,255,.08)" />
      <!-- ripples -->
      <ellipse cx="100" cy="100" rx="46" ry="30" class="ripple" class:fast={bubbling} />
      <ellipse cx="100" cy="100" rx="46" ry="30" class="ripple r2" class:fast={bubbling} />
      {#if bubbling}
        {#each [[60, 80, 0], [140, 90, .4], [80, 130, .8], [125, 125, 1.2], [100, 70, 1.6], [70, 110, .2], [130, 70, 1]] as [x, y, d]}
          <circle cx={x} cy={y} r="5" class="bub" style="animation-delay:{d}s" />
        {/each}
      {/if}
      {#if heating}
        {#each [70, 100, 130] as x, i}<path d="M{x} 70 q -8 -14 0 -26 q 8 -12 0 -24" class="steam" style="animation-delay:{i * .6}s" />{/each}
      {/if}
    </svg>
    <div class="temp" style="font-size:{Math.min(1, size / 150)}em"><b>{Number.isFinite(cur) ? cur.toFixed(1) : '—'}°</b>{#if Number.isFinite(target) && size >= 90}<small>{heating ? '→' : 'set'} {shown.toFixed(1)}°</small>{/if}</div>
  </div>
{/snippet}

{#if compact}
<div class="tub mini" class:dim={standby || offline}>
  {#if show('tub')}{@render tubPic(miniSize)}{/if}
  <div class="mside">
    <div class="tt">
      <div class="name"><span class="mic" class:hot={heating}><Icon icon="mdi:hot-tub" size="1em" /></span>{t(props.name) || (heater && name(heater)) || 'Hot tub'}</div>
      {#if show('status')}<div class="st" class:bad={offline || err} class:hot={heating}>{status}{#if !show('tub') && Number.isFinite(cur)}{' · '}{cur.toFixed(1)}°{/if}</div>{/if}
    </div>
    {#if show('target') && Number.isFinite(target)}
      <div class="tg" data-stop>
        <button aria-label="Cooler" onclick={() => setTarget(shown - step)}><Icon icon="mdi:minus" size="1.1em" /></button>
        <div class="tv"><b>{shown.toFixed(1)}°</b>{#if h >= 110}<span>target</span>{/if}</div>
        <button aria-label="Warmer" onclick={() => setTarget(shown + step)}><Icon icon="mdi:plus" size="1.1em" /></button>
      </div>
    {/if}
    {#if miniBtns && ((show('pumps') && (pumps.length || props.light)) || (show('switches') && (props.economy || props.standby)))}
      <div class="mbtns" data-stop>
        {#if show('pumps')}
          {#each [[props.pump1, 'Pump 1'], [props.pump2, 'Pump 2'], [props.blower, 'Blower']].filter(([id]) => id && ent(id)) as [id, fb]}
            <button class:on={pumpOn(id)} style="--k:#4fb4ff" title="{nice(id, fb)}: {pumpLabel(id)}" onclick={() => cycle(id)}><Icon icon="mdi:pump" size="1.1em" /></button>
          {/each}
          {#if props.light && ent(props.light)}
            <button class:on={lit} style="--k:#7fe8ff" title="Light: {lit ? 'On' : 'Off'}" onclick={() => callService(props.light.split('.')[0], 'toggle', {}, { entity_id: props.light })}><Icon icon={lit ? 'mdi:lightbulb-on' : 'mdi:lightbulb-outline'} size="1.1em" /></button>
          {/if}
        {/if}
        {#if show('switches')}
          {#each [[props.economy, 'Economy', 'mdi:leaf', '#5bd88f'], [props.standby, 'Standby', 'mdi:power-sleep', '#ffc861']].filter(([id]) => id && ent(id)) as [id, label, icon, c]}
            <button class:on={on(id)} style="--k:{c}" title="{label}: {on(id) ? 'On' : 'Off'}" onclick={() => callService('switch', 'toggle', {}, { entity_id: id })}><Icon {icon} size="1.1em" /></button>
          {/each}
        {/if}
      </div>
    {/if}
    {#if h >= 200 && show('lights') && leds.length}
      <div class="leds">{#each leds as [label, id, icon, c]}<span class:on={on(id)} style="--k:{c}" title={label}><Icon {icon} size="1em" />{label}</span>{/each}</div>
    {/if}
    {#if h >= 260 && show('maintenance') && due.length}
      <div class="due">{#each due as d}<div class={d.level}><Icon icon={d.level === 'bad' ? 'mdi:alert-circle' : 'mdi:calendar-clock'} size="1em" /><span>{d.label}</span><em>{d.text}</em></div>{/each}</div>
    {/if}
  </div>
</div>
{:else}

<div class="tub" class:narrow class:dim={standby || offline}>
  <div class="head">
    <span class="ic" class:hot={heating}><Icon icon="mdi:hot-tub" size="1.5em" /></span>
    <div class="tt">
      <div class="name">{t(props.name) || (heater && name(heater)) || 'Hot tub'}</div>
      {#if show('status')}<div class="st" class:bad={offline || err} class:hot={heating}>{status}</div>{/if}
    </div>
    {#if show('mode') && ent(props.watercare)}
      {@const m = ent(props.watercare)}
      <select data-stop value={m.state} onchange={(e) => callService(props.watercare.split('.')[0], 'select_option', { option: e.currentTarget.value }, { entity_id: props.watercare })}>
        {#each m.attributes.options || [] as o}<option value={o}>{o}</option>{/each}
      </select>
    {/if}
  </div>

  <div class="main">
    {#if show('tub')}{@render tubPic(tubSize)}
    {/if}

    <div class="side">
      {#if show('target') && Number.isFinite(target)}
        <div class="tg" data-stop>
          <button aria-label="Cooler" onclick={() => setTarget(shown - step)}><Icon icon="mdi:minus" size="1.3em" /></button>
          <div class="tv"><b>{shown.toFixed(1)}°</b><span>target</span></div>
          <button aria-label="Warmer" onclick={() => setTarget(shown + step)}><Icon icon="mdi:plus" size="1.3em" /></button>
        </div>
      {/if}
      {#if show('lights') && leds.length}
        <div class="leds">
          {#each leds as [label, id, icon, c]}<span class:on={on(id)} style="--k:{c}" title={label}><Icon {icon} size="1em" />{label}</span>{/each}
        </div>
      {/if}
      {#if show('maintenance') && due.length}
        <div class="due">
          {#each due as d}<div class={d.level}><Icon icon={d.level === 'bad' ? 'mdi:alert-circle' : 'mdi:calendar-clock'} size="1em" /><span>{d.label}</span><em>{d.text}</em></div>{/each}
        </div>
      {/if}
    </div>
  </div>

  {#if show('graph') && (hist.series[props.current_temp]?.length || 0) > 1}
    <div class="graph"><Chart series={[{ points: hist.series[props.current_temp], color: water.a }]} hours={24} strokeWidth={2} /></div>
  {/if}

  {#if (show('pumps') && (pumps.length || props.light)) || (show('switches') && (props.economy || props.standby))}
    <div class="btns" data-stop>
      {#if show('pumps')}
        {#each [[props.pump1, 'Pump 1'], [props.pump2, 'Pump 2'], [props.blower, 'Blower']].filter(([id]) => id && ent(id)) as [id, fb]}
          <button class:on={pumpOn(id)} style="--k:#4fb4ff" onclick={() => cycle(id)}><Icon icon="mdi:pump" size="1.2em" /><span>{nice(id, fb)}</span><small>{pumpLabel(id)}</small></button>
        {/each}
        {#if props.light && ent(props.light)}
          <button class:on={lit} style="--k:#7fe8ff" onclick={() => callService(props.light.split('.')[0], 'toggle', {}, { entity_id: props.light })}><Icon icon={lit ? 'mdi:lightbulb-on' : 'mdi:lightbulb-outline'} size="1.2em" /><span>Light</span><small>{lit ? 'On' : 'Off'}</small></button>
        {/if}
      {/if}
      {#if show('switches')}
        {#each [[props.economy, 'Economy', 'mdi:leaf', '#5bd88f'], [props.standby, 'Standby', 'mdi:power-sleep', '#ffc861']].filter(([id]) => id && ent(id)) as [id, label, icon, c]}
          <button class:on={on(id)} style="--k:{c}" onclick={() => callService('switch', 'toggle', {}, { entity_id: id })}><Icon {icon} size="1.2em" /><span>{label}</span><small>{on(id) ? 'On' : 'Off'}</small></button>
        {/each}
      {/if}
    </div>
  {/if}
</div>
{/if}

<style>
  .tub { height: 100%; display: flex; flex-direction: column; gap: 10px; }
  .dim .pic { filter: saturate(.4) brightness(.8); }
  .head { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .ic { width: 2.75em; height: 2.75em; border-radius: 50%; display: grid; place-items: center; flex: none; background: rgba(79,180,255,.18); color: #7fd0ff; }
  .ic.hot { background: rgba(255,154,87,.22); color: #ff9a57; animation: glow 2s infinite; }
  @keyframes glow { 50% { box-shadow: 0 0 0 6px rgba(255,154,87,.15); } }
  .tt { flex: 1; min-width: 0; }
  .name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .st { color: var(--muted); font-size: .85em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .st.hot { color: #ff9a57; }
  .st.bad { color: #ff7a90; }
  .head select { width: auto; max-width: 45%; font-size: .85em; }
  .main { flex: 1; min-height: 0; display: flex; gap: 16px; align-items: center; }
  .pic { position: relative; flex: none; }
  .narrow .main { flex-direction: column; align-items: stretch; }
  .narrow .pic { align-self: center; }
  .narrow .head select { max-width: 40%; }
  .pic svg { width: 100%; height: 100%; display: block; overflow: visible; }
  .temp { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-shadow: 0 2px 10px rgba(0,0,0,.55); pointer-events: none; }
  .temp b { font-size: 2.1em; font-weight: 600; letter-spacing: -.03em; line-height: 1; }
  .temp small { font-size: .8em; opacity: .9; margin-top: 3px; }
  .ripple { fill: none; stroke: rgba(255,255,255,.22); stroke-width: 1.5; transform-origin: 100px 100px; animation: rip 6s ease-out infinite; }
  .ripple.r2 { animation-delay: 3s; }
  .ripple.fast { animation-duration: 2.2s; stroke: rgba(255,255,255,.35); }
  .ripple.fast.r2 { animation-delay: 1.1s; }
  @keyframes rip { from { transform: scale(.4); opacity: .9; } to { transform: scale(1.5); opacity: 0; } }
  .bub { fill: rgba(255,255,255,.55); transform-box: fill-box; transform-origin: center; animation: bub 1.8s ease-in infinite; }
  @keyframes bub { 0% { transform: scale(.2); opacity: 0; } 30% { opacity: .9; } 100% { transform: scale(1.4) translateY(-6px); opacity: 0; } }
  .steam { fill: none; stroke: rgba(255,255,255,.4); stroke-width: 3; stroke-linecap: round; animation: steam 2.4s ease-in-out infinite; }
  @keyframes steam { 0% { opacity: 0; transform: translateY(8px); } 40% { opacity: .8; } 100% { opacity: 0; transform: translateY(-12px); } }
  .glow { animation: lglow 3s ease-in-out infinite; }
  @keyframes lglow { 50% { opacity: .6; } }
  .side { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
  .tg { display: flex; align-items: center; gap: 10px; }
  .tg button { width: 2.6em; height: 2.6em; border-radius: 50%; border: 0; background: rgba(255,255,255,.08); color: var(--text); display: grid; place-items: center; flex: none; }
  .tg button:active { transform: scale(.92); }
  .tv { flex: 1; text-align: center; display: flex; flex-direction: column; }
  .tv b { font-size: 1.5em; font-weight: 600; line-height: 1.1; }
  .tv span { font-size: .72em; color: var(--muted); }
  .leds { display: flex; flex-wrap: wrap; gap: 5px; }
  .leds span { display: inline-flex; align-items: center; gap: 4px; font-size: .72em; padding: 3px 8px; border-radius: 10px; background: rgba(255,255,255,.05); color: var(--muted); opacity: .6; }
  .leds span.on { opacity: 1; color: var(--k); background: color-mix(in srgb, var(--k) 16%, transparent); }
  .due { display: flex; flex-direction: column; gap: 3px; font-size: .8em; }
  .due div { display: flex; align-items: center; gap: 6px; color: var(--muted); }
  .due span { flex: 1; color: var(--text); }
  .due em { font-style: normal; }
  .due .warn em, .due .warn :global(svg) { color: #ffc861; }
  .due .bad em, .due .bad :global(svg) { color: #ff7a90; }
  .graph { height: 50px; flex: none; }
  .mini { flex-direction: row; align-items: center; gap: 14px; }
  .mside { flex: 1; min-width: 0; max-height: 100%; overflow: hidden; display: flex; flex-direction: column; gap: 6px; justify-content: center; }
  .mini .leds { max-height: calc(.9em + 6px); overflow: hidden; }
  .mini .due span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mini .due em { white-space: nowrap; }
  .mini .name { display: flex; align-items: center; gap: 6px; }
  .mic { color: #7fd0ff; display: inline-flex; flex: none; }
  .mic.hot { color: #ff9a57; }
  .mini .tg { gap: 6px; }
  .mini .tg button { width: 2.1em; height: 2.1em; }
  .mini .tv b { font-size: 1.2em; }
  .mbtns { display: flex; gap: 5px; }
  .mbtns button { flex: 1 1 0; min-width: 0; height: 2.1em; display: flex; align-items: center; justify-content: center; gap: 3px; border-radius: 10px; border: 0; background: rgba(255,255,255,.06); color: var(--muted); font: inherit; font-size: .85em; }
  .mbtns button.on { background: color-mix(in srgb, var(--k) 22%, transparent); color: var(--k); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--k) 60%, transparent); }
  .mbtns button:active { transform: scale(.95); }
  .btns { display: flex; gap: 6px; }
  .btns button { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 7px 4px; border-radius: 12px; border: 0; background: rgba(255,255,255,.06); color: var(--muted); font: inherit; font-size: .82em; }
  .btns button span { color: var(--text); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .btns button small { font-size: .82em; }
  .btns button.on { background: color-mix(in srgb, var(--k) 22%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--k) 60%, transparent); }
  .btns button.on :global(svg), .btns button.on small { color: var(--k); }
  .btns button:active { transform: scale(.95); }
</style>
