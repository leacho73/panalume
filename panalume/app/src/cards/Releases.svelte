<script module>
  import { states } from '../lib/ha.svelte.js';
  // The Seerr-family sensor that carries a request list, and the *arr calendars.
  const autofill = () => {
    const sensors = [...states.keys()].filter((id) => id.startsWith('sensor.') && /seerr|overseerr|jellyseerr/i.test(id));
    const sensor = sensors.find((id) => Array.isArray(states.get(id)?.attributes?.items)) || sensors[0] || '';
    const calendars = [...states.keys()].filter((id) => id.startsWith('calendar.') && /radarr|sonarr/i.test(id)).sort();
    return { sensor, calendars: calendars.slice(0, 2) };
  };
  export const meta = {
    type: 'releases', name: 'Release countdown', icon: 'mdi:calendar-arrow-right', category: 'Media',
    size: { w: 380, h: 340 }, tap: 'none',
    defaults: { source: 'both', sensor: '', calendars: [], days: 60, max: 8, who: true, next: true },
    autofill,
    sections: [
      { key: 'head', label: 'Title' },
      { key: 'next', label: 'The next release' },
      { key: 'list', label: 'What comes after' },
    ],
    fields: [
      { key: 'source', label: 'Where the dates come from', type: 'select', options: [
        { value: 'both', label: 'Both: the request queue and the release calendars' },
        { value: 'dates', label: 'Release dates only (the Radarr and Sonarr calendars)' },
        { value: 'requests', label: 'The Seerr request queue only' },
      ] },
      { key: 'calendars', label: 'Release calendars', type: 'entities', domain: 'calendar', hint: 'Radarr for film releases, Sonarr for episode air dates. Both calendars are published by the integrations.' },
      { key: 'sensor', label: 'Seerr requests sensor', type: 'entity', domain: 'sensor', hint: 'A sensor whose items list is the queue: Seerr, Overseerr or Jellyseerr.' },
      { key: 'name', label: 'Title (blank = Release countdown)', type: 'text' },
      { key: 'days', label: 'How far ahead (days)', type: 'number' },
      { key: 'max', label: 'Rows in the list', type: 'number' },
      { key: 'who', label: 'Show who asked', type: 'bool' },
      { key: 'next', label: 'Show the next one on its own', type: 'bool' },
    ],
  };
</script>

<script>
  // How long until what is coming: releases from the Radarr and Sonarr
  // calendars, the queue from a Seerr-family sensor, or both. A request that
  // also sits on a calendar gets its release date, so the card answers "when
  // will this be out" as well as "what am I waiting for".
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { name } from '../lib/entity.js';
  import { clock } from '../lib/clock.svelte.js';
  let { props, w = 380, h = 340 } = $props();
  const show = (k) => !props.hide?.[k];

  const source = $derived(props.source === 'dates' || props.source === 'requests' ? props.source : 'both');
  const wantDates = $derived(source !== 'requests');
  const wantQueue = $derived(source !== 'dates');
  const cals = $derived((props.calendars || []).map((id) => String(t(id) || '').trim()).filter((id) => id.startsWith('calendar.')));
  const sensor = $derived(props.sensor?.startsWith('sensor.') ? props.sensor : '');
  const look = $derived(Math.min(365, Math.max(1, Number(props.days) || 60)));
  const want = $derived(Math.min(12, Math.max(1, Number(props.max) || 8)));
  // A queue-only card is titled by its sensor; "Release countdown" would be a lie
  // on a card that is showing requests.
  const title = $derived(t(props.name) || (source === 'requests' ? name(ent(sensor)) || 'Requests' : 'Release countdown'));
  const compact = $derived(h < 180 || w < 250);

  // What kind of release an event is, from the integration's release_type.
  const KINDS = {
    cinemaRelease: { label: 'Cinemas', icon: 'mdi:theater' },
    digitalRelease: { label: 'Digital', icon: 'mdi:laptop' },
    physicalRelease: { label: 'Disc', icon: 'mdi:disc' },
    airDate: { label: 'Airs', icon: 'mdi:television-classic' },
  };
  const epKind = { label: 'Airs', icon: 'mdi:television-classic' };
  const reqKind = { label: 'Requested', icon: 'mdi:account-clock-outline' };
  // Titles are compared without punctuation or case, so "Spider-Man: Brand New
  // Day" on the calendar matches the same title in the request queue.
  const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  let events = $state([]);
  let loaded = $state(false);
  let error = $state('');
  let refresh = $state(0);
  const stamp = $derived(cals.map((id) => states.get(id)?.last_updated || '').join('|'));

  $effect(() => {
    const i = setInterval(() => refresh++, 5 * 60e3);
    return () => clearInterval(i);
  });

  // All-day releases (films) come as dates; episodes as date-times.
  const day0 = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const fromDate = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };

  function norm(ev, cal) {
    const allDay = !!ev.start?.date && !ev.start?.dateTime;
    const start = allDay ? fromDate(ev.start.date) : new Date(ev.start?.dateTime);
    if (isNaN(start)) return null;
    const raw = String(ev.summary || '').trim() || '(No title)';
    // Sonarr names an episode "Show - S01E02 - Episode", but not always: the
    // number can sit straight after the title ("Heartland (2007) (CA)S20E05").
    // So the season and episode marker is what is looked for, not a separator.
    const m = raw.match(/\bS(\d{1,2})E(\d{1,3})\b/i);
    let title = raw;
    let sub = '';
    if (m) {
      title = raw.slice(0, m.index).replace(/[\s\-–:|]+$/, '').trim() || raw;
      const rest = raw.slice(m.index + m[0].length).replace(/^[\s\-–:|]+/, '').trim();
      sub = [`S${m[1]}E${m[2]}`, rest].filter(Boolean).join(' · ');
    }
    const kind = KINDS[ev.release_type] || (m ? epKind : null);
    return {
      key: `${cal}|${ev.uid || ''}|${start.getTime()}|${raw}`,
      title,
      sub,
      date: start,
      allDay,
      kind,
      cal,
    };
  }

  // Calendars are only fetched when the card uses them, and again when one of
  // them reports a new state or five minutes have gone by.
  $effect(() => {
    refresh; stamp;
    if (!wantDates || !cals.length) { events = []; loaded = true; return; }
    const from = day0(new Date());
    const to = new Date(from); to.setDate(to.getDate() + look);
    const q = `?start=${encodeURIComponent(from.toISOString())}&end=${encodeURIComponent(to.toISOString())}`;
    let alive = true;
    loaded = false;
    Promise.all(
      cals.map((id) =>
        fetch(`ha/api/calendars/${id}${q}`)
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${name(ent(id)) || id}: ${r.status}`))))
          .then((evs) => evs.map((ev) => norm(ev, id))),
      ),
    )
      .then((all) => {
        if (!alive) return;
        events = all.flat().filter(Boolean).sort((a, b) => a.date - b.date);
        error = '';
        loaded = true;
      })
      .catch((e) => { if (alive) { error = e.message || 'Could not load the calendars'; loaded = true; } });
    return () => (alive = false);
  });

  // The request queue, with a release date attached where a calendar carries one.
  const queue = $derived.by(() => {
    if (!wantQueue || !sensor) return [];
    const items = states.get(sensor)?.attributes?.items;
    if (!Array.isArray(items)) return [];
    const byTitle = new Map(events.map((e) => [key(e.title), e]));
    return items.map((it, i) => {
      const hit = byTitle.get(key(it?.title));
      return {
        key: `req|${it?.id ?? i}`,
        title: String(it?.title || 'Untitled'),
        sub: [it?.year, it?.type, props.who !== false ? it?.by : ''].filter(Boolean).join(' · '),
        date: hit ? hit.date : null,
        allDay: hit ? hit.allDay : true,
        kind: hit ? hit.kind : reqKind,
        waiting: !hit,
        id: it?.id,
      };
    });
  });
  const waiting = $derived(queue.filter((q) => q.waiting).length);

  const today = $derived(day0(clock.now).getTime());
  const daysTo = (d) => Math.round((day0(d) - today) / 864e5);

  // One list, earliest first, then the requests that have no date yet.
  const rows = $derived.by(() => {
    const dated = (wantDates ? events : []).filter((e) => daysTo(e.date) + 1 >= 0 && daysTo(e.date) <= look)
      .map((e) => ({ ...e, days: daysTo(e.date) }));
    const rest = queue.filter((q) => !q.date);
    return [...dated, ...rest].sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9));
  });
  const next = $derived(rows.find((r) => r.days != null) || null);
  // Rows are one fixed height, so how many fit comes from the height the list
  // actually got (measured, not guessed): a line is left for "and N more" only
  // when something is left over.
  let listH = $state(0);
  const rest = $derived.by(() => {
    const after = rows.filter((r) => r !== next);
    let n = Math.min(want, after.length, Math.floor(listH / 20));
    // Something will be left over, so give the "and N more" line its own row.
    if (n < after.length) n = Math.max(0, Math.min(n, Math.floor((listH - 18) / 20)));
    return after.slice(0, n);
  });
  const more = $derived(Math.max(0, rows.length - (next ? 1 : 0) - rest.length));
  const configured = $derived(wantDates ? cals.length > 0 || (wantQueue && sensor) : !!sensor);

  const big = $derived(next ? (next.days === 0 ? 'Today' : next.days === 1 ? 'Tomorrow' : String(next.days)) : '');
  const words = $derived(!!next && next.days < 2);
  const when = $derived(next ? next.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : '');
  const short = (d) => (d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d < 14 ? `${d} d` : `${Math.round(d / 7)} wk`);
  const tip = (r) => [r.title, r.sub, r.kind?.label].filter(Boolean).join('\n');
</script>

<div class="rc" class:compact>
  {#if show('head') && !compact}
    <div class="head">
      <Icon icon="mdi:calendar-arrow-right" size="1.15em" />
      <span class="t">{title}</span>
      {#if waiting && next}<span class="n">{waiting} waiting</span>{/if}
    </div>
  {/if}

  {#if !configured}
    <div class="msg">Pick the release calendars, or a Seerr requests sensor.</div>
  {:else if error}
    <div class="msg">{error}</div>
  {:else if !rows.length}
    <div class="msg">
      {#if !loaded}Loading…
      {:else if source === 'requests'}<Icon icon="mdi:check-circle-outline" size="1.4em" /><span>No requests waiting</span>
      {:else}<Icon icon="mdi:calendar-check-outline" size="1.4em" /><span>Nothing coming up</span>{/if}
    </div>
  {:else}
    {#if show('next') && next && props.next !== false}
      <div class="next">
        <div class="when" class:words>
          <span class="b">{big}</span>
          {#if !words && !compact}<span class="u">{next.days === 1 ? 'day' : 'days'}</span>{/if}
        </div>
        <div class="what">{next.title}</div>
        {#if !compact}
          <div class="date">
            {#if next.kind}<span class="k"><Icon icon={next.kind.icon} size=".9em" />{next.kind.label}</span>{/if}
            <span>{when}</span>
          </div>
        {/if}
      </div>
    {:else if show('next') && !next && waiting && !compact}
      <div class="next">
        <div class="when words"><span class="b">{waiting} waiting</span></div>
      </div>
    {/if}

    {#if show('list') && !compact}
      <div class="list" bind:clientHeight={listH}>
        {#each rest as r (r.key)}
          <div class="row" title={tip(r)}>
            <span class="ri"><Icon icon={r.kind?.icon || 'mdi:movie-open-outline'} size="1em" /></span>
            <span class="rt">{r.title}{#if r.sub}<span class="rs">{r.sub}</span>{/if}</span>
            <span class="rn" class:idle={r.days == null}>{r.days == null ? 'Waiting' : short(r.days)}</span>
          </div>
        {/each}
        {#if more > 0}<div class="more">and {more} more</div>{/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .rc { height: 100%; display: flex; flex-direction: column; min-height: 0; container-type: size; }
  .head { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: .9em; }
  .head :global(svg) { color: var(--accent); flex: none; }
  .t { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .n { margin-left: auto; flex: none; background: rgba(255,255,255,.1); border-radius: 999px; padding: 1px 7px; font-size: .85em; color: var(--text); }

  .next { flex: none; margin-top: 4px; }
  .when { display: flex; align-items: baseline; gap: 6px; line-height: 1; }
  .b { font-size: min(3em, 24cqw, 32cqh); font-weight: 650; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
  .when.words .b { font-size: min(1.8em, 13cqw, 19cqh); }
  .u { color: var(--muted); font-size: 1em; }
  .what { margin-top: 4px; font-weight: 600; font-size: .98em; overflow-wrap: anywhere;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .date { margin-top: 3px; display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: .8em; }
  .k { display: inline-flex; align-items: center; gap: 3px; }

  .list { flex: 1; min-height: 0; margin-top: 8px; display: flex; flex-direction: column; gap: 3px; overflow: hidden; }
  .row { flex: none; display: flex; align-items: center; gap: 7px; font-size: .84em; line-height: 1.25; }
  .ri { flex: none; color: var(--muted); display: inline-flex; }
  .rt { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rs { color: var(--muted); }
  .rs::before { content: ' · '; }
  .rn { flex: none; color: var(--accent); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .rn.idle { color: var(--muted); }
  .more { flex: none; color: var(--muted); font-size: .78em; padding-top: 1px; }

  .msg { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center; color: var(--muted); font-size: .85em; padding: 8px; }
  .msg :global(svg) { opacity: .5; }
  .compact .next { margin-top: 0; }
  .compact .what { margin-top: 2px; font-size: .9em; -webkit-line-clamp: 1; }
</style>
