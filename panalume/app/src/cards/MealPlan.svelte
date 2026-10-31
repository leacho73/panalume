<script module>
  // Mealie keeps one calendar per meal type (dinner, lunch, breakfast…), so the
  // card reads those calendars: tonight's meal is the hero, the days after it
  // are a list. Nothing planned is the normal state in most houses, so it gets
  // a deliberate panel instead of an empty card.
  import { states } from '../lib/ha.svelte.js';
  const MEALS = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'drink', 'side'];
  // "calendar.mealie_dinner" → "dinner"; anything else keeps its own name.
  const mealKey = (id) => MEALS.find((m) => String(id).toLowerCase().includes(m)) || '';
  const mealOrder = (id) => { const i = MEALS.indexOf(mealKey(id)); return i < 0 ? 99 : i; };
  // Tonight leads with dinner, then lunch, then whatever else is planned.
  const HERO = ['dinner', 'lunch', 'breakfast'];
  const heroOrder = (id) => { const i = HERO.indexOf(mealKey(id)); return i < 0 ? 3 + mealOrder(id) : i; };

  export const meta = {
    type: 'meal-plan', name: 'Meal plan', icon: 'mdi:silverware-fork-knife', category: 'Info',
    size: { w: 360, h: 320 }, tap: 'none',
    defaults: { calendar: '', extras: [], days: 7, max: 6, type: true, recipes: '' },
    // Mealie's calendars are the ones named after a meal type; fall back to any
    // calendar that looks like a meal plan.
    autofill: () => {
      const cals = [...states.keys()].filter((id) => id.startsWith('calendar.'));
      const mealie = cals.filter((id) => /mealie/i.test(id) && mealKey(id));
      const pool = mealie.length ? mealie : cals.filter((id) => /meal|dinner|menu|recipe/i.test(id));
      const pick = (name) => pool.find((id) => mealKey(id) === name);
      const calendar = pick('dinner') || [...pool].sort((a, b) => heroOrder(a) - heroOrder(b))[0] || '';
      const extras = pool.filter((id) => id !== calendar).sort((a, b) => mealOrder(a) - mealOrder(b)).slice(0, 6);
      const recipes = [...states.keys()].find((id) => id.startsWith('sensor.') && /mealie.*recipes|recipes?$/.test(id)) || '';
      return { calendar, extras, recipes };
    },
    sections: [{ key: 'head', label: 'Title' }, { key: 'type', label: 'Meal type' }, { key: 'recipe_count', label: 'Recipe count' }],
    fields: [
      { key: 'title', label: 'Title', type: 'text', section: 'head', placeholder: 'Meal plan' },
      { key: 'icon', label: 'Icon', type: 'icon', section: 'head' },
      { key: 'calendar', label: 'Meal calendar', type: 'entity', domain: 'calendar', hint: 'Tonight\'s meal comes from this one. Mealie publishes one calendar per meal type — dinner, lunch, breakfast…' },
      { key: 'extras', label: 'Other meal calendars (listed under tonight\'s)', type: 'entities', domain: 'calendar' },
      { key: 'days', label: 'Days ahead', type: 'number' },
      { key: 'max', label: 'Most meals listed', type: 'number' },
      { key: 'type', label: 'Show the meal type', type: 'bool', section: 'type' },
      { key: 'recipes', label: 'Recipe count sensor', type: 'entity', domain: 'sensor', section: 'recipe_count', hint: 'Shown when nothing is planned. Mealie publishes one as sensor.mealie_recipes.' },
    ],
  };
</script>

<script>
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { clock } from '../lib/clock.svelte.js';
  let { props, w = 360, h = 320 } = $props();
  const show = (k) => !props.hide?.[k];

  const day0 = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const fromDate = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
  const lang = undefined;

  // The calendar setting is a template like everything else, and an unset prop
  // stringifies to "undefined" — guard before trimming.
  const asId = (v) => (v ? String(t(v)).trim() : '');
  const cals = $derived.by(() => {
    const out = [];
    for (const raw of [props.calendar, ...(props.extras || [])]) {
      const id = asId(raw);
      if (id.startsWith('calendar.') && !out.includes(id)) out.push(id);
    }
    return out;
  });
  const days = $derived(Math.min(21, Math.max(1, Math.round(Number(props.days)) || 7)));

  const calName = (id) => {
    const friendly = states.get(id)?.attributes?.friendly_name || '';
    return friendly.replace(/^\s*mealie\s+/i, '').replace(/\s*calendar$/i, '') || id.slice(9).replace(/_/g, ' ');
  };
  // "Dinner" from a Mealie calendar; a calendar with no meal word keeps its name.
  const mealType = (id) => {
    const k = mealKey(id);
    return k ? k[0].toUpperCase() + k.slice(1) : calName(id);
  };

  const now = $derived(clock.now);
  const today = $derived(day0(now));

  let events = $state([]);
  let error = $state('');
  let loading = $state(true);
  let refresh = $state(0);
  $effect(() => {
    const i = setInterval(() => refresh++, 5 * 60e3);
    return () => clearInterval(i);
  });

  // Refetch when a calendar's state changes (its next event moved) and when the
  // window moves.
  const stamp = $derived(cals.map((id) => states.get(id)?.last_updated || '').join('|'));
  const range = $derived(`${today.getTime()}|${addDays(today, days).getTime()}`);
  function norm(ev, cal) {
    const allDay = !!ev.start?.date && !ev.start?.dateTime;
    const start = allDay ? fromDate(ev.start.date) : new Date(ev.start?.dateTime);
    const end = allDay ? fromDate(ev.end?.date || ev.start.date) : new Date(ev.end?.dateTime || ev.start?.dateTime);
    if (isNaN(start)) return null;
    const title = String(ev.summary || '').trim();
    return {
      key: `${cal}|${ev.uid || ''}|${start.getTime()}|${title}`, cal, allDay, start, end,
      title: title || 'Untitled meal', type: mealType(cal),
      order: mealOrder(cal), hero: heroOrder(cal),
    };
  }
  $effect(() => {
    refresh; stamp; range;
    const ids = cals;
    const [a, b] = range.split('|').map(Number);
    if (!ids.length) { events = []; loading = false; error = ''; return; }
    const q = `?start=${encodeURIComponent(new Date(a).toISOString())}&end=${encodeURIComponent(new Date(b).toISOString())}`;
    const failed = [];
    let alive = true;
    loading = true;
    Promise.all(ids.map((id) => fetch(`ha/api/calendars/${id}${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${id}: ${r.status}`))))
      .then((evs) => (evs || []).map((ev) => norm(ev, id)).filter(Boolean))
      .catch(() => { failed.push(id); return []; })))
      .then((all) => {
        if (!alive) return;
        events = all.flat();
        error = failed.length === ids.length ? 'Could not read the meal calendar' : '';
        loading = false;
      });
    return () => { alive = false; };
  });

  const onDay = (e, date) => {
    const next = addDays(date, 1);
    return e.start < next && (e.end > date || (+e.end === +e.start && e.start >= date));
  };
  const tonight = $derived(events.filter((e) => onDay(e, today)).sort((a, b) => a.hero - b.hero || a.start - b.start));
  const hero = $derived(tonight[0]);
  const also = $derived(tonight.slice(1, 4));
  const upcoming = $derived.by(() => {
    const out = [];
    for (let d = 1; d < days; d++) {
      const date = addDays(today, d);
      const meals = events.filter((e) => onDay(e, date)).sort((a, b) => a.order - b.order || a.start - b.start);
      for (const e of meals) out.push({ ...e, date, dayLabel: dayLabel(date) });
    }
    return out;
  });
  function dayLabel(date) {
    const diff = Math.round((day0(date) - today) / 864e5);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return `${date.toLocaleDateString(lang, { weekday: 'short' })} ${date.getDate()}`;
  }
  const hm = (d) => d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
  const when = (e) => (e.allDay ? 'Tonight' : hm(e.start));

  // The list is cut to what the card actually measures: rows are a fixed height,
  // one row is reserved for the "and N more" line.
  const PITCH = 29;
  let listH = $state(0);
  const shown = $derived.by(() => {
    const cap = Math.max(1, Math.round(Number(props.max)) || 6);
    const items = upcoming.slice(0, cap);
    const fits = Math.max(0, Math.floor((listH + 3) / PITCH));
    if (!fits) return [];
    // Nothing is left out of the window: no tail line, so every row can be used.
    if (upcoming.length <= fits) return items;
    // Something is left over: keep the last row for the "and N more" line.
    return items.slice(0, Math.max(0, fits - 1));
  });
  const tail = $derived(upcoming.length - shown.length);

  const small = $derived(h < 170);
  const title = $derived(t(props.title) || 'Meal plan');
  const dateText = $derived(today.toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short' }));
  const recipesE = $derived(ent(props.recipes));
  const recipeCount = $derived(Number(recipesE?.state));
  const recipeText = $derived(
    show('recipe_count') && recipesE && !isNaN(recipeCount) && recipeCount > 0
      ? `${recipeCount} recipe${recipeCount === 1 ? '' : 's'} to choose from`
      : '',
  );
</script>

<div class="meal" class:small class:empty={!events.length && !loading && !error}>
  {#if show('head') && !small}
    <div class="head">
      <Icon icon={t(props.icon) || 'mdi:silverware-fork-knife'} size="1.15em" />
      <span class="t">{title}</span>
      <span class="date">{dateText}</span>
    </div>
  {/if}

  {#if !cals.length}
    <div class="msg">Pick a meal calendar in the card's settings.</div>
  {:else if error}
    <div class="msg">{error}</div>
  {:else if loading && !events.length}
    <div class="msg">Reading the meal plan…</div>
  {:else if !events.length}
    <div class="empty-panel">
      <Icon icon="mdi:silverware-variant" size="1.9em" />
      <b>Nothing planned for tonight</b>
      {#if recipeText}<span class="hint">{recipeText}</span>{/if}
    </div>
  {:else}
    <div class="hero">
      {#if hero}
        <div class="hlabel">
          {#if show('type')}<span class="chip">{hero.type}</span>{/if}
          <span class="when">{when(hero)}</span>
        </div>
        <div class="dish" title={hero.title}>{hero.title}</div>
      {:else}
        <div class="hlabel"><span class="when">Tonight</span></div>
        <div class="dish none">Nothing planned for tonight</div>
        {#if recipeText && !small}<div class="hint">{recipeText}</div>{/if}
      {/if}
      {#if !small && also.length}
        <div class="also">
          {#each also as e (e.key)}
            <div class="also-row">
              {#if show('type')}<span class="chip sm">{e.type}</span>{/if}
              <span class="atitle" title={e.title}>{e.title}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
    {#if !small && upcoming.length}
      <div class="list" bind:clientHeight={listH}>
        {#each shown as e (e.key)}
          <div class="row">
            <span class="d">{e.dayLabel}</span>
            {#if show('type')}<span class="chip sm">{e.type}</span>{/if}
            <span class="atitle" title={e.title}>{e.title}</span>
          </div>
        {/each}
        {#if tail >= 1 && listH > 34}
          <div class="more">and {tail} more</div>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .meal { height: 100%; min-height: 0; display: flex; flex-direction: column; gap: 8px; container-type: size; }
  .head { display: flex; align-items: center; gap: 8px; font-weight: 600; flex: none; }
  .head :global(svg) { color: var(--accent); flex: none; }
  .t { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .date { flex: none; font-size: .72em; font-weight: 500; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
  .msg { flex: 1; min-height: 0; display: grid; place-items: center; padding: 8px; text-align: center; color: var(--muted); font-size: .85em; }

  /* Nothing planned: the house's normal state, so it reads as information, not a fault. */
  .empty-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center; padding: 4px; }
  .empty-panel :global(svg) { color: var(--muted); }
  .empty-panel b { font-size: min(1.05em, 4.6cqw, 14cqh); font-weight: 600; }
  .hint { color: var(--muted); font-size: min(.82em, 3.6cqw); }

  .hero { flex: none; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .hlabel { display: flex; align-items: center; gap: 7px; min-width: 0; }
  .chip { flex: none; max-width: 55%; padding: 1px 7px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent); font-size: .72em; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chip.sm { font-size: .68em; padding: 0 6px; }
  .when { color: var(--muted); font-size: .76em; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .dish {
    font-size: min(1.5em, 6.4cqw, 22cqh); font-weight: 600; line-height: 1.15; letter-spacing: -.01em;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere;
  }
  .dish.none { color: var(--muted); font-weight: 500; }

  .also { display: flex; flex-direction: column; gap: 2px; margin-top: 2px; }
  .also-row { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
  .atitle { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .also-row .atitle { font-size: .86em; }

  .list { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: 3px; }
  .row { flex: none; height: 26px; display: flex; align-items: center; gap: 7px; min-width: 0; padding: 0 2px; border-radius: 7px; background: rgba(255,255,255,.04); }
  .row .d { flex: none; width: 5.6em; color: var(--muted); font-size: .76em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row .atitle { font-size: .86em; }
  .more { flex: none; height: 16px; color: var(--muted); font-size: .72em; padding-left: 3px; }

  /* A short card keeps the shape: the meal type and the dish, no list. */
  .small .dish { font-size: min(1.25em, 6cqw, 30cqh); -webkit-line-clamp: 2; }
  .small .hero { justify-content: center; }
</style>
