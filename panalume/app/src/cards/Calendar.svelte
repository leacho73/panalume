<script module>
  import { states } from '../lib/ha.svelte.js';
  export const meta = {
    type: 'calendar', name: 'Calendar', icon: 'mdi:calendar-month-outline', category: 'Info',
    size: { w: 360, h: 320 }, tap: 'none',
    defaults: { entities: [], view: 'list', days: 7, max: 20, hour12: false },
    // Every calendar in Home Assistant, up to six.
    autofill: () => ({ entities: [...states.keys()].filter((id) => id.startsWith('calendar.')).sort().slice(0, 6) }),
    sections: [{ key: 'head', label: 'Title & date' }, { key: 'location', label: 'Locations' }, { key: 'legend', label: 'Calendar names' }],
    fields: [
      { key: 'title', label: 'Title (blank = today’s date)', type: 'text' },
      { key: 'entities', label: 'Calendars', type: 'entities', domain: 'calendar' },
      { key: 'view', label: 'View', type: 'select', options: [{ value: 'list', label: 'List of upcoming events' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }] },
      { key: 'days', label: 'Days ahead (list)', type: 'number' },
      { key: 'max', label: 'Most events shown (list)', type: 'number' },
      { key: 'week_start', label: 'Week starts on (week and month)', type: 'select', options: [{ value: '', label: 'Automatic (from the language)' }, { value: '1', label: 'Monday' }, { value: '0', label: 'Sunday' }, { value: '6', label: 'Saturday' }] },
      { key: 'hour12', label: '12-hour times', type: 'bool' },
    ],
  };
</script>

<script>
  // Today's and upcoming events from Home Assistant's calendars (Google, CalDAV,
  // Local calendar, holidays…), grouped by day. Each calendar has its own colour;
  // events on now are highlighted, and tapping one shows its details. Or a week
  // or month at a glance, with arrows to move through them; tapping a day opens
  // its events.
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/tpl.js';
  import { clock } from '../lib/clock.svelte.js';
  let { props, w = 360, h = 320 } = $props();
  const show = (k) => !props.hide?.[k];
  const COLORS = ['#4fb4ff', '#ff8fb1', '#5bd88f', '#ffc861', '#b48cff', '#ff9a3c', '#2ed3c4', '#ff6b6b'];

  const cals = $derived((props.entities || []).filter((id) => id?.startsWith('calendar.')));
  const days = $derived(Math.min(31, Math.max(1, Number(props.days) || 7)));
  const view = $derived(props.view === 'week' || props.view === 'month' ? props.view : 'list');
  // Weeks or months forward (or back) from the current one, and the day opened from the grid.
  let offset = $state(0);
  let sheet = $state(null);
  let lastView = '';
  $effect.pre(() => { if (view !== lastView) { lastView = view; offset = 0; sheet = null; } });
  // Refetch when a calendar's state changes (its current / next event moved),
  // and every 5 minutes anyway.
  const stamp = $derived(cals.map((id) => states.get(id)?.last_updated || '').join('|'));
  let events = $state([]);
  let error = $state('');
  let refresh = $state(0);
  $effect(() => {
    const i = setInterval(() => refresh++, 5 * 60e3);
    return () => clearInterval(i);
  });
  $effect(() => {
    refresh; stamp;
    const list = cals;
    if (!list.length) return void (events = []);
    const [from, to] = range.split('|').map((x) => new Date(Number(x)));
    const q = `?start=${encodeURIComponent(from.toISOString())}&end=${encodeURIComponent(to.toISOString())}`;
    let alive = true;
    Promise.all(list.map((id, i) => fetch(`ha/api/calendars/${id}${q}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${id}: ${r.status}`)))).then((evs) => evs.map((ev) => norm(ev, id, i)))))
      .then((all) => { if (alive) { events = all.flat().filter(Boolean).sort((a, b) => a.start - b.start || b.allDay - a.allDay); error = ''; } })
      .catch((e) => { if (alive) error = e.message || 'Could not load the calendars'; });
    return () => (alive = false);
  });

  // All-day events come as dates (end exclusive); timed ones as date-times.
  const day0 = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const fromDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  function norm(ev, cal, i) {
    const allDay = !!ev.start?.date && !ev.start?.dateTime;
    const start = allDay ? fromDate(ev.start.date) : new Date(ev.start?.dateTime);
    const end = allDay ? fromDate(ev.end?.date || ev.start.date) : new Date(ev.end?.dateTime || ev.start?.dateTime);
    if (isNaN(start)) return null;
    return { key: `${cal}|${ev.uid || ''}|${start.getTime()}|${ev.summary}`, cal, color: COLORS[i % COLORS.length], title: ev.summary || '(No title)', location: ev.location || '', description: ev.description || '', allDay, start, end };
  }

  // Grouped by day; an event spanning several days shows on each of them.
  const now = $derived(clock.now);
  const groups = $derived.by(() => {
    const out = [];
    const today = day0(now);
    let left = Math.max(1, Number(props.max) || 20);
    for (let d = 0; d < days && left > 0; d++) {
      const date = new Date(today); date.setDate(date.getDate() + d);
      const next = new Date(date); next.setDate(next.getDate() + 1);
      // On this day (end is exclusive; a zero-length event counts at its start)…
      const onDay = (e) => e.start < next && (e.end > date || (+e.end === +e.start && e.start >= date));
      // …and not already over (finished events drop off during the day).
      const notOver = (e) => e.allDay || e.end > now || (+e.end === +e.start && e.start >= now - 60e3);
      const evs = events.filter((e) => onDay(e) && notOver(e));
      if (!evs.length) continue;
      const take = evs.slice(0, left);
      left -= take.length;
      out.push({ date, evs: take });
    }
    return out;
  });
  const empty = $derived(cals.length && !error && !groups.length);

  // Week and month: the first day of the week (from the setting, else the language).
  const firstDay = $derived.by(() => {
    if (props.week_start !== '' && props.week_start != null && !isNaN(Number(props.week_start))) return Number(props.week_start) % 7;
    try {
      const loc = new Intl.Locale(navigator.language);
      const fd = (loc.getWeekInfo?.() || loc.weekInfo)?.firstDay;
      if (fd) return fd % 7;
    } catch {}
    return 1;
  });
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const weekOf = (d) => addDays(day0(d), -((day0(d).getDay() - firstDay + 7) % 7));
  const today = $derived(day0(now).getTime());
  // The days on screen, as a "from|to" key so the calendars are only fetched again when it changes.
  const span = $derived.by(() => {
    const t0 = new Date(today);
    if (view === 'week') { const from = addDays(weekOf(t0), 7 * offset); return { from, to: addDays(from, 7), weeks: 1 }; }
    if (view === 'month') {
      const first = new Date(t0.getFullYear(), t0.getMonth() + offset, 1);
      const from = weekOf(first);
      const weeks = Math.ceil((Math.round((new Date(first.getFullYear(), first.getMonth() + 1, 1) - from) / 864e5)) / 7);
      return { from, to: addDays(from, weeks * 7), weeks, first };
    }
    return { from: t0, to: addDays(t0, days), weeks: 0 };
  });
  const range = $derived(`${span.from.getTime()}|${span.to.getTime()}`);
  const gridDays = $derived(view === 'list' ? [] : Array.from({ length: span.weeks * 7 }, (_, i) => addDays(span.from, i)));
  const onDate = (date) => {
    const next = addDays(date, 1);
    return events.filter((e) => e.start < next && (e.end > date || (+e.end === +e.start && e.start >= date)));
  };
  const byDay = $derived(new Map(gridDays.map((d) => [d.getTime(), onDate(d)])));
  const period = $derived.by(() => {
    if (view === 'month') return span.first.toLocaleDateString(lang, { month: 'long', year: 'numeric' });
    const end = addDays(span.from, 6);
    const same = end.getMonth() === span.from.getMonth();
    return `${span.from.toLocaleDateString(lang, same ? { day: 'numeric' } : { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString(lang, { day: 'numeric', month: 'short' })}`;
  });
  const weekdays = $derived(Array.from({ length: 7 }, (_, i) => addDays(span.from, i).toLocaleDateString(lang, { weekday: w >= 420 ? 'short' : 'narrow' })));
  // Week view: columns when there's room for them, otherwise a row per day.
  const rows = $derived(w < 420);
  // Month view: how many event titles fit in a cell (0 = coloured dots instead).
  const cellH = $derived(span.weeks ? (h - (show('head') && !small ? 34 : 0) - 22 - (span.weeks - 1) * 3) / span.weeks : 0);
  const lines = $derived(w / 7 >= 58 ? Math.max(0, Math.floor((cellH - 22) / 17)) : 0);
  const openDay = (d, key = null) => { sheet = d.getTime(); open = key; };

  const lang = undefined;
  const dayName = (d) => {
    const diff = Math.round((day0(d) - day0(now)) / 864e5);
    return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : d.toLocaleDateString(lang, { weekday: diff < 7 ? 'long' : 'short', ...(diff < 7 ? {} : { day: 'numeric', month: 'short' }) });
  };
  const h12 = $derived(!!props.hour12);
  const hm = (d) => d.toLocaleTimeString(lang, h12 ? { hour: 'numeric', minute: '2-digit', hour12: true } : { hour: '2-digit', minute: '2-digit', hour12: false });
  const when = (e, date) => {
    if (e.allDay) return 'All day';
    const next = new Date(date); next.setDate(next.getDate() + 1);
    const startsToday = e.start >= date, endsToday = e.end <= next;
    if (startsToday && (endsToday || small)) return +e.start === +e.end || small ? hm(e.start) : `${hm(e.start)}–${hm(e.end)}`;
    if (startsToday) return `From ${hm(e.start)}`;
    if (endsToday) return `Until ${hm(e.end)}`;
    return 'All day';
  };
  const isNow = (e) => !e.allDay && e.start <= now && e.end > now;
  const calName = (id) => (states.get(id)?.attributes.friendly_name || id.slice(9)).replace(/\s*calendar$/i, '');
  let open = $state(null);
  const small = $derived(h < 170);
  const title = $derived(view !== 'list' ? [t(props.title), period].filter(Boolean).join(' · ') : t(props.title) || new Date(now).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' }));
  const past = (e) => !e.allDay && e.end < now;
</script>

<div class="cal" class:small class:h12>
  {#if show('head') && !small}
    <div class="head">
      <Icon icon="mdi:calendar-month-outline" size="1.2em" />
      <span class="t">{title}</span>
      {#if view !== 'list'}
        <span class="nav" data-stop>
          {#if offset}<button class="today-btn" onclick={() => { offset = 0; sheet = null; }}>Today</button>{/if}
          <button onclick={() => { offset--; sheet = null; }} aria-label="Previous"><Icon icon="mdi:chevron-left" size="1.2em" /></button>
          <button onclick={() => { offset++; sheet = null; }} aria-label="Next"><Icon icon="mdi:chevron-right" size="1.2em" /></button>
        </span>
      {/if}
      {#if show('legend') && cals.length > 1 && w >= (view === 'list' ? 300 : 460)}
        <span class="legend">{#each cals as id, i}<i style="background:{COLORS[i % COLORS.length]}" title={calName(id)}></i>{/each}</span>
      {/if}
    </div>
  {/if}

  {#if !cals.length}
    <div class="msg">Pick one or more calendars in the card's settings.</div>
  {:else if error}
    <div class="msg">{error}</div>
  {:else if view === 'week' && !sheet}
    <div class="week" class:rows data-stop>
      {#each gridDays as d (d.getTime())}
        {@const evs = byDay.get(d.getTime()) || []}
        <div class="wday" class:today={d.getTime() === today} class:gone={d.getTime() < today}>
          <button class="dh" onclick={() => openDay(d)}><span>{d.toLocaleDateString(lang, { weekday: rows ? 'short' : w >= 560 ? 'short' : 'narrow' })}</span><b>{d.getDate()}</b></button>
          <div class="chips">
            {#each evs as e (e.key)}
              <button class="chip" class:all={e.allDay} class:past={past(e)} style="--c:{e.color}" onclick={() => openDay(d, e.key)} title={e.title}>
                {#if !e.allDay && e.start >= d && (rows || w >= 640)}<span class="tm">{hm(e.start)}</span>{/if}<span class="ct">{e.title}</span>
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {:else if view === 'month' && !sheet}
    <div class="month" data-stop style="--weeks:{span.weeks}">
      {#each weekdays as wd}<span class="wd">{wd}</span>{/each}
      {#each gridDays as d (d.getTime())}
        {@const evs = byDay.get(d.getTime()) || []}
        <button class="cell" class:other={d.getMonth() !== span.first.getMonth()} class:today={d.getTime() === today} onclick={() => openDay(d)} aria-label={d.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' }) + (evs.length ? `, ${evs.length} events` : '')}>
          <span class="dn">{d.getDate()}</span>
          {#if lines}
            {#each evs.slice(0, evs.length > lines ? lines - 1 : lines) as e (e.key)}<span class="mchip" class:all={e.allDay} style="--c:{e.color}">{e.title}</span>{/each}
            {#if evs.length > lines}<span class="more">+{evs.length - lines + 1}</span>{/if}
          {:else if evs.length}
            <span class="dots">{#each evs.slice(0, 4) as e (e.key)}<i style="background:{e.color}"></i>{/each}</span>
          {/if}
        </button>
      {/each}
    </div>
  {:else if sheet}
    {@const d = new Date(sheet)}
    {@const evs = onDate(d)}
    <div class="sheet">
      <button class="back" onclick={() => { sheet = null; open = null; }}><Icon icon="mdi:arrow-left" size="1.1em" />{d.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })}</button>
      {#if evs.length}
        <div class="list" data-stop>{#each evs as e (e.key)}{@render row(e, d)}{/each}</div>
      {:else}<div class="msg">Nothing on</div>{/if}
    </div>
  {:else if empty}
    <div class="msg">Nothing on in the next {days === 1 ? 'day' : `${days} days`}</div>
  {:else}
    <div class="list" data-stop>
      {#each groups as g (g.date.getTime())}
        <div class="day" class:today={dayName(g.date) === 'Today'}>{dayName(g.date)}</div>
        {#each g.evs as e (e.key)}{@render row(e, g.date)}{/each}
      {/each}
    </div>
  {/if}
</div>

{#snippet row(e, date)}
  <button class="ev" class:now={isNow(e)} class:open={open === e.key} style="--c:{e.color}" onclick={() => (open = open === e.key ? null : e.key)}>
    <span class="bar"></span>
    <span class="when">{when(e, date)}</span>
    <span class="what">
      <span class="ti">{e.title}</span>
      {#if open === e.key}
        {#if e.location}<span class="sub"><Icon icon="mdi:map-marker-outline" size="1em" />{e.location}</span>{/if}
        {#if e.description}<span class="desc">{e.description}</span>{/if}
        {#if show('legend') && cals.length > 1}<span class="sub"><Icon icon="mdi:calendar" size="1em" />{calName(e.cal)}</span>{/if}
      {:else if e.location && show('location') && !small}<span class="sub">{e.location}</span>{/if}
    </span>
  </button>
{/snippet}

<style>
  .cal { height: 100%; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
  .head { display: flex; align-items: center; gap: 8px; font-weight: 600; }
  .head :global(svg) { color: var(--accent); flex: none; }
  .t { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .legend { display: flex; gap: 4px; flex: none; }
  .legend i { width: 8px; height: 8px; border-radius: 50%; }
  .msg { flex: 1; display: grid; place-items: center; color: var(--muted); font-size: .85em; text-align: center; padding: 8px; }
  .list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 3px; margin-right: -6px; padding-right: 6px; scrollbar-width: thin; }
  .day { font-size: .72em; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin-top: 6px; }
  .day:first-child { margin-top: 0; }
  .day.today { color: var(--accent); }
  .ev { display: flex; align-items: flex-start; gap: 9px; width: 100%; text-align: left; background: rgba(255,255,255,.04); border: 0; border-radius: 10px; padding: 7px 10px 7px 0; color: inherit; font: inherit; cursor: pointer; }
  .ev.now { background: color-mix(in srgb, var(--c) 16%, transparent); }
  .bar { width: 3px; align-self: stretch; border-radius: 2px; background: var(--c); flex: none; margin-left: 6px; }
  .when { flex: none; width: 6.9em; white-space: nowrap; font-size: .8em; color: var(--muted); font-variant-numeric: tabular-nums; padding-top: .1em; }
  .ev.now .when { color: var(--c); font-weight: 600; }
  .what { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .ti { font-size: .9em; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ev.open .ti { white-space: normal; }
  .sub { display: flex; align-items: center; gap: 4px; font-size: .75em; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .desc { font-size: .78em; color: var(--muted); white-space: pre-line; max-height: 8em; overflow: auto; }
  .small .day:not(.today) { margin-top: 2px; }
  .small .ev { padding-top: 5px; padding-bottom: 5px; }
  .small .when { width: 3.6em; }
  .h12 .when { width: 9.4em; }
  .small.h12 .when { width: 4.9em; }
  .nav { display: flex; align-items: center; gap: 2px; flex: none; }
  .nav button { display: grid; place-items: center; min-width: 28px; height: 28px; padding: 0 4px; border: 0; border-radius: 8px; background: rgba(255,255,255,.06); color: inherit; font: inherit; }
  .nav .today-btn { font-size: .75em; font-weight: 600; padding: 0 9px; margin-right: 2px; }
  /* Week: a column per day, or a row per day on narrow cards. */
  .week { flex: 1; min-height: 0; overflow-y: auto; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; align-content: start; scrollbar-width: thin; }
  .wday { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .dh { display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 4px 0; border: 0; border-radius: 8px; background: rgba(255,255,255,.04); color: var(--muted); font: inherit; font-size: .72em; text-transform: uppercase; letter-spacing: .04em; }
  .dh b { font-size: 1.45em; color: var(--text); letter-spacing: 0; font-weight: 600; }
  .wday.today .dh { background: color-mix(in srgb, var(--accent) 22%, transparent); color: var(--accent); }
  .wday.gone .dh b { color: var(--muted); }
  .chips { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .chip { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; width: 100%; min-width: 0; padding: 4px 6px; border: 0; border-left: 3px solid var(--c); border-radius: 6px; background: rgba(255,255,255,.05); color: inherit; font: inherit; font-size: .74em; text-align: left; line-height: 1.25; }
  .chip.all { background: color-mix(in srgb, var(--c) 22%, transparent); }
  .chip.past { opacity: .5; }
  .tm { color: var(--muted); font-size: .9em; font-variant-numeric: tabular-nums; }
  .ct { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .week.rows { grid-template-columns: 1fr; gap: 5px; }
  .week.rows .wday { flex-direction: row; align-items: flex-start; gap: 8px; }
  .week.rows .dh { flex: none; width: 3.4em; padding: 3px 0; }
  .week.rows .dh b { font-size: 1.2em; }
  .week.rows .chips { flex: 1; flex-direction: row; flex-wrap: wrap; padding-top: 2px; }
  .week.rows .chip { width: auto; max-width: 100%; flex-direction: row; gap: 5px; align-items: baseline; }
  /* Month: a grid of days with titles, or dots when the cells are small. */
  .month { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); grid-template-rows: auto repeat(var(--weeks), minmax(0, 1fr)); gap: 3px; }
  .wd { font-size: .68em; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); text-align: center; }
  .cell { display: flex; flex-direction: column; align-items: stretch; gap: 2px; min-width: 0; min-height: 0; overflow: hidden; padding: 3px; border: 0; border-radius: 7px; background: rgba(255,255,255,.04); color: inherit; font: inherit; text-align: left; }
  .cell.other { opacity: .4; }
  .cell.today { box-shadow: inset 0 0 0 1.5px var(--accent); }
  .dn { font-size: .72em; font-weight: 600; padding-left: 2px; }
  .cell.today .dn { color: var(--accent); }
  .mchip { font-size: .64em; line-height: 1.35; padding: 0 4px; border-radius: 4px; border-left: 2px solid var(--c); background: rgba(255,255,255,.05); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: none; }
  .mchip.all { background: color-mix(in srgb, var(--c) 24%, transparent); }
  .more { font-size: .62em; color: var(--muted); padding-left: 4px; }
  .dots { display: flex; gap: 2px; padding-left: 2px; flex-wrap: wrap; }
  .dots i { width: 5px; height: 5px; border-radius: 50%; }
  /* A day opened from the week or month. */
  .sheet { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; }
  .back { display: flex; align-items: center; gap: 6px; align-self: flex-start; padding: 4px 10px 4px 6px; border: 0; border-radius: 8px; background: rgba(255,255,255,.06); color: inherit; font: inherit; font-size: .85em; font-weight: 600; }
  /* Fade out at the bottom when there's more to scroll to. */
  .list, .week { mask-image: linear-gradient(to bottom, #000 calc(100% - 18px), transparent); }
</style>
