<script module>
  import { states } from '../lib/ha.svelte.js';
  import { nameOf } from '../lib/device.js';
  // A smart kettle is usually a water heater (temperature and target) with sensors
  // and switches named after the same device: kettle_x_water_heater, kettle_x_power,
  // kettle_x_weight… Find the kettle's water heater, then the rest by that prefix.
  function autofill() {
    const ids = [...states.keys()];
    const heater = ids.find((k) => /^water_heater\..*kettle/.test(k)) || ids.find((k) => /^climate\..*kettle/.test(k)) || '';
    if (!heater) return { entity: '' };
    const p = heater.split('.')[1].replace(/_(water_heater|heater|kettle)$/, '');
    const find = (domain, re) => ids.find((k) => k.startsWith(`${domain}.${p}`) && re.test(k.slice(domain.length + 1 + p.length))) || '';
    const out = {
      entity: heater,
      power: find('switch', /power|heat|boil|on$/),
      temperature: find('sensor', /temperature/),
      weight: find('sensor', /weight|water|volume/),
      preset: find('select', /mode|preset|program/),
      base: find('binary_sensor', /base|position|on_stand|placed/),
      error: find('sensor', /error/),
    };
    // The device's name: what its entities' names start with ("Kitchen Kettle").
    out.name = nameOf(Object.values(out).filter(Boolean));
    return out;
  }
  export const meta = {
    type: 'kettle', name: 'Kettle', icon: 'mdi:kettle', category: 'Controls',
    size: { w: 340, h: 300 }, tap: 'none', hold: 'more-info',
    defaults: { entity: '', empty: 0, capacity: 1700 },
    autofill,
    sections: [{ key: 'water', label: 'Water in it' }, { key: 'target', label: 'Target' }, { key: 'preset', label: 'Presets', section: 'preset' }, { key: 'base', label: 'On its base', section: 'base' }],
    fields: [
      { key: 'entity', label: 'Kettle (its water heater)', type: 'entity', domain: ['water_heater', 'climate'] },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'power', label: 'Heating on / off (switch)', type: 'entity', domain: ['switch', 'input_boolean'], hint: 'Blank: turned on and off through the water heater.' },
      { key: 'temperature', label: 'Water temperature (optional, else the water heater\'s)', type: 'entity', domain: 'sensor' },
      { key: 'weight', label: 'Weight (optional)', type: 'entity', domain: 'sensor', section: 'water' },
      { key: 'empty', label: 'Empty kettle weight (g)', type: 'number', section: 'water', hint: 'Taken off the weight to show how much water is in it. 0 shows the weight as it is.' },
      { key: 'capacity', label: 'Holds (ml)', type: 'number', section: 'water' },
      { key: 'preset', label: 'Presets (optional, e.g. green tea, baby bottle)', type: 'entity', domain: ['select', 'input_select'], section: 'preset' },
      { key: 'base', label: 'On its base (optional)', type: 'entity', domain: 'binary_sensor', section: 'base' },
      { key: 'base_invert', label: 'The base sensor is on when it\'s off its base', type: 'bool', section: 'base' },
      { key: 'error', label: 'Error (optional)', type: 'entity', domain: 'sensor' },
    ],
  };
</script>

<script>
  // A kettle: the water drawn at its level and coloured by how hot it is, the
  // temperature big, the target with − / +, a power button, the presets (tea
  // types) and whether it's on its base. Works from a water heater entity plus
  // whichever of the kettle's sensors and switches you have.
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { name as entName, domain, formatNumber } from '../lib/entity.js';
  import { attrWord } from '../lib/i18n.svelte.js';
  import { callService } from '../lib/ha.svelte.js';
  let { props, w = 340, h = 300 } = $props();
  const show = (k) => !props.hide?.[k];
  const e = $derived(ent(props.entity));
  const a = $derived(e?.attributes || {});
  const d = $derived(domain(e?.entity_id));
  const pw = $derived(ent(props.power));
  const num = (x) => { const v = parseFloat(x?.state); return Number.isFinite(v) ? v : null; };
  const temp = $derived(num(ent(props.temperature)) ?? a.current_temperature ?? null);
  const target = $derived(a.temperature ?? null);
  const min = $derived(a.min_temp ?? 30), max = $derived(a.max_temp ?? 100), step = $derived(a.target_temp_step || 1);
  const unit = $derived(ent(props.temperature)?.attributes.unit_of_measurement || a.temperature_unit || '°C');
  const on = $derived(pw ? pw.state === 'on' : !!e && !['off', 'unavailable', 'unknown'].includes(e.state));

  // Water: weight less the empty kettle, 1 g ≈ 1 ml.
  const wt = $derived(num(ent(props.weight)));
  const empty = $derived(Number(props.empty) || 0);
  const water = $derived(wt == null ? null : empty ? Math.max(0, wt - empty) : null);
  const cap = $derived(Number(props.capacity) || 1700);
  const level = $derived(water == null ? (on ? 0.6 : 0.45) : Math.min(1, water / cap));
  const ml = (v) => (v >= 1000 ? `${formatNumber(v / 1000, 1)} L` : `${Math.round(v / 10) * 10} ml`);

  const baseEnt = $derived(ent(props.base));
  const onBase = $derived(baseEnt ? (baseEnt.state === 'on') !== !!props.base_invert : null);
  const errEnt = $derived(ent(props.error));
  const error = $derived(errEnt && !['no_error', 'ok', 'none', 'off', '0', '', 'unknown', 'unavailable'].includes(String(errEnt.state).toLowerCase()) ? String(errEnt.state).replace(/_/g, ' ') : '');
  const pre = $derived(ent(props.preset));
  const presets = $derived((pre?.attributes.options || []).filter((o) => !/^(not_selected|none|off)$/i.test(o)));
  const word = (o) => attrWord('select', 'options', o) || String(o).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

  // Cold blue to boiling orange.
  const hot = $derived(temp == null ? 0 : Math.min(1, Math.max(0, (temp - 20) / 80)));
  const color = $derived(`hsl(${Math.round(205 - 185 * hot)} 85% 60%)`);
  const status = $derived(error ? `Error: ${error}` : onBase === false ? 'Off its base' : on ? (temp != null && target != null && temp >= target - 1 ? 'Ready' : 'Heating') : temp != null && temp >= 60 ? 'Hot' : 'Off');

  let pending = $state(null);
  let timer;
  const shownTarget = $derived(pending ?? target);
  function nudge(dir) {
    pending = Math.min(max, Math.max(min, (pending ?? target ?? min) + dir * step * (step < 5 ? 5 : 1)));
    clearTimeout(timer);
    timer = setTimeout(() => { const v = pending; callService(d, 'set_temperature', { temperature: v }, { entity_id: e.entity_id }).finally(() => setTimeout(() => (pending = null), 1500)); }, 800);
  }
  function power() {
    if (pw) return callService(domain(pw.entity_id), on ? 'turn_off' : 'turn_on', {}, { entity_id: pw.entity_id });
    if (e) callService(d, on ? 'turn_off' : 'turn_on', {}, { entity_id: e.entity_id });
  }
  const pick = (o) => pre && callService(domain(pre.entity_id), 'select_option', { option: o }, { entity_id: pre.entity_id });

  const small = $derived(h < 220);
  const clip = `kb${Math.random().toString(36).slice(2, 8)}`;
  // The kettle drawing: body, spout, handle and lid; the water is clipped to the body.
  const BODY = 'M22 30 L78 30 L86 92 Q87 98 81 98 L19 98 Q13 98 14 92 Z';
</script>

<div class="kt" class:on class:small style="--c:{color}">
  <div class="glow"></div>
  <div class="head">
    <span class="ic"><Icon icon={on ? 'mdi:kettle-steam' : 'mdi:kettle'} size="1.2em" /></span>
    <span class="nm">{t(props.name) || entName(e) || 'Kettle'}<small class:err={!!error} class:pulse={on && status === 'Heating'}>{status}</small></span>
    {#if e || pw}<button class="pw" class:on onclick={power} aria-label={on ? 'Turn off' : 'Turn on'} data-stop><Icon icon="mdi:power" size="1.1em" /></button>{/if}
  </div>

  {#if !e && !pw}
    <div class="msg">{props.entity ? 'Kettle not found' : 'Pick the kettle in the card\'s settings.'}</div>
  {:else}
    <div class="body">
      {#if !small}
        <svg class="pot" viewBox="0 0 110 104" aria-hidden="true">
          <defs><clipPath id={clip}><path d={BODY} /></clipPath></defs>
          <path d="M86 44 Q104 44 104 62 Q104 80 87 84" class="handle" />
          <path d="M21 38 L5 25 Q3 24 4 27 L17 52 Z" class="spout" />
          <rect x="0" y={98 - 68 * level} width="110" height="104" clip-path="url(#{clip})" class="water" />
          <path d={BODY} class="shell" />
          <rect x="34" y="22" width="32" height="8" rx="3" class="lid" />
          <rect x="44" y="16" width="12" height="6" rx="2" class="lid" />
          {#if onBase !== false}<rect x="10" y="98" width="80" height="5" rx="2" class="base" />{/if}
        </svg>
      {/if}
      <div class="read">
        <div class="temp">{temp != null ? Math.round(temp) : '—'}<small>{unit}</small></div>
        {#if show('water') && (water != null || wt != null)}
          <div class="sub"><Icon icon="mdi:water" size="1em" />{water != null ? ml(water) : `${Math.round(wt)} g`}</div>
        {/if}
        {#if show('target') && shownTarget != null}
          <div class="tgt" data-stop>
            <button onclick={() => nudge(-1)} aria-label="Lower"><Icon icon="mdi:minus" size="1.1em" /></button>
            <span class:pending={pending != null}>{Math.round(shownTarget)}{unit}</span>
            <button onclick={() => nudge(1)} aria-label="Raise"><Icon icon="mdi:plus" size="1.1em" /></button>
          </div>
        {/if}
      </div>
    </div>
    {#if show('preset') && presets.length && !small}
      <select class="pre" value={presets.includes(pre.state) ? pre.state : ''} onchange={(ev) => pick(ev.currentTarget.value)} data-stop>
        <option value="" disabled>Preset…</option>
        {#each presets as o}<option value={o}>{word(o)}</option>{/each}
      </select>
    {/if}
  {/if}
</div>

<style>
  .kt { position: relative; height: 100%; display: flex; flex-direction: column; gap: 8px; isolation: isolate; min-height: 0; }
  .glow { position: absolute; inset: calc(var(--pad) * -1); z-index: -1; background: radial-gradient(120% 90% at 30% 100%, color-mix(in srgb, var(--c) 20%, transparent), transparent 70%); pointer-events: none; transition: background .8s; }
  .head { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .ic { width: 2em; height: 2em; flex: none; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--c) 22%, transparent); color: var(--c); }
  .nm { flex: 1; min-width: 0; font-weight: 600; display: flex; flex-direction: column; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nm small { font-weight: 500; font-size: .78em; color: var(--muted); }
  .nm small.err { color: #ff6b6b; }
  .on .nm small { color: var(--c); }
  .pulse { animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .45; } }
  .pw { width: 2.1em; height: 2.1em; flex: none; border-radius: 50%; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.06); color: var(--muted); display: grid; place-items: center; }
  .pw.on { background: color-mix(in srgb, var(--c) 32%, transparent); color: var(--text); }
  .msg { flex: 1; display: grid; place-items: center; text-align: center; color: var(--muted); font-size: .85em; }
  .body { flex: 1; min-height: 0; display: flex; align-items: center; gap: 14px; }
  .pot { height: 100%; max-height: 170px; max-width: 42%; aspect-ratio: 110 / 104; flex: none; overflow: visible; }
  .shell { fill: rgba(255,255,255,.04); stroke: rgba(255,255,255,.35); stroke-width: 2.5; stroke-linejoin: round; }
  .handle { fill: none; stroke: rgba(255,255,255,.35); stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; }
  .spout { fill: rgba(255,255,255,.08); stroke: rgba(255,255,255,.35); stroke-width: 2.5; stroke-linejoin: round; }
  .lid { fill: rgba(255,255,255,.3); }
  .base { fill: rgba(255,255,255,.18); }
  .water { fill: var(--c); opacity: .75; transition: y .8s, fill .8s; }
  .read { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
  .temp { font-size: 2.6em; font-weight: 600; letter-spacing: -.03em; line-height: 1; font-variant-numeric: tabular-nums; }
  .temp small { font-size: .38em; color: var(--muted); font-weight: 500; vertical-align: top; margin-left: 2px; }
  .sub { display: flex; align-items: center; gap: 4px; color: var(--muted); font-size: .85em; }
  .tgt { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
  .tgt span { min-width: 2.8em; text-align: center; font-weight: 600; font-variant-numeric: tabular-nums; }
  .tgt span.pending { color: var(--c); }
  .tgt button { width: 2.2em; height: 2.2em; border-radius: 50%; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.06); color: inherit; display: grid; place-items: center; }
  .tgt button:active { background: color-mix(in srgb, var(--c) 45%, transparent); }
  .pre { font-size: .85em; padding: 7px 9px; border-radius: 10px; background: rgba(255,255,255,.06); }
  .small .temp { font-size: 2em; }
</style>
