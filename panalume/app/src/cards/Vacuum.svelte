<script module>
  import { states } from '../lib/ha.svelte.js';
  // Finds the vacuum, and the battery / area / time / error sensors some
  // integrations (Roborock, Ecovacs, Dreame, Valetudo…) add next to it.
  function autofill() {
    const ids = [...states.keys()].filter((id) => id.startsWith('vacuum.')).sort();
    const v = ids.find((id) => states.get(id)?.state !== 'unavailable') || ids[0];
    if (!v) return {};
    const p = v.slice(7);
    const first = (...n) => n.map((x) => `sensor.${p}_${x}`).find((id) => states.has(id)) || '';
    return {
      entity: v,
      battery: first('battery', 'battery_level'),
      area: first('cleaned_area', 'cleaning_area', 'last_clean_area', 'total_cleaned_area'),
      time: first('cleaning_time', 'cleaning_duration', 'last_clean_duration'),
      error: first('error', 'vacuum_error'),
    };
  }
  export const meta = {
    type: 'vacuum', name: 'Robot vacuum', icon: 'mdi:robot-vacuum', category: 'Controls',
    size: { w: 300, h: 250 }, tap: 'none', hold: 'more-info',
    defaults: { entity: '' },
    autofill,
    sections: [
      { key: 'state', label: 'Status' }, { key: 'battery', label: 'Battery', section: 'battery' }, { key: 'stats', label: 'Area / time cleaned', section: 'stats' },
      { key: 'controls', label: 'Start / pause / dock', section: 'controls' }, { key: 'fan', label: 'Suction power', section: 'fan' }, { key: 'locate', label: 'Locate (beep)', section: 'locate' },
    ],
    fields: [
      { key: 'entity', label: 'Vacuum', type: 'entity', domain: 'vacuum' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'battery', label: 'Battery (optional, uses the vacuum\'s own if it has one)', type: 'entity', domain: 'sensor', section: 'battery' },
      { key: 'area', label: 'Area cleaned (optional)', type: 'entity', domain: 'sensor', section: 'stats' },
      { key: 'time', label: 'Cleaning time (optional)', type: 'entity', domain: 'sensor', section: 'stats' },
      { key: 'error', label: 'Error message (optional)', type: 'entity', domain: 'sensor' },
    ],
  };
</script>

<script>
  // A robot vacuum: a big round button (a ring that shows the battery, when
  // there is one) that starts, pauses or resumes it, the status under it, and
  // buttons to send it home, make it beep and pick the suction power. It only
  // shows what the vacuum says it can do. Small cards become a single row.
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { name, stateText, formatNumber } from '../lib/entity.js';
  import { callService } from '../lib/ha.svelte.js';
  let { props, w = 300, h = 250 } = $props();
  const show = (k) => !props.hide?.[k];

  const e = $derived(ent(props.entity));
  const st = $derived(e?.state || 'unavailable');
  const dead = $derived(!e || st === 'unavailable' || st === 'unknown');

  const LOOK = {
    cleaning: ['Cleaning', '#4fb4ff'], returning: ['Heading home', '#b48cff'], paused: ['Paused', '#ffb547'], docked: ['Docked', '#5bd88f'],
    idle: ['Idle', '#8a94a8'], error: ['Needs attention', '#ff6b6b'], unavailable: ['Unavailable', '#8a94a8'], unknown: ['Unknown', '#8a94a8'],
  };
  const [label, color] = $derived(LOOK[st] || [st.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), '#8a94a8']);

  // What the vacuum supports (HA's feature flags). If it doesn't say, assume the basics.
  const feat = $derived(Number(e?.attributes.supported_features) || 0);
  const can = (bit, strict = false) => (feat ? (feat & bit) === bit : !strict);
  const START = 8192, PAUSE = 4, HOME = 16, FAN = 32, LOCATE = 512;

  const cleaning = $derived(st === 'cleaning');
  const batt = $derived.by(() => {
    if (!show('battery')) return NaN;
    const v = props.battery ? ent(props.battery)?.state : e?.attributes.battery_level;
    return v == null || v === '' ? NaN : Number(v);
  });
  const hasBatt = $derived(Number.isFinite(batt));

  const call = (svc, data = {}) => e && callService('vacuum', svc, data, { entity_id: e.entity_id });
  const startSvc = $derived(!feat || (feat & START) === START ? 'start' : 'turn_on');
  const mainLabel = $derived(cleaning ? (can(PAUSE) ? 'Pause' : 'Stop') : st === 'paused' ? 'Resume' : 'Start');
  const mainIcon = $derived(cleaning ? (can(PAUSE) ? 'mdi:pause' : 'mdi:stop') : 'mdi:play');
  const main = () => { if (!dead) call(cleaning ? (can(PAUSE) ? 'pause' : 'stop') : startSvc); };
  const goHome = $derived(show('controls') && can(HOME) && !dead && !['docked', 'returning'].includes(st));
  const canLocate = $derived(show('locate') && can(LOCATE, true) && !dead);
  const fans = $derived(show('fan') && can(FAN, true) && !dead ? e?.attributes.fan_speed_list || [] : []);
  const cap = (s) => String(s).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

  const area = $derived(show('stats') && props.area ? ent(props.area) : null);
  const time = $derived(show('stats') && props.time ? ent(props.time) : null);
  const stats = $derived([area, time].filter((x) => x && !['unavailable', 'unknown'].includes(x.state)));
  const problem = $derived.by(() => {
    if (st !== 'error') return '';
    const m = ent(props.error)?.state ?? e?.attributes.error;
    return m && !['unavailable', 'unknown', 'none', 'no_error', 'ok'].includes(String(m).toLowerCase()) ? cap(m) : '';
  });

  const small = $derived(h < 150 || w < 240);
  // The suction picker wraps onto its own row on narrower cards: leave room for it.
  const extraRow = $derived(fans.length && w < 380 ? 40 : 0);
  const ringSize = $derived(Math.max(56, Math.min(w - 48, h - 28 - 34 - (stats.length || problem ? 22 : 0) - 52 - 20 - extraRow, 170)));
  const R = 44, C = 2 * Math.PI * R;
  const battColor = $derived(batt <= 15 ? '#ff6b6b' : batt <= 30 ? '#ffb547' : color);
  const battIcon = $derived(batt <= 15 ? 'mdi:battery-alert-variant-outline' : batt <= 40 ? 'mdi:battery-low' : batt <= 75 ? 'mdi:battery-medium' : 'mdi:battery-high');
</script>

<div class="vc" class:small class:cleaning class:returning={st === 'returning'} class:error={st === 'error'} style="--c:{color}">
  <div class="glow"></div>
  {#if small}
    <button class="orb" class:dead style="width:46px;height:46px" onclick={main} data-stop disabled={dead} aria-label={mainLabel}>{@render orb(46)}</button>
    <div class="txt">
      <div class="name">{t(props.name) || name(e)}</div>
      <div class="st">{[show('state') ? (problem || label) : '', hasBatt ? `${formatNumber(batt, 0)}%` : ''].filter(Boolean).join(' · ')}</div>
    </div>
    {#if show('controls') && w >= 200 && !dead}
      <div class="btns side" data-stop>
        <button class="sq" onclick={main} title={mainLabel}><Icon icon={mainIcon} size="1.1em" /></button>
        {#if goHome && w >= 260}<button class="sq" onclick={() => call('return_to_base')} title="Send home"><Icon icon="mdi:home-import-outline" size="1.1em" /></button>{/if}
      </div>
    {/if}
  {:else}
    <div class="head">
      <span class="name">{t(props.name) || name(e)}</span>
      {#if hasBatt}<span class="chip" class:low={batt <= 15}><Icon icon={battIcon} size="1em" />{formatNumber(batt, 0)}%</span>{/if}
    </div>
    <div class="mid">
      <button class="orb" class:dead style="width:{ringSize}px;height:{ringSize}px" onclick={main} data-stop disabled={dead} aria-label={mainLabel}>{@render orb(ringSize)}</button>
    </div>
    <div class="foot">
      <div class="big">{show('state') ? label : ''}</div>
      {#if problem}<div class="sub bad">{problem}</div>
      {:else if stats.length}<div class="sub">{stats.map((x) => stateText(x)).join(' · ')}</div>{/if}
    </div>
    {#if !dead && (show('controls') || canLocate || fans.length)}
      <div class="btns" data-stop>
        {#if show('controls')}
          <button class="main" class:go={!cleaning} onclick={main}><Icon icon={mainIcon} size="1.1em" /> {mainLabel}</button>
        {/if}
        {#if goHome}<button onclick={() => call('return_to_base')}><Icon icon="mdi:home-import-outline" size="1.1em" /> Dock</button>{/if}
        {#if canLocate}<button class="sq" onclick={() => call('locate')} title="Make it beep"><Icon icon="mdi:map-marker-radius" size="1.1em" /></button>{/if}
        {#if fans.length}
          <select value={e.attributes.fan_speed} onchange={(ev) => call('set_fan_speed', { fan_speed: ev.currentTarget.value })} title="Suction power">
            {#each fans as f}<option value={f}>{cap(f)}</option>{/each}
          </select>
        {/if}
      </div>
    {/if}
  {/if}
</div>

{#snippet orb(size)}
  <svg class="ring" viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r={R} class="track" />
    {#if hasBatt}<circle cx="50" cy="50" r={R} class="fill" style="stroke:{battColor}" stroke-dasharray={C} stroke-dashoffset={C * (1 - Math.max(0, Math.min(100, batt)) / 100)} />
    {:else}<circle cx="50" cy="50" r={R} class="fill" stroke-dasharray={C} stroke-dashoffset="0" />{/if}
  </svg>
  <span class="bot"><Icon icon={st === 'error' ? 'mdi:robot-vacuum-alert' : 'mdi:robot-vacuum'} size="{size * 0.44}px" /></span>
{/snippet}

<style>
  .vc { position: relative; height: 100%; display: flex; flex-direction: column; gap: 6px; isolation: isolate; }
  .glow { position: absolute; inset: calc(var(--pad) * -1); z-index: -1; background: radial-gradient(90% 70% at 50% 42%, color-mix(in srgb, var(--c) 17%, transparent), transparent 70%); transition: background .5s; pointer-events: none; }
  .head { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .name { font-weight: 600; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chip { display: inline-flex; align-items: center; gap: 3px; font-size: .78em; color: var(--muted); }
  .chip.low { color: #ff8a8a; }
  .mid { flex: 1; min-height: 0; display: grid; place-items: center; }
  .orb { position: relative; flex: none; padding: 0; border: 0; border-radius: 50%; background: color-mix(in srgb, var(--c) 12%, rgba(255,255,255,.03)); color: var(--c); display: grid; place-items: center; transition: background .4s, color .4s, transform .15s; }
  .orb:active:not(:disabled) { transform: scale(.95); }
  .orb.dead { opacity: .55; }
  .ring { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); filter: drop-shadow(0 0 4px color-mix(in srgb, var(--c) 45%, transparent)); }
  .track { fill: none; stroke: rgba(255,255,255,.08); stroke-width: 5; }
  .fill { fill: none; stroke: var(--c); stroke-width: 5; stroke-linecap: round; transition: stroke-dashoffset 1s, stroke .5s; }
  .bot { position: relative; display: grid; place-items: center; }
  /* Sweeps side to side while cleaning, pulses on its way home. */
  .cleaning .bot { animation: sweep 2.4s ease-in-out infinite; }
  .returning .bot { animation: pulse 1.6s ease-in-out infinite; }
  .error .bot { animation: pulse 1s ease-in-out infinite; }
  @keyframes sweep { 0%, 100% { transform: translateX(-7%) rotate(-10deg); } 50% { transform: translateX(7%) rotate(10deg); } }
  @keyframes pulse { 50% { opacity: .5; } }
  .foot { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .big { font-weight: 600; font-size: 1.1em; color: var(--c); min-height: 1.3em; }
  .sub { font-size: .8em; color: var(--muted); }
  .sub.bad { color: #ff8a8a; }
  .btns { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; justify-content: center; }
  .btns.side { flex-wrap: nowrap; flex: none; }
  .btns button { display: inline-flex; align-items: center; gap: 5px; padding: 7px 12px; border-radius: 11px; border: 0; background: rgba(255,255,255,.07); color: inherit; font: inherit; font-size: .85em; }
  .btns .sq { padding: 7px 9px; }
  .btns .main { background: color-mix(in srgb, var(--c) 24%, rgba(255,255,255,.04)); font-weight: 600; }
  .btns .main.go { background: color-mix(in srgb, #5bd88f 26%, rgba(255,255,255,.04)); }
  .btns select { font-size: .8em; padding: 6px 8px; border-radius: 10px; background: rgba(255,255,255,.06); max-width: 120px; }
  .small { flex-direction: row; align-items: center; gap: 10px; }
  .txt { flex: 1; min-width: 0; }
  .st { font-size: .85em; color: var(--c); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
