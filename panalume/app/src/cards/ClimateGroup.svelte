<script module>
  import { states } from '../lib/ha.svelte.js';
  // Climate entities that are rooms rather than a hot tub, car or heat pump zone.
  const SKIP = /spa|hot_?tub|climatisation|octopus_energy_heat_pump|water_heater/;
  export const meta = {
    type: 'climate-group', name: 'Climate group', icon: 'mdi:home-thermometer', category: 'Controls',
    size: { w: 440, h: 400 }, tap: 'none', hold: 'none',
    defaults: { entities: [] },
    autofill: () => ({ entities: [...states.keys()].filter((id) => id.startsWith('climate.') && !SKIP.test(id)).sort().slice(0, 4) }),
    sections: [
      { key: 'target', label: 'Target − / +' }, { key: 'current', label: 'Average temp' }, { key: 'modes', label: 'Modes' },
      { key: 'fan', label: 'Fan speed' }, { key: 'units', label: 'Each unit' },
    ],
    fields: [
      { key: 'entities', label: 'Thermostats / AC units', type: 'entities', domain: 'climate' },
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Air conditioning' },
      { key: 'icon', label: 'Icon', type: 'icon' },
    ],
  };
</script>

<script>
  // Several thermostats or AC units on one card: one target, mode and fan
  // speed for all of them, plus a row per unit to adjust or switch it alone.
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/tpl.js';
  import { stateWord, attrWord } from '../lib/i18n.svelte.js';
  import { name, formatNumber } from '../lib/entity.js';
  import { callService } from '../lib/ha.svelte.js';
  import { app } from '../lib/config.svelte.js';
  let { props, w = 440, h = 400 } = $props();
  const show = (k) => !props.hide?.[k];

  const COLORS = { heating: '#ff8a4c', preheating: '#ff8a4c', cooling: '#4fb4ff', drying: '#ffc861', fan: '#5bd88f' };
  const MODE_COLOR = { heat: '#ff8a4c', cool: '#4fb4ff', heat_cool: '#b48cff', auto: '#5bd88f', dry: '#ffc861', fan_only: '#5bd88f', off: '#8a94a8' };
  const MODE = { off: ['mdi:power', 'Off'], heat: ['mdi:fire', 'Heat'], cool: ['mdi:snowflake', 'Cool'], auto: ['mdi:thermostat-auto', 'Auto'], heat_cool: ['mdi:sun-snowflake-variant', 'Heat/Cool'], dry: ['mdi:water-percent', 'Dry'], fan_only: ['mdi:fan', 'Fan'] };
  const ORDER = ['off', 'heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only'];
  const ACTION = { heating: 'Heating', preheating: 'Pre-heating', cooling: 'Cooling', drying: 'Drying', fan: 'Fan', idle: 'Idle', off: 'Off' };
  const label = (m) => stateWord('climate', null, m) || MODE[m]?.[1] || m.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

  const units = $derived((props.entities || []).map((id) => states.get(id)).filter(Boolean));
  const isOff = (e) => e.state === 'off' || e.state === 'unavailable';
  const on = $derived(units.filter((e) => !isOff(e)));
  const tgt = (e) => e.attributes.temperature ?? e.attributes.target_temp_low;
  const step = $derived(Math.max(...units.map((e) => e.attributes.target_temp_step || 0.5), 0.5));
  const min = $derived(Math.max(...units.map((e) => e.attributes.min_temp ?? 7), 7));
  const max = $derived(Math.min(...units.map((e) => e.attributes.max_temp ?? 35), 35));
  const unit = $derived(units[0]?.attributes.temperature_unit || '°');
  const clamp = (v) => Math.min(max, Math.max(min, Math.round(v / step) * step));

  // The group's target: the units that are on (or all of them when none are).
  const targets = $derived((on.length ? on : units).map(tgt).filter((v) => v != null));
  const lo = $derived(targets.length ? Math.min(...targets) : null);
  const hi = $derived(targets.length ? Math.max(...targets) : null);
  const mixed = $derived(lo != null && hi - lo >= step / 2);
  const currents = $derived(units.map((e) => e.attributes.current_temperature).filter((v) => v != null));
  const avg = $derived(currents.length ? currents.reduce((s, v) => s + v, 0) / currents.length : null);

  const modes = $derived(ORDER.filter((m) => units.some((e) => (e.attributes.hvac_modes || []).includes(m))).concat([...new Set(units.flatMap((e) => e.attributes.hvac_modes || []))].filter((m) => !ORDER.includes(m))));
  const mode = $derived(on.length === 0 && units.length ? 'off' : new Set(on.map((e) => e.state)).size === 1 ? on[0].state : null);
  const fans = $derived([...new Set(units.flatMap((e) => e.attributes.fan_modes || []))]);
  const fan = $derived(new Set(on.map((e) => e.attributes.fan_mode)).size === 1 ? on[0]?.attributes.fan_mode : '');
  const busy = $derived(on.map((e) => e.attributes.hvac_action).find((x) => COLORS[x]));
  const color = $derived(COLORS[busy] || MODE_COLOR[mode] || (on.length ? '#7aa2ff' : '#8a94a8'));

  // Changes wait for a short pause, so tapping + three times sends one call.
  let pending = $state(null); // { [entity_id | '*']: value }
  let timer;
  function setTemp(ids, v) {
    pending = { ...(pending || {}), ...Object.fromEntries(ids.map((id) => [id, clamp(v)])) };
    clearTimeout(timer);
    timer = setTimeout(send, 900);
  }
  function send() {
    const p = pending;
    for (const [id, v] of Object.entries(p || {})) {
      const e = states.get(id);
      if (!e) continue;
      const a = e.attributes;
      const data = a.temperature == null && a.target_temp_low != null ? { target_temp_low: v, target_temp_high: Math.max(v + 2, a.target_temp_high ?? v + 2) } : { temperature: v };
      callService('climate', 'set_temperature', data, { entity_id: id });
    }
    setTimeout(() => { if (pending === p) pending = null; }, 1500);
  }
  const shownOf = (e) => pending?.[e.entity_id] ?? tgt(e);
  const group = $derived(on.length ? on : units);
  const groupShown = $derived.by(() => {
    const vs = group.map(shownOf).filter((v) => v != null);
    if (!vs.length) return null;
    const a = Math.min(...vs), b = Math.max(...vs);
    return b - a >= step / 2 ? null : a;
  });
  // − / + on the group: mixed targets meet at the middle first, then move together.
  function nudgeAll(dir) {
    const vs = group.map(shownOf).filter((v) => v != null);
    if (!vs.length) return;
    const base = groupShown ?? clamp(vs.reduce((s, v) => s + v, 0) / vs.length);
    setTemp(group.map((e) => e.entity_id), groupShown == null ? base : base + dir * step);
  }
  function setMode(m) {
    for (const e of units) {
      if (m === 'off') { if (!isOff(e)) callService('climate', 'set_hvac_mode', { hvac_mode: 'off' }, { entity_id: e.entity_id }); }
      else if ((e.attributes.hvac_modes || []).includes(m)) callService('climate', 'set_hvac_mode', { hvac_mode: m }, { entity_id: e.entity_id });
    }
  }
  function setFan(f) {
    for (const e of on.length ? on : units) if ((e.attributes.fan_modes || []).includes(f)) callService('climate', 'set_fan_mode', { fan_mode: f }, { entity_id: e.entity_id });
  }
  function power(e) {
    if (!isOff(e)) return callService('climate', 'set_hvac_mode', { hvac_mode: 'off' }, { entity_id: e.entity_id });
    // Back on in the group's mode when it has one, else the unit's own last mode.
    const m = mode && mode !== 'off' && (e.attributes.hvac_modes || []).includes(mode) ? mode : null;
    if (m) callService('climate', 'set_hvac_mode', { hvac_mode: m }, { entity_id: e.entity_id });
    else callService('climate', 'turn_on', {}, { entity_id: e.entity_id });
  }
  const unitColor = (e) => COLORS[e.attributes.hvac_action] || (isOff(e) ? '#8a94a8' : MODE_COLOR[e.state] || '#7aa2ff');
  // A unit's name without the group's own words ("Upstairs AC" in "AC" → "Upstairs").
  const title = $derived(t(props.name) || 'Climate');
  function short(e) {
    const n = name(e);
    const s = n.replace(new RegExp(`\\s*\\b${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b\\s*`, 'i'), ' ').trim();
    return s || n;
  }

  // What fits under the header, in order: target, modes, fan, then the units
  // (on short cards the fan and then the modes drop out first).
  const room = $derived(h - 24 - 40);
  const heroH = $derived(show('target') ? 72 : 0);
  const showModes = $derived(show('modes') && modes.length > 0 && heroH + 44 <= room);
  const showFan = $derived(show('fan') && fans.length > 0 && heroH + (showModes ? 44 : 0) + 42 <= room);
  const used = $derived(heroH + (showModes ? 44 : 0) + (showFan ? 42 : 0));
  // Side by side only when the unit rows don't fit underneath (spare height
  // goes first), and the card is wide enough for two columns.
  const stackFits = $derived(!show('units') || !units.length || used + 10 + units.length * 46 <= room);
  const wide = $derived(!stackFits && w >= 520 && w > h * 1.1);
  const showUnits = $derived(show('units') && units.length > 0 && (wide ? room : room - used - 10) >= 44);
</script>

<div class="cg" class:wide style="--c:{color}">
  <div class="glow"></div>
  <div class="head">
    <span class="ic"><Icon icon={t(props.icon) || 'mdi:home-thermometer'} size="1.2em" /></span>
    <span class="name">{title}</span>
    {#if units.length}<span class="chip">{on.length} of {units.length} on</span>{/if}
  </div>

  {#if !units.length}
    <div class="empty">Pick the thermostats or AC units in the card's settings.</div>
  {:else}
    <div class="body">
      <div class="main">
        {#if show('target')}
          <div class="hero" data-stop>
            <button class="rb" onclick={() => nudgeAll(-1)} disabled={!on.length} aria-label="Lower all"><Icon icon="mdi:minus" size="1.3em" /></button>
            <div class="rc">
              <div class="act">{busy ? attrWord('climate', 'hvac_action', busy) || ACTION[busy] : on.length ? (mode ? label(mode) : 'Mixed modes') : 'All off'}</div>
              <div class="tgt" class:pending={pending != null} class:mix={on.length && groupShown == null}>
                {#if !on.length}Off
                {:else if groupShown != null}{formatNumber(groupShown, step < 1 ? 1 : 0)}<small>{unit}</small>
                {:else if mixed}{formatNumber(lo, step < 1 ? 1 : 0)}–{formatNumber(hi, step < 1 ? 1 : 0)}<small>{unit}</small>
                {:else}—{/if}
              </div>
              {#if show('current') && avg != null}<div class="now">Now {formatNumber(avg, 1)}{unit}{currents.length > 1 ? ' avg' : ''}</div>{/if}
            </div>
            <button class="rb" onclick={() => nudgeAll(1)} disabled={!on.length} aria-label="Raise all"><Icon icon="mdi:plus" size="1.3em" /></button>
          </div>
        {/if}
        {#if showModes}
          <div class="modes" data-stop>
            {#each modes as m}
              <button class:sel={m === mode} style="--mc:{MODE_COLOR[m] || 'var(--accent)'}" onclick={() => setMode(m)} title="{label(m)} (all)">
                <Icon icon={MODE[m]?.[0] || 'mdi:circle-medium'} size="1.15em" />{#if (wide ? w * 0.48 : w) / modes.length >= 62}<span>{label(m)}</span>{/if}
              </button>
            {/each}
          </div>
        {/if}
        {#if showFan}
          <select class="fan" data-stop value={fan} onchange={(ev) => setFan(ev.currentTarget.value)}>
            {#if !fan}<option value="">Fan: mixed</option>{/if}
            {#each fans as f}<option value={f}>Fan {f}</option>{/each}
          </select>
        {/if}
      </div>

      {#if showUnits}
        <div class="units" data-stop>
          {#each units as e (e.entity_id)}
            {@const v = shownOf(e)}
            <div class="unit" class:off={isOff(e)} style="--u:{unitColor(e)}">
              <button class="pw" onclick={() => power(e)} title={isOff(e) ? 'Turn on' : 'Turn off'}><Icon icon="mdi:power" size="1em" /></button>
              <button class="un" onclick={() => (app.popup = { entity: e.entity_id })}>
                <span class="nm">{short(e)}</span>
                <span class="st">{[isOff(e) ? label('off') : attrWord('climate', 'hvac_action', e.attributes.hvac_action) || ACTION[e.attributes.hvac_action] || label(e.state), e.attributes.current_temperature != null ? formatNumber(e.attributes.current_temperature, 1) + unit : ''].filter(Boolean).join(' · ')}</span>
              </button>
              {#if !isOff(e) && v != null}
                <button class="sb" onclick={() => setTemp([e.entity_id], v - step)} aria-label="Lower {short(e)}"><Icon icon="mdi:minus" size="1em" /></button>
                <span class="ut" class:pending={pending?.[e.entity_id] != null}>{formatNumber(v, step < 1 ? 1 : 0)}°</span>
                <button class="sb" onclick={() => setTemp([e.entity_id], v + step)} aria-label="Raise {short(e)}"><Icon icon="mdi:plus" size="1em" /></button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .cg { position: relative; height: 100%; display: flex; flex-direction: column; gap: 8px; isolation: isolate; }
  .glow { position: absolute; inset: calc(var(--pad) * -1); z-index: -1; background: radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, var(--c) 20%, transparent), transparent 70%); transition: background .6s; pointer-events: none; }
  .head { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .ic { width: 2em; height: 2em; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--c) 22%, transparent); color: var(--c); flex: none; }
  .name { font-weight: 600; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chip { font-size: .75em; font-weight: 600; padding: 3px 9px; border-radius: 99px; background: rgba(255,255,255,.07); color: var(--muted); white-space: nowrap; }
  .empty { flex: 1; display: grid; place-items: center; text-align: center; color: var(--muted); font-size: .9em; padding: 0 12px; }
  .body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
  .wide .body { flex-direction: row; gap: 14px; }
  .main { display: flex; flex-direction: column; gap: 10px; }
  .wide .main { flex: 1; min-width: 0; justify-content: center; }
  .hero { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .rc { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; }
  .act { font-size: .75em; color: var(--c); font-weight: 600; text-transform: uppercase; letter-spacing: .06em; }
  .tgt { font-size: 2.4em; font-weight: 600; letter-spacing: -.03em; line-height: 1.05; white-space: nowrap; }
  .tgt.pending { color: var(--c); }
  .tgt.mix { font-size: 1.7em; padding: .2em 0; }
  .tgt small { font-size: .4em; color: var(--muted); font-weight: 500; vertical-align: top; margin-left: 2px; }
  .now { font-size: .8em; color: var(--muted); }
  .rb { width: 2.6em; height: 2.6em; flex: none; border-radius: 50%; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.06); color: inherit; display: grid; place-items: center; }
  .rb:active { background: color-mix(in srgb, var(--c) 45%, transparent); }
  .rb:disabled { opacity: .35; }
  .modes { display: flex; gap: 4px; }
  .modes button { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 2px; border-radius: 12px; border: 0; background: rgba(255,255,255,.05); color: var(--muted); font-size: .72em; transition: all .2s; }
  .modes button span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .modes .sel { background: color-mix(in srgb, var(--mc) 26%, transparent); color: var(--text); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--mc) 55%, transparent); }
  .modes .sel :global(svg) { color: var(--mc); }
  .fan { font-size: .8em; padding: 6px 8px; border-radius: 10px; background: rgba(255,255,255,.06); }
  .units { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; scrollbar-width: none; }
  .wide .units { flex: 1.1; justify-content: center; }
  .unit { display: flex; align-items: center; gap: 8px; padding: 5px 8px 5px 5px; min-height: 40px; border-radius: 12px; background: rgba(255,255,255,.04); flex: none; }
  .pw { width: 30px; height: 30px; flex: none; border-radius: 50%; border: 0; display: grid; place-items: center; background: color-mix(in srgb, var(--u) 24%, transparent); color: var(--u); transition: all .2s; }
  .unit.off .pw { background: rgba(255,255,255,.06); color: var(--muted); }
  .un { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; border: 0; background: none; color: inherit; padding: 0; text-align: left; }
  .nm { font-weight: 600; font-size: .9em; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .st { font-size: .75em; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .unit:not(.off) .st { color: color-mix(in srgb, var(--u) 70%, var(--text)); }
  .sb { width: 28px; height: 28px; flex: none; border-radius: 50%; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.05); color: inherit; display: grid; place-items: center; }
  .sb:active { background: color-mix(in srgb, var(--u) 40%, transparent); }
  .ut { min-width: 3.2em; text-align: center; font-weight: 600; font-variant-numeric: tabular-nums; }
  .ut.pending { color: var(--u); }
</style>
