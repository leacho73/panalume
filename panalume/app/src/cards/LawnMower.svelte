<script module>
  import { states } from '../lib/ha.svelte.js';
  // Finds the mower, and the battery / next start / hours / error sensors that
  // integrations (Husqvarna Automower, Gardena, Worx Landroid, Mammotion…) add
  // next to it. Their sensors may be named after the device (sensor.robbi_…)
  // rather than the mower entity (lawn_mower.robbi_lawn_mower), so try both.
  function autofill() {
    const ids = [...states.keys()].filter((id) => id.startsWith('lawn_mower.')).sort();
    const m = ids.find((id) => states.get(id)?.state !== 'unavailable') || ids[0];
    if (!m) return {};
    const full = m.slice(11);
    const prefixes = [full, full.replace(/_(lawn_mower|mower|robot)$/, '')];
    const first = (...n) => prefixes.flatMap((p) => n.map((x) => `sensor.${p}_${x}`)).find((id) => states.has(id)) || '';
    return {
      entity: m,
      battery: first('battery', 'battery_level'),
      next: first('next_start', 'next_schedule', 'next_scheduled_start', 'next_mowing'),
      hours: first('operating_hours', 'total_running_time', 'total_cutting_time', 'blade_runtime'),
      error: first('error', 'last_error', 'mower_error'),
    };
  }
  export const meta = {
    type: 'lawn-mower', name: 'Lawn mower', icon: 'mdi:robot-mower', category: 'Controls',
    size: { w: 300, h: 250 }, tap: 'none', hold: 'more-info',
    defaults: { entity: '' },
    autofill,
    sections: [
      { key: 'state', label: 'Status' }, { key: 'activity', label: 'Activity' }, { key: 'battery', label: 'Battery', section: 'battery' },
      { key: 'next', label: 'Next start', section: 'next' }, { key: 'hours', label: 'Operating hours', section: 'hours' }, { key: 'controls', label: 'Start / pause / dock', section: 'controls' },
    ],
    fields: [
      { key: 'entity', label: 'Lawn mower', type: 'entity', domain: 'lawn_mower' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'battery', label: 'Battery (optional, uses the mower\'s own if it has one)', type: 'entity', domain: 'sensor', section: 'battery' },
      { key: 'next', label: 'Next scheduled start (optional)', type: 'entity', domain: 'sensor', section: 'next' },
      { key: 'hours', label: 'Operating hours (optional, uses the mower\'s own if it has one)', type: 'entity', domain: 'sensor', section: 'hours' },
      { key: 'error', label: 'Error message (optional)', type: 'entity', domain: 'sensor' },
    ],
  };
</script>

<script>
  // A robot lawn mower: a big round button (a ring that shows the battery, when
  // there is one) that starts, pauses or resumes mowing, the status under it
  // with the integration's own activity, the next scheduled start and operating
  // hours, and a Dock button. It only shows what the mower says it can do.
  // Small cards become a single row.
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { stateWord } from '../lib/i18n.svelte.js';
  import { name, formatNumber } from '../lib/entity.js';
  import { callService } from '../lib/ha.svelte.js';
  import { clock } from '../lib/clock.svelte.js';
  let { props, w = 300, h = 250 } = $props();
  const show = (k) => !props.hide?.[k];

  const e = $derived(ent(props.entity));
  const st = $derived(e?.state || 'unavailable');
  const dead = $derived(!e || st === 'unavailable' || st === 'unknown');

  const LOOK = {
    mowing: ['Mowing', '#7ed957'], returning: ['Heading home', '#b48cff'], paused: ['Paused', '#ffb547'], docked: ['Docked', '#4fb4ff'],
    error: ['Needs attention', '#ff6b6b'], unavailable: ['Unavailable', '#8a94a8'], unknown: ['Unknown', '#8a94a8'],
  };
  const cap = (s) => String(s).replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  const [label0, color] = $derived(LOOK[st] || [cap(st), '#8a94a8']);
  const label = $derived(stateWord('lawn_mower', null, st) || label0);
  // The integration's own, more detailed activity (e.g. Gardena's PARKED_TIMER).
  const ACTIVITY = {
    ok_cutting: 'Cutting', ok_cutting_timer_overridden: 'Cutting (timer overridden)', ok_searching: 'Looking for the dock', ok_leaving: 'Leaving the dock',
    ok_charging: 'Charging', parked_timer: 'Parked until the next start', parked_park_selected: 'Parked until further notice', parked_autotimer: 'Parked (weather timer)',
    parked_frost: 'Parked (frost)', paused: 'Paused', stopped_in_garden: 'Stopped in the garden', none: '', off: '',
  };
  const activity = $derived.by(() => {
    const v = e?.attributes.activity;
    if (!v || !show('activity')) return '';
    const k = String(v).toLowerCase();
    const s = k in ACTIVITY ? ACTIVITY[k] : cap(k.replace(/^ok_/, ''));
    return !s || s.toLowerCase() === label.toLowerCase() ? '' : s;
  });

  // What the mower supports (HA's feature flags). If it doesn't say, assume the basics.
  const feat = $derived(Number(e?.attributes.supported_features) || 0);
  const can = (bit) => (feat ? (feat & bit) === bit : true);
  const START = 1, PAUSE = 2, DOCK = 4;

  const mowing = $derived(st === 'mowing');
  const batt = $derived.by(() => {
    if (!show('battery')) return NaN;
    const v = props.battery ? ent(props.battery)?.state : e?.attributes.battery_level;
    return v == null || v === '' ? NaN : Number(v);
  });
  const hasBatt = $derived(Number.isFinite(batt));

  const call = (svc) => e && callService('lawn_mower', svc, {}, { entity_id: e.entity_id });
  const mainLabel = $derived(mowing ? (can(PAUSE) ? 'Pause' : 'Dock') : st === 'paused' ? 'Resume' : 'Start');
  const mainIcon = $derived(mowing ? (can(PAUSE) ? 'mdi:pause' : 'mdi:home-import-outline') : 'mdi:play');
  const main = () => { if (!dead) call(mowing ? (can(PAUSE) ? 'pause' : 'dock') : 'start_mowing'); };
  const canMain = $derived(mowing ? can(PAUSE) || can(DOCK) : can(START));
  const goHome = $derived(show('controls') && can(DOCK) && !dead && !['docked', 'returning'].includes(st));

  // Next scheduled start: "Today 14:00", "Tomorrow 09:00" or "Sat 09:00".
  const next = $derived.by(() => {
    if (!show('next') || !props.next) return '';
    const s = ent(props.next)?.state;
    const d = new Date(s);
    if (!s || isNaN(d)) return '';
    const day0 = (x) => { const y = new Date(x); y.setHours(0, 0, 0, 0); return y; };
    const diff = Math.round((day0(d) - day0(clock.now)) / 864e5);
    if (diff < 0) return '';
    const hm = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
    return `Next ${diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short' })} ${hm}`;
  });
  const hours = $derived.by(() => {
    if (!show('hours')) return '';
    const v = props.hours ? ent(props.hours)?.state : e?.attributes.operating_hours;
    const n = Number(v);
    return v == null || v === '' || !Number.isFinite(n) ? '' : `${formatNumber(n, 0)} h`;
  });
  const problem = $derived.by(() => {
    if (st !== 'error') return '';
    const m = ent(props.error)?.state ?? e?.attributes.last_error_code ?? e?.attributes.error;
    return m && !['unavailable', 'unknown', 'none', 'no_error', 'ok', '0'].includes(String(m).toLowerCase()) ? cap(m) : '';
  });
  const facts = $derived([activity, next, hours].filter(Boolean));

  const small = $derived(h < 150 || w < 240);
  const ringSize = $derived(Math.max(56, Math.min(w - 48, h - 28 - 34 - (facts.length || problem ? (facts.join(' · ').length * 6.5 > w - 40 ? 40 : 22) : 0) - 52 - 20, 170)));
  const R = 44, C = 2 * Math.PI * R;
  const battColor = $derived(batt <= 15 ? '#ff6b6b' : batt <= 30 ? '#ffb547' : color);
  const battIcon = $derived(batt <= 15 ? 'mdi:battery-alert-variant-outline' : batt <= 40 ? 'mdi:battery-low' : batt <= 75 ? 'mdi:battery-medium' : 'mdi:battery-high');
</script>

<div class="lm" class:small class:mowing class:returning={st === 'returning'} class:error={st === 'error'} style="--c:{color}">
  <div class="glow"></div>
  {#if small}
    <button class="orb" class:dead style="width:46px;height:46px" onclick={main} data-stop disabled={dead || !canMain} aria-label={mainLabel}>{@render orb(46)}</button>
    <div class="txt">
      <div class="name">{t(props.name) || name(e)}</div>
      <div class="st">{[show('state') ? (problem || label) : '', hasBatt ? `${formatNumber(batt, 0)}%` : ''].filter(Boolean).join(' · ')}</div>
    </div>
    {#if show('controls') && w >= 200 && !dead}
      <div class="btns side" data-stop>
        {#if canMain}<button class="sq" onclick={main} title={mainLabel}><Icon icon={mainIcon} size="1.1em" /></button>{/if}
        {#if goHome && w >= 260}<button class="sq" onclick={() => call('dock')} title="Send home"><Icon icon="mdi:home-import-outline" size="1.1em" /></button>{/if}
      </div>
    {/if}
  {:else}
    <div class="head">
      <span class="name">{t(props.name) || name(e)}</span>
      {#if hasBatt}<span class="chip" class:low={batt <= 15}><Icon icon={battIcon} size="1em" />{formatNumber(batt, 0)}%</span>{/if}
    </div>
    <div class="mid">
      <button class="orb" class:dead style="width:{ringSize}px;height:{ringSize}px" onclick={main} data-stop disabled={dead || !canMain} aria-label={mainLabel}>{@render orb(ringSize)}</button>
    </div>
    <div class="foot">
      <div class="big">{show('state') ? label : ''}</div>
      {#if problem}<div class="sub bad">{problem}</div>
      {:else if facts.length}<div class="sub">{facts.join(' · ')}</div>{/if}
    </div>
    {#if !dead && show('controls')}
      <div class="btns" data-stop>
        {#if canMain}<button class="main" class:go={!mowing} onclick={main}><Icon icon={mainIcon} size="1.1em" /> {mainLabel}</button>{/if}
        {#if goHome}<button onclick={() => call('dock')}><Icon icon="mdi:home-import-outline" size="1.1em" /> Dock</button>{/if}
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
  <span class="bot"><Icon icon={st === 'error' ? 'mdi:robot-mower-outline' : 'mdi:robot-mower'} size="{size * 0.44}px" /></span>
{/snippet}

<style>
  .lm { position: relative; height: 100%; display: flex; flex-direction: column; gap: 6px; isolation: isolate; }
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
  /* Drives up and down the lawn while mowing, pulses on its way home. */
  .mowing .bot { animation: rows 3s ease-in-out infinite; }
  .returning .bot { animation: pulse 1.6s ease-in-out infinite; }
  .error .bot { animation: pulse 1s ease-in-out infinite; }
  @keyframes rows { 0%, 100% { transform: translateX(-8%); } 45%, 55% { transform: translateX(8%) scaleX(-1); } }
  @keyframes pulse { 50% { opacity: .5; } }
  .foot { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 0; }
  .big { font-weight: 600; font-size: 1.1em; color: var(--c); min-height: 1.3em; }
  .sub { font-size: .8em; color: var(--muted); max-width: 100%; text-align: center; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; }
  .sub.bad { color: #ff8a8a; }
  .btns { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; justify-content: center; }
  .btns.side { flex-wrap: nowrap; flex: none; }
  .btns button { display: inline-flex; align-items: center; gap: 5px; padding: 7px 12px; border-radius: 11px; border: 0; background: rgba(255,255,255,.07); color: inherit; font: inherit; font-size: .85em; }
  .btns .sq { padding: 7px 9px; }
  .btns .main { background: color-mix(in srgb, var(--c) 24%, rgba(255,255,255,.04)); font-weight: 600; }
  .btns .main.go { background: color-mix(in srgb, #7ed957 26%, rgba(255,255,255,.04)); }
  .small { flex-direction: row; align-items: center; gap: 10px; }
  .txt { flex: 1; min-width: 0; }
  .st { font-size: .85em; color: var(--c); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
