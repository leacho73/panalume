<script module>
  import { states } from '../lib/ha.svelte.js';
  // Birthdays first (the common use), then holidays, then anything else.
  const autofill = () => {
    const ids = [...states.keys()].filter((id) => id.startsWith('calendar.')).sort();
    return {
      entity:
        ids.find((id) => /birthday|anniversar|cake/.test(id)) ||
        ids.find((id) => /holiday|feiertag|vacance/.test(id)) ||
        ids[0] || '',
    };
  };
  export const meta = {
    type: 'countdown', name: 'Countdown', icon: 'mdi:cake-variant', category: 'Info',
    size: { w: 300, h: 240 }, tap: 'none',
    defaults: { entity: '', list: true, count: 4, days: 366, date: true },
    autofill,
    sections: [
      { key: 'head', label: 'Title' },
      { key: 'next', label: 'The countdown' },
      { key: 'list', label: 'What comes after' },
    ],
    fields: [
      { key: 'entity', label: 'Calendar', type: 'entity', domain: 'calendar', hint: "Home Assistant's birthdays calendar, holidays, a Google calendar of trips and dates." },
      { key: 'name', label: 'Title (blank = the calendar\'s name)', type: 'text' },
      { key: 'icon', label: 'Icon', type: 'icon' },
      { key: 'count', label: 'Dates after the next one', type: 'number' },
      { key: 'days', label: 'Look ahead (days)', type: 'number' },
      { key: 'list', label: 'Show the dates after the next one', type: 'bool' },
      { key: 'date', label: 'Show the date', type: 'bool' },
    ],
  };
</script>

<script>
  // How long until the next date on a calendar: birthdays, anniversaries, holidays,
  // trips. The next one gets the card, the ones after it a small list. Reads the
  // calendar through Home Assistant's REST API, so a Google calendar or a local
  // one both work.
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { name } from '../lib/entity.js';
  import { clock } from '../lib/clock.svelte.js';
  let { props, w = 300, h = 240 } = $props();
  const show = (k) => !props.hide?.[k];

  const cal = $derived(props.entity?.startsWith('calendar.') ? props.entity : '');
  const calName = $derived(name(ent(cal)) || '');
  const title = $derived(t(props.name) || calName || 'Countdown');
  const look = $derived(Math.min(1095, Math.max(1, Number(props.days) || 366)));
  const want = $derived(Math.min(12, Math.max(0, props.count == null || props.count === '' ? 4 : Number(props.count))));
  const icon = $derived(t(props.icon) || 'mdi:cake-variant');

  let events = $state([]);
  let loaded = $state(false);
  let error = $state('');
  let refresh = $state(0);
  const stamp = $derived(states.get(cal)?.last_updated || '');

  $effect(() => {
    const i = setInterval(() => refresh++, 5 * 60e3);
    return () => clearInterval(i);
  });

  // All-day dates (birthdays, holidays) come as YYYY-MM-DD; timed ones as date-times.
  const fromDate = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
  function norm(ev) {
    const allDay = !!ev.start?.date && !ev.start?.dateTime;
    const start = allDay ? fromDate(ev.start.date) : new Date(ev.start?.dateTime);
    if (isNaN(start)) return null;
    return { key: `${ev.uid || ''}|${start.getTime()}|${ev.summary || ''}`, title: ev.summary || '(No title)', allDay, start };
  }

  $effect(() => {
    refresh; stamp;
    if (!cal) { events = []; loaded = true; return; }
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const to = new Date(from); to.setDate(to.getDate() + look);
    const q = `?start=${encodeURIComponent(from.toISOString())}&end=${encodeURIComponent(to.toISOString())}`;
    let alive = true;
    loaded = false;
    fetch(`ha/api/calendars/${cal}${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Calendar: ${r.status}`))))
      .then((evs) => {
        if (!alive) return;
        events = evs.map(norm).filter(Boolean).sort((a, b) => a.start - b.start);
        error = '';
        loaded = true;
      })
      .catch((e) => { if (alive) { error = e.message || 'Could not load the calendar'; loaded = true; } });
    return () => (alive = false);
  });

  // Days are counted in calendar days, so "tomorrow" is 1 whatever the hour.
  const day0 = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const today = $derived(day0(clock.now).getTime());
  const daysTo = (d) => Math.round((day0(d) - today) / 864e5);
  // An all-day event stays "today" all day; a timed one drops off once it is over.
  const ahead = $derived.by(() => {
    const now = clock.now;
    return events
      .filter((e) => daysTo(e.start) >= 0 && (e.allDay || e.start.getTime() + 60e3 > now || daysTo(e.start) > 0))
      .map((e) => ({ ...e, days: daysTo(e.start) }));
  });
  const next = $derived(ahead[0] || null);
  const rest = $derived(ahead.slice(1, 1 + want));
  const count = $derived(next ? next.days : 0);
  const big = $derived(next ? (count === 0 ? 'Today' : count === 1 ? 'Tomorrow' : String(count)) : '');
  const unit = $derived(next && count > 1 ? 'days' : 'day');
  const when = $derived(next ? next.start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : '');
  const short = (d) => (d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d < 60 ? `in ${d} days` : `in ${Math.round(d / 30)} mo`);
  const compact = $derived(h < 170 || w < 220);
</script>

<div class="cd" class:compact>
  {#if show('head') && !compact}
    <div class="head">
      <Icon icon={icon} size="1.15em" />
      <span class="t">{title}</span>
    </div>
  {/if}

  {#if !cal}
    <div class="msg">Pick a calendar in the card's settings.</div>
  {:else if error}
    <div class="msg">{error}</div>
  {:else if !next}
    <div class="msg">{#if loaded}<Icon icon={icon} size="1.4em" /><span>Nothing coming up</span>{:else}Loading…{/if}</div>
  {:else}
    {#if show('next')}
      <div class="next">
        <div class="when" class:words={count < 2}>
          <span class="n">{big}</span>
          {#if count > 1}{#if !compact}<span class="u">{unit}</span>{/if}{/if}
        </div>
        <div class="what">{next.title}</div>
        {#if props.date !== false && show('next') && !compact}<div class="date">{when}</div>{/if}
      </div>
    {/if}

    {#if props.list !== false && rest.length && show('list') && !compact}
      <div class="list">
        {#each rest as e (e.key)}
          <div class="row">
            <span class="rt">{e.title}</span>
            <span class="rn">{short(e.days)}</span>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .cd { height: 100%; display: flex; flex-direction: column; min-height: 0; container-type: size; }
  .head { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: .9em; }
  .head :global(svg) { color: var(--accent); flex: none; }
  .t { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .next { flex: none; margin-top: 4px; }
  .when { display: flex; align-items: baseline; gap: 6px; line-height: 1; }
  .n { font-size: min(3.1em, 26cqw, 34cqh); font-weight: 650; letter-spacing: -.02em; }
  .when.words .n { font-size: min(1.9em, 13cqw, 20cqh); }
  .u { color: var(--muted); font-size: 1em; }
  .what { margin-top: 4px; font-weight: 600; font-size: .98em; overflow-wrap: anywhere;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .date { margin-top: 2px; color: var(--muted); font-size: .8em; }
  .list { flex: 1; min-height: 0; margin-top: 8px; display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
  .row { display: flex; align-items: center; gap: 8px; font-size: .84em; }
  .rn { white-space: nowrap; }
  .rt { flex: 1; min-width: 0; color: var(--muted); line-height: 1.2;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .rn { flex: none; color: var(--accent); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .msg { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center; color: var(--muted); font-size: .85em; padding: 8px; }
  .msg :global(svg) { opacity: .5; }
  .compact .next { margin-top: 0; }
  .compact .what { margin-top: 2px; font-size: .9em; -webkit-line-clamp: 1; }
</style>
