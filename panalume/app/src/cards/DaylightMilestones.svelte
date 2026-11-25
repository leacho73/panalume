<script module>
  const coords = (v) => {
    const m = String(v ?? '').trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    return m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180 ? { lat: +m[1], lon: +m[2] } : null;
  };

  export const meta = {
    type: 'daylight-milestones', name: 'Daylight milestones', icon: 'mdi:weather-sunset-up', category: 'Info',
    size: { w: 400, h: 200 }, tap: 'none',
    watch: (p) => (coords(p.location) ? [] : ['zone.home']),
    defaults: { name: 'Daylight milestones', bearable: 10, evening: '17:00' },
    sections: [
      { key: 'head', label: 'Title' },
      { key: 'track', label: 'Milestones ahead' },
      { key: 'list', label: 'All milestones' },
    ],
    fields: [
      { key: 'name', label: 'Title', type: 'text', section: 'head' },
      { key: 'location', label: 'Location: latitude, longitude (blank = home)', type: 'text', placeholder: 'e.g. 51.5, -0.12', hint: 'Follow the light somewhere else, like a holiday home.' },
      { key: 'bearable', label: 'Bearable day length (hours, blank = off)', type: 'number', placeholder: 'e.g. 10', hint: 'Becomes a milestone: the day there is this much light again.' },
      { key: 'evening', label: 'Usable evenings: sunset after (blank = off)', type: 'text', placeholder: 'e.g. 17:00', hint: 'Becomes a milestone, e.g. 17:00 for daylight after work.' },
      { key: 'hour12', label: '12-hour', type: 'bool' },
    ],
  };
</script>

<script>
  // Counts down to the next moment the light starts coming back: evenings getting
  // lighter (before the shortest day), the shortest day, lighter mornings, then the
  // thresholds chosen in the editor, the equinox and the longest day.
  import { t } from '../lib/tpl.js';
  import { states } from '../lib/ha.svelte.js';
  import { clock } from '../lib/clock.svelte.js';
  import { season } from '../lib/seasons.js';
  import Icon from '../components/Icon.svelte';
  let { props, w = 400, h = 200 } = $props();
  const show = (k) => !props.hide?.[k];

  const home = $derived(states.get('zone.home')?.attributes || {});
  const place = $derived(coords(t(props.location)) || (home.latitude != null ? { lat: home.latitude, lon: home.longitude } : null));

  // A setting missing from the props (a hand-written layout) keeps its default; one
  // cleared in the editor ('') turns that milestone off.
  const bearable = $derived.by(() => {
    if (props.bearable === undefined) return 600;
    const v = Number(props.bearable);
    return props.bearable !== '' && v > 0 && v < 24 ? Math.round(v * 60) : null;
  });
  const evening = $derived.by(() => {
    if (props.evening === undefined) return 1020;
    const m = /^(\d{1,2})[:.](\d{2})$/.exec(String(t(props.evening) ?? '').trim());
    return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
  });

  // Recompute only when the date changes.
  const dayStart = $derived(new Date(clock.now).setHours(0, 0, 0, 0));
  const s = $derived(place ? season(dayStart + 12 * 3600e3, place.lat, place.lon, { bearable, evening }) : null);
  const next = $derived(s ? s.points[s.next] : null);
  const days = $derived(s && next ? s.daysUntil(next) : 0);

  const clockText = (min) => new Date(2000, 0, 1, Math.floor(min / 60), min % 60)
    .toLocaleTimeString([], { hour: props.hour12 ? 'numeric' : '2-digit', minute: '2-digit', hour12: !!props.hour12 });
  const hoursText = (min, short) => {
    const hh = Math.floor(min / 60), mm = min % 60;
    if (mm === 0 || mm === 30) return `${hh}${mm ? '½' : ''}${short ? ' h' : ' hours'}`;
    return `${hh}h ${mm}m`;
  };
  const words = (p) => ({
    evenings: { title: 'Evenings get lighter', label: ['Lighter', 'evenings'], icon: 'mdi:weather-sunset-down', detail: 'Sunsets stop getting earlier, before the shortest day.' },
    grow: { title: 'Days start growing', label: ['Days', 'grow'], icon: 'mdi:trending-up', detail: 'The shortest day. Every day after it is longer.' },
    'sun-returns': { title: 'The sun returns', label: ['Sun', 'returns'], icon: 'mdi:weather-sunset-up', detail: 'First sunrise after the polar night.' },
    mornings: { title: 'Mornings get lighter', label: ['Lighter', 'mornings'], icon: 'mdi:weather-sunset-up', detail: 'Sunrises stop getting later.' },
    sunset: { title: `Sunset after ${clockText(p.minutes)}`, label: ['Sunset', clockText(p.minutes)], icon: 'mdi:weather-sunset-down', detail: 'Daylight after a normal working day.' },
    bearable: { title: `${hoursText(p.minutes)} of light`, label: [`${hoursText(p.minutes, true)} of`, 'light'], icon: 'mdi:white-balance-sunny', detail: 'Back above your bearable day length.' },
    equal: { title: 'Day longer than night', label: ['Day beats', 'night'], icon: 'mdi:circle-half-full', detail: 'More light than dark until autumn.' },
    longest: { title: 'Longest day', label: ['Longest', 'day'], icon: 'mdi:weather-sunny', detail: 'The top of the year.' },
  })[p.kind];

  const date = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const countdown = (n) => (n < 1 ? 'Today' : n === 1 ? 'Tomorrow' : `in ${n} days`);
  const dur = (ms) => { const m = Math.max(0, Math.round(ms / 60e3)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
  const passed = $derived(s ? `${s.next} of ${s.points.length} milestones passed. Next: ${words(next).title}, ${countdown(days).toLowerCase()}.` : '');

  const strip = $derived(h < 120);
  const compact = $derived(!strip && w < 300);
  const tall = $derived(!strip && !compact && h >= 330);
  const nodes = $derived(w >= 380 ? 5 : w >= 330 ? 4 : 3);

  // Keeping the last finished milestone on screen shows progress, not only what is still ahead.
  const win = $derived.by(() => {
    if (!s) return [];
    const n = Math.min(nodes, s.points.length);
    const from = Math.max(0, Math.min(s.next - 1, s.points.length - n));
    return s.points.slice(from, from + n);
  });
  const centre = (i) => ((i + 0.5) / win.length) * 100;
  // With no finished milestone on screen the left edge is "now"; otherwise "now"
  // travels between the last finished milestone and the next one.
  const nowAt = $derived.by(() => {
    const i = win.findIndex((p) => p.key === next?.key);
    return i > 0 ? centre(i - 1) + (centre(i) - centre(i - 1)) * s.progress : 0;
  });
</script>

{#snippet count()}
  {#if days < 2}<div class="big words">{countdown(days)}</div>
  {:else}<div class="big">{days}<small>days</small></div>{/if}
{/snippet}

{#snippet segments(extra)}
  <div class="segs {extra}" role="img" aria-label={passed}>
    {#each s.points as p, i (p.key)}<i><em style="width:{i < s.next ? 100 : i === s.next ? s.progress * 100 : 0}%"></em></i>{/each}
  </div>
{/snippet}

<div class="dm" class:strip class:compact class:tall>
  {#if !s || !next}
    <div class="wait"><Icon icon="mdi:weather-sunset-up" size="1.4em" /> Waiting for Home Assistant…</div>
  {:else if strip}
    {@render count()}
    <div class="what">
      <b>{words(next).title}</b>
      <span class="gold">{date(next.day)}</span>
      {#if show('track')}{@render segments('')}{/if}
    </div>
  {:else}
    {#if show('head') && !(compact && h < 200)}
      <div class="head">
        <div class="title"><Icon icon="mdi:white-balance-sunny" size="1.15em" /><span>{t(props.name) || 'Daylight milestones'}</span></div>
        {#if !compact}
          <div class="stat">{#if s.gained}<b class="gold">+{dur(s.gained)}</b> since {date(s.shortest.day)}{:else}<b>{dur(s.today.daylight)}</b> today{/if}</div>
        {/if}
      </div>
    {/if}

    {#if compact}
      {@render count()}
      <div class="ctitle">{words(next).title}</div>
      <div class="gold cdate">{date(next.day)}</div>
      {#if show('track')}{@render segments('bottom')}{/if}
    {:else}
      <div class="headline">
        <div class="ntitle">{words(next).title}</div>
        <div class="gold when">{countdown(days)} · {date(next.day)}</div>
      </div>

      {#if show('track')}
        <div class="track" style="--now:{nowAt}%" role="img" aria-label={passed}>
          <div class="line" aria-hidden="true"></div>
          <div class="done-line" aria-hidden="true"></div>
          <div class="now" aria-hidden="true"></div>
          {#each win as p, i (p.key)}
            {@const st = p.key === next.key ? 'next' : s.done(p) ? 'done' : 'ahead'}
            <div class="node {st}" style="left:{centre(i)}%; width:{100 / win.length}%" aria-hidden="true">
              <small>{date(p.day)}</small>
              <span class="slot"><span class="mark">{#if st === 'done'}<Icon icon="mdi:check-bold" size=".7em" />{/if}</span></span>
              <span class="lbl">{words(p).label[0]}<br />{words(p).label[1]}</span>
            </div>
          {/each}
        </div>
      {/if}

      {#if tall && show('list')}
        <div class="list">
          {#each s.points as p (p.key)}
            {@const st = p.key === next.key ? 'next' : s.done(p) ? 'done' : 'ahead'}
            <div class="row {st}">
              <span class="dot"><Icon icon={st === 'done' ? 'mdi:check-bold' : words(p).icon} size=".9em" /></span>
              <div class="rt"><b>{words(p).title}</b><small>{words(p).detail}</small></div>
              <div class="rd"><b>{date(p.day)}</b><small>{st === 'done' ? 'Done' : countdown(s.daysUntil(p))}</small></div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .dm { --gold: #ffd58a; --hole: #1b1e33; --ink: #15172f; height: 100%; display: flex; flex-direction: column; gap: 6px; min-height: 0; }
  .wait { margin: auto; color: var(--muted); display: flex; gap: 8px; align-items: center; font-size: .9em; }
  .gold { color: var(--gold); }
  .head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; white-space: nowrap; }
  .title { display: flex; align-items: center; gap: 8px; font-weight: 600; min-width: 0; }
  .title :global(svg) { color: var(--gold); flex: none; }
  .title span { overflow: hidden; text-overflow: ellipsis; }
  .stat { color: var(--muted); font-size: .85em; font-variant-numeric: tabular-nums; }
  .stat b { color: var(--text); font-weight: 600; }
  .stat b.gold { color: var(--gold); }

  .headline { margin-top: 2px; }
  .ntitle { font-size: 1.45em; font-weight: 650; letter-spacing: -.015em; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .when { font-size: .85em; font-weight: 500; margin-top: 2px; font-variant-numeric: tabular-nums; }

  /* Sized in em from one font size, so the line keeps passing through the markers when
     the card's Font size changes: date row 1.2em, marker slot 1.8em, line at 1.2 + 0.9. */
  .track { position: relative; flex: none; font-size: .68em; height: 5.8em; margin-top: auto; font-variant-numeric: tabular-nums; }
  .line, .done-line { position: absolute; top: 2.1em; height: 0; left: 4px; }
  .line { right: 4px; border-top: 1.5px dashed rgba(255,255,255,.22); transform: translateY(-50%); }
  .done-line { width: max(0px, calc(var(--now) - 4px)); border-top: 2.5px solid var(--gold); border-radius: 2px; opacity: .9; transform: translateY(-50%); }
  .now { position: absolute; top: 2.1em; left: max(4px, var(--now)); width: .65em; height: .65em; transform: translate(-50%, -50%); border-radius: 50%; background: var(--text); box-shadow: 0 0 0 .4em rgba(255,255,255,.18); z-index: 2; }
  .node { position: absolute; top: 0; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; text-align: center; }
  .node small { height: 1.2em; line-height: 1.2em; font-size: 1em; font-weight: 600; color: var(--muted); white-space: nowrap; }
  .slot { height: 1.8em; display: grid; place-items: center; }
  .mark { width: .75em; height: .75em; border-radius: 50%; border: 1.3px solid rgba(255,255,255,.55); background: var(--hole); display: grid; place-items: center; z-index: 1; }
  .lbl { line-height: 1.25; color: var(--muted); white-space: nowrap; }
  .node.next small, .node.next .lbl { color: var(--gold); font-weight: 650; }
  .node.next .mark { width: 1.2em; height: 1.2em; border: 2px solid var(--gold); background: radial-gradient(circle, var(--gold) 0 .24em, transparent .28em); box-shadow: 0 0 0 .45em color-mix(in srgb, var(--gold) 18%, transparent); }
  .node.done small, .node.done .lbl { color: var(--gold); opacity: .7; }
  .node.done .mark { width: 1em; height: 1em; border: none; background: var(--gold); color: var(--ink); }

  .tall .track { margin-top: 10px; }
  .list { flex: 1; display: flex; flex-direction: column; gap: 9px; padding-top: 10px; margin-top: 4px; border-top: 1px solid rgba(255,255,255,.07); overflow: auto; min-height: 0; }
  .row { display: flex; align-items: center; gap: 10px; }
  .row.done { opacity: .55; }
  .dot { flex: none; width: 1.65em; height: 1.65em; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.08); color: var(--muted); }
  .row.next .dot, .row.done .dot { background: var(--gold); color: var(--ink); }
  .rt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .rt b, .rd b { font-weight: 600; font-size: .9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rt small, .rd small { color: var(--muted); font-size: .72em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rd { display: flex; flex-direction: column; text-align: right; font-variant-numeric: tabular-nums; }
  .row.next .rd small { color: var(--gold); }

  .segs { display: flex; gap: 4px; height: 4px; }
  .segs i { flex: 1; border-radius: 2px; background: rgba(255,255,255,.18); overflow: hidden; }
  .segs em { display: block; height: 100%; background: var(--gold); border-radius: 2px; }
  .segs.bottom { margin-top: auto; }

  .big { font-size: 2.6em; font-weight: 650; line-height: 1; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
  .big small { font-size: .4em; font-weight: 500; color: var(--muted); margin-left: 4px; letter-spacing: 0; }
  .big.words { font-size: 1.9em; }
  .ctitle { font-weight: 600; font-size: .9em; line-height: 1.2; margin-top: 4px; }
  .cdate { font-size: .85em; font-weight: 500; }

  .strip { flex-direction: row; align-items: center; gap: 14px; }
  .strip .big { font-size: 2.1em; }
  .strip .big.words { font-size: 1.5em; }
  .strip .what { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .strip .what b { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .strip .what span { font-size: .85em; }
  .strip .segs { margin-top: 4px; }
</style>
