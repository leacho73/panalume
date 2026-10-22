<script module>
  import { states } from '../lib/ha.svelte.js';
  import { nameOf } from '../lib/device.js';
  // Fills in a car that isn't on another EV card yet. Volkswagen-group cars
  // (Audi / VW / Skoda Connect: …_state_of_charge), Renault / Dacia / Alpine
  // (the Renault integration: …_battery + …_battery_autonomy) and MySkoda.
  function cars() {
    const out = [];
    for (const id of states.keys()) {
      let m = /^sensor\.((?!octopus)[a-z0-9_]+)_state_of_charge$/.exec(id);
      if (m && !m[1].endsWith('_target')) out.push({ p: m[1], soc: id, make: 'vw' });
      m = /^sensor\.([a-z0-9_]+)_battery_autonomy$/.exec(id);
      if (m && states.has(`sensor.${m[1]}_battery`)) out.push({ p: m[1], soc: `sensor.${m[1]}_battery`, make: 'renault' });
      // MySkoda (Enyaq, Elroq…): …_battery_percentage next to …_range or …_charger_connected.
      m = /^sensor\.([a-z0-9_]+)_battery_percentage$/.exec(id);
      if (m && (states.has(`sensor.${m[1]}_range`) || states.has(`binary_sensor.${m[1]}_charger_connected`))) out.push({ p: m[1], soc: id, make: 'skoda' });
    }
    return out;
  }
  function fill(car) {
    const has = (...ids) => ids.find((id) => states.has(id)) || '';
    const p = car.p;
    const out = car.make === 'skoda' ? {
      soc: car.soc, range: has(`sensor.${p}_range`), charging: has(`sensor.${p}_charging_state`, `sensor.${p}_charging_status`, `sensor.${p}_charge_state`),
      power: has(`sensor.${p}_charging_power`), target: has(`number.${p}_charge_limit`, `sensor.${p}_target_battery_percentage`),
      remaining: has(`sensor.${p}_remaining_charging_time`, `sensor.${p}_charging_time_left`), plug: has(`binary_sensor.${p}_charger_connected`),
      lock: has(`binary_sensor.${p}_locked`, `binary_sensor.${p}_doors_locked`, `lock.${p}_doors`), climate: has(`climate.${p}_air_conditioning`, `climate.${p}_climatisation`), mileage: has(`sensor.${p}_mileage`),
    } : car.make === 'renault' ? {
      soc: car.soc, range: `sensor.${p}_battery_autonomy`, charging: has(`sensor.${p}_charge_state`),
      power: has(`sensor.${p}_charging_power`, `sensor.${p}_admissible_charging_power`), target: has(`number.${p}_target_charge_level`),
      remaining: has(`sensor.${p}_charging_remaining_time`), plug: has(`binary_sensor.${p}_plug`, `sensor.${p}_plug_state`),
      lock: has(`binary_sensor.${p}_lock`, `lock.${p}_lock`), climate: has(`button.${p}_start_air_conditioner`), mileage: has(`sensor.${p}_mileage`),
    } : {
      soc: car.soc, range: has(`sensor.${p}_range`), charging: has(`sensor.${p}_charging_state`), power: has(`sensor.${p}_charging_power`),
      target: has(`sensor.${p}_target_state_of_charge`, `number.${p}_global_charge_target`), remaining: has(`sensor.${p}_remaining_charge_time`),
      plug: has(`binary_sensor.${p}_plug_state`), lock: has(`binary_sensor.${p}_doors_lock`), climate: has(`climate.${p}_climatisation`), mileage: has(`sensor.${p}_mileage`),
    };
    return { name: nameOf(Object.values(out).filter((id) => id.includes('.'))) || p, ...out };
  }
  function autofill(ctx) {
    const used = new Set(Object.values(ctx?.cards || {}).filter((c) => c.type === 'ev').map((c) => c.props?.soc));
    const all = cars();
    const car = all.find((c) => !used.has(c.soc)) || all[0];
    return car ? fill(car) : {};
  }
  // For the editor's Device box: every car found, whatever its make.
  function devices(props) {
    const all = cars();
    if (all.length < 2) return null;
    const cur = all.find((c) => c.soc === props.soc);
    return { current: cur ? fill(cur).name : '', others: all.filter((c) => c !== cur).map((c) => ({ id: c.soc, name: fill(c).name, props: fill(c) })) };
  }
  export const meta = {
    type: 'ev', name: 'Electric vehicle', icon: 'mdi:car-electric', category: 'Energy',
    size: { w: 380, h: 220 }, tap: 'none',
    defaults: {},
    autofill,
    devices,
    sections: [{ key: 'ring', label: 'Battery ring' }, { key: 'range', label: 'Range', section: 'range' }, { key: 'status', label: 'Charging status' }, { key: 'plug', label: 'Plug', section: 'plug' }, { key: 'lock', label: 'Lock', section: 'lock' }, { key: 'climate', label: 'Climate', section: 'climate' }, { key: 'mileage', label: 'Mileage', section: 'mileage' }, { key: 'image', label: 'Car image', section: 'image' }],
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'soc', label: 'Battery %', type: 'entity', domain: 'sensor' },
      { key: 'range', label: 'Range', type: 'entity', domain: 'sensor' },
      { key: 'target', label: 'Target %', type: 'entity', domain: ['sensor', 'number'], section: 'status' },
      { key: 'charging', label: 'Charging state', type: 'entity', domain: 'sensor', section: 'status' },
      { key: 'power', label: 'Charging power', type: 'entity', domain: 'sensor', section: 'status' },
      { key: 'remaining', label: 'Remaining charge time', type: 'entity', domain: 'sensor', section: 'status' },
      { key: 'plug', label: 'Plugged in', type: 'entity', domain: ['binary_sensor', 'sensor'] },
      { key: 'lock', label: 'Locked (doors lock)', type: 'entity', domain: ['binary_sensor', 'lock'] },
      { key: 'climate', label: 'Climatisation (or a start air conditioning button)', type: 'entity', domain: ['climate', 'button'] },
      { key: 'mileage', label: 'Mileage', type: 'entity', domain: 'sensor' },
      { key: 'image', label: 'Car image URL', type: 'text' },
    ],
  };
</script>

<script>
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { callService, haImage } from '../lib/ha.svelte.js';
  import { stateText, formatNumber } from '../lib/entity.js';
  let { props, w = 380, h = 220 } = $props();
  const show = (k) => !props.hide?.[k];
  const soc = $derived(Number(ent(props.soc)?.state));
  const tgt = $derived(Number(ent(props.target)?.state));
  const charging = $derived(/charg/i.test(ent(props.charging)?.state || '') && !/not|complete|end|wait|error|stop|flap|ready|conserv|idle/i.test(ent(props.charging)?.state || ''));
  const plug = $derived(ent(props.plug));
  const plugged = $derived(plug?.state === 'on' || /^plugged/i.test(plug?.state || ''));
  // Renault: climate is a "start air conditioner" button; its HVAC sensor says if it's running.
  const climBtn = $derived(props.climate?.startsWith('button.'));
  const climOn = $derived(climBtn ? ent(props.climate.replace(/^button\.(.+)_start_air_conditioner$/, 'binary_sensor.$1_hvac'))?.state === 'on' : ent(props.climate)?.state !== 'off');
  function climate() {
    if (climBtn) callService('button', 'press', {}, { entity_id: props.climate });
    else callService('climate', clim.state === 'off' ? 'turn_on' : 'turn_off', {}, { entity_id: clim.entity_id });
  }
  // Minutes from a duration sensor (Renault / VW report minutes; hours and seconds also work).
  const leftMin = $derived.by(() => {
    const e = ent(props.remaining), v = Number(e?.state);
    if (!e || !(v > 0)) return 0;
    const u = String(e.attributes.unit_of_measurement || 'min').toLowerCase();
    return Math.round(u.startsWith('h') ? v * 60 : u === 's' ? v / 60 : v);
  });
  const short = $derived(h < 150 || w < 320);
  // While charging the time left matters most, so it comes first on small cards.
  const status = $derived.by(() => {
    const kw = props.power && Number(ent(props.power)?.state) > 0 ? stateText(ent(props.power)) : '';
    const left = leftMin ? `${Math.floor(leftMin / 60)}h ${String(leftMin % 60).padStart(2, '0')}m left` : '';
    const target = !isNaN(tgt) ? `target ${Math.round(tgt)}%` : '';
    if (charging) return (short ? [left, kw, target] : [`Charging${kw ? ' ' + kw : ''}`, left, target]).filter(Boolean).join(' · ');
    return [human(ent(props.charging)?.state), target].filter(Boolean).join(' · ');
  });
  // Short cards drop the less important lines.
  const showStatus = $derived(h >= 125 || (charging && h >= 105));
  const showMileage = $derived(h >= 160);
  const lock = $derived(ent(props.lock));
  let roomW = $state(0), fullW = $state(0);
  const lockText = $derived(lock && (lock.entity_id.startsWith('binary_sensor') ? (lock.state === 'on' ? 'Unlocked' : 'Locked') : stateText(lock)));
  const clim = $derived(ent(props.climate));
  const color = $derived(soc < 20 ? '#ff7a90' : soc < 50 ? '#ffc861' : '#5bd88f');
  const name = $derived(t(props.name) || nameOf([props.soc, props.range, props.mileage].filter((id) => id && states.has(id))) || 'EV');
  const R = 42, C = 2 * Math.PI * R;
  const NICE = { not_in_charge: 'Not charging', charge_ended: 'Charge complete', waiting_for_a_planned_charge: 'Waiting for its charging schedule', waiting_for_current_charge: 'Waiting for power', charge_error: 'Charging error', energy_flap_opened: 'Charge flap open', ready_for_charging: 'Ready to charge', conserving: 'Holding charge' };
  const human = (s) => NICE[s] || (s || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
</script>

<div class="ev" class:short>
  {#if show('ring')}<div class="ring">
    <svg viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,.08)" stroke-width="8" />
      {#if !isNaN(tgt)}<circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,.18)" stroke-width="8" stroke-dasharray="1.2 {C}" stroke-dashoffset={-C * (tgt / 100) + 0.6} transform="rotate(-90 50 50)" />{/if}
      <circle cx="50" cy="50" r={R} fill="none" style="stroke:{color};transition:stroke-dasharray .6s" stroke-width="8" stroke-linecap="round" stroke-dasharray="{isNaN(soc) ? 0 : (C * soc) / 100} {C}" transform="rotate(-90 50 50)" class:pulse={charging} />
    </svg>
    <div class="pct">{isNaN(soc) ? '—' : Math.round(soc) + '%'}{#if charging}<Icon icon="mdi:lightning-bolt" size=".7em" style="color:{color}" />{/if}</div>
  </div>{/if}
  <div class="info">
    <div class="name">{name}</div>
    {#if props.range && show('range')}<div class="range">{formatNumber(ent(props.range)?.state, 0)} <span>{ent(props.range)?.attributes.unit_of_measurement || ''}</span></div>{/if}
    {#if show('status') && showStatus && status}<div class="dim" class:one={short} title={status}>{status}</div>{/if}
    <div class="chipbox" bind:clientWidth={roomW}>
      {#snippet chipset()}
        {#if plug && show('plug')}<span class="chip" class:on={plugged} title={plugged ? 'Plugged in' : 'Unplugged'}><Icon icon={plugged ? 'mdi:power-plug' : 'mdi:power-plug-off'} size="1em" /><span class="lbl">{plugged ? 'Plugged' : 'Unplugged'}</span></span>{/if}
        {#if lock && show('lock')}<span class="chip" class:warn={lock.state === 'on' && lock.entity_id.startsWith('binary_sensor')} title={lockText}><Icon icon={lock.state === 'on' ? 'mdi:lock-open-variant' : 'mdi:lock'} size="1em" /><span class="lbl">{lockText}</span></span>{/if}
        {#if clim && show('climate')}<button class="chip" class:on={climOn} onclick={climate} title={climOn ? 'Climate on' : 'Start climate'}><Icon icon="mdi:fan" size="1em" /><span class="lbl">{climOn ? 'Climate on' : climBtn && !short ? 'Start climate' : 'Climate'}</span></button>{/if}
      {/snippet}
      <div class="chips" class:bare={fullW > roomW + 1} data-stop>{@render chipset()}</div>
      <!-- Invisible copy with labels, to tell whether they fit on one row. -->
      <div class="chips measure" aria-hidden="true" inert bind:clientWidth={fullW}>{@render chipset()}</div>
    </div>
    {#if props.mileage && show('mileage') && showMileage}<div class="dim small">{formatNumber(ent(props.mileage)?.state, 0)} {ent(props.mileage)?.attributes.unit_of_measurement || ''}</div>{/if}
  </div>
  {#if props.image && show('image')}<img class="car" src={haImage(t(props.image))} alt="" />{/if}
</div>

<style>
  .ev { height: 100%; display: flex; align-items: center; gap: 16px; position: relative; }
  .ring { position: relative; height: 100%; max-height: 150px; aspect-ratio: 1; flex: none; container-type: inline-size; }
  .ring svg { width: 100%; height: 100%; }
  .pulse { animation: pulse 2s infinite; }
  @keyframes pulse { 50% { opacity: .55; } }
  /* Sized to the ring, so the number always fits inside it. */
  .pct { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: min(1.6em, 22cqi); font-weight: 600; letter-spacing: -.02em; }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; z-index: 1; }
  .name { font-weight: 600; font-size: 1.1em; }
  .range { font-size: 1.6em; font-weight: 600; line-height: 1; }
  .range span { font-size: .5em; color: var(--muted); }
  .dim { color: var(--muted); font-size: .85em; text-transform: none; }
  .small { font-size: .75em; }
  /* Always one row: labels go first when it's tight, then any chip that still doesn't fit drops out whole. */
  .chipbox { position: relative; margin-top: 4px; margin-left: -8px; }
  .chips { display: flex; gap: 5px; flex-wrap: wrap; max-height: calc(.9em + 10px); overflow: hidden; }
  .bare .lbl { display: none; }
  .measure { position: absolute; top: 0; left: 0; flex-wrap: nowrap; width: max-content; visibility: hidden; pointer-events: none; }
  .short .info { gap: 2px; }
  .short .chipbox { margin-top: 2px; }
  .short { gap: 12px; }
  .one { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chip { white-space: nowrap; flex: none; display: inline-flex; align-items: center; gap: 4px; font-size: .75em; padding: 4px 8px; border-radius: 8px; background: rgba(255,255,255,.07); color: var(--muted); border: 0; }
  .chip.on { color: #5bd88f; background: rgba(91,216,143,.14); }
  .chip.warn { color: #ffc861; }
  .car { position: absolute; right: -10px; bottom: -10px; height: 70%; opacity: .9; pointer-events: none; }
  /* Older Safari doesn't size text by the card (container units). */
  @supports not (font-size: 1cqmin) { .pct { font-size: 1.6em; } }
</style>
