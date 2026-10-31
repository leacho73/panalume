<script module>
  import { states } from '../lib/ha.svelte.js';

  // Chore lists first (named "chores"), otherwise every to-do list there is.
  const autofill = () => {
    if (!states.size) return {};
    const ids = [...states.keys()].filter((id) => id.startsWith('todo.'));
    const chores = ids.filter((id) => /chore/.test(id));
    const picked = (chores.length ? chores : ids).slice(0, 3);
    return picked.length ? { people: picked.map((todo) => ({ name: '', todo, points: '' })) } : {};
  };

  export const meta = {
    type: 'chores',
    name: 'Chores',
    icon: 'mdi:broom',
    category: 'Info',
    size: { w: 560, h: 400 },
    tap: 'none',
    defaults: { people: [], title: '', hide_empty: false, rank: true },
    autofill,
    sections: [
      { key: 'head', label: 'Title' },
      { key: 'rank', label: 'Leaderboard' },
    ],
    fields: [
      { key: 'people', label: 'People', type: 'people' },
      { key: 'title', label: 'Title (blank = "Chores")', type: 'text' },
      { key: 'rank', label: 'Show the leaderboard', type: 'bool' },
      { key: 'hide_empty', label: 'Hide people with nothing left', type: 'bool' },
    ],
  };
</script>

<script>
  // One column per person with their to-do list; tick a chore off from the card.
  // A leaderboard ranks the household: by a points counter when every person has one,
  // otherwise by who has the fewest chores left.
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { subscribe, callService, conn } from '../lib/ha.svelte.js';
  import { name as entName } from '../lib/entity.js';

  let { props, h = 400 } = $props();
  const show = (k) => !props.hide?.[k];

  const people = $derived(
    (props.people || []).map((p, i) => {
      const todo = p?.todo ? String(t(p.todo)).trim() : '';
      const points = p?.points ? String(t(p.points)).trim() : '';
      const e = todo ? states.get(todo) : undefined;
      const label = (p?.name ? String(t(p.name)).trim() : '') || entName(e) || todo || `Person ${i + 1}`;
      return { key: todo || `row${i}`, todo, points, name: label, entity: e };
    }),
  );
  // Subscriptions follow the ids, not the whole person object, so a state update
  // does not tear down and rebuild every list subscription.
  const idsKey = $derived(people.map((p) => p.todo).filter(Boolean).join('|'));
  let lists = $state({});

  $effect(() => {
    const ids = idsKey ? idsKey.split('|') : [];
    if (!conn.connected || !ids.length) return;
    const stops = ids.map((id) =>
      subscribe({ type: 'todo/item/subscribe', entity_id: id }, (ev) => {
        lists = { ...lists, [id]: ev.items || [] };
      }),
    );
    return () => stops.forEach((stop) => stop());
  });

  const items = (id) => lists[id] || [];
  const open = (id) => items(id).filter((i) => i.status !== 'completed');
  const canTick = (id) => !!(Number(states.get(id)?.attributes.supported_features || 0) & 4);

  function tick(id, item) {
    if (!canTick(id)) return;
    const status = item.status === 'completed' ? 'needs_action' : 'completed';
    lists = { ...lists, [id]: items(id).map((i) => (i.uid === item.uid && i.summary === item.summary ? { ...i, status } : i)) };
    callService('todo', 'update_item', { item: item.uid || item.summary, status }, { entity_id: id });
  }

  const ranked = $derived.by(() => {
    const rows = people.map((p) => {
      const loaded = !!lists[p.todo];
      const left = open(p.todo).length;
      const raw = p.points ? ent(p.points)?.state : null;
      const num = raw == null || ['', 'unknown', 'unavailable'].includes(String(raw)) ? NaN : Number(raw);
      return { key: p.key, name: p.name, left, loaded, pts: Number.isFinite(num) ? num : null };
    });
    // Points only rank the household when every person is counted; a half-filled
    // board would compare a counter with a chore count.
    const allPts = rows.length > 1 && rows.every((r) => r.pts !== null);
    const sorted = [...rows].sort((a, b) => (allPts ? b.pts - a.pts : a.left - b.left));
    return { allPts, rows: sorted };
  });

  const shown = $derived(
    props.hide_empty
      ? people.filter((p) => !lists[p.todo] || open(p.todo).length > 0)
      : people,
  );
  const totalLeft = $derived(people.reduce((n, p) => n + (lists[p.todo] ? open(p.todo).length : 0), 0));
  const anyLoaded = $derived(people.some((p) => lists[p.todo]));
  const title = $derived(String(t(props.title) || '').trim() || 'Chores');
  const small = $derived(h < 190);
  const board = $derived(show('rank') && ranked.rows.length > 1 && h >= 250);

  const hue = (s) => {
    let x = 0;
    for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) % 360;
    return x;
  };
</script>

<div class="chores" class:small>
  {#if show('head') && !small}
    <div class="head">
      <Icon icon="mdi:broom" size="1.15em" />
      <span class="t">{title}</span>
      {#if anyLoaded}<span class="n">{totalLeft} left</span>{/if}
    </div>
  {/if}

  {#if !people.length}
    <div class="msg">Add the people and their to-do lists in the card's settings.</div>
  {:else if !shown.length}
    <div class="msg"><Icon icon="mdi:check-all" size="1.3em" /> Everything's done</div>
  {:else}
    <div class="cols" data-stop>
      {#each shown as p (p.key)}
        <section class="col">
          <div class="p">
            <span class="av" style="--h:{hue(p.name)}">{(p.name || '?').slice(0, 1).toUpperCase()}</span>
            <span class="nm">{p.name}</span>
            {#if lists[p.todo]}
              <span class="ct" class:zero={open(p.todo).length === 0}>{open(p.todo).length || '✓'}</span>
            {/if}
          </div>
          <div class="list">
            {#each open(p.todo) as item (item.uid || item.summary)}
              <button class="it" onclick={() => tick(p.todo, item)} disabled={!canTick(p.todo)} title={item.summary}>
                <span class="box"></span>
                <span class="tx">{item.summary}</span>
              </button>
            {:else}
              {#if lists[p.todo]}
                <div class="all"><Icon icon="mdi:check-all" size="1.05em" /><span>All done</span></div>
              {:else if p.entity}
                <div class="all load">Loading…</div>
              {:else}
                <div class="all load">No list picked</div>
              {/if}
            {/each}
          </div>
        </section>
      {/each}
    </div>

    {#if board}
      <div class="board">
        <span class="bl">{ranked.allPts ? 'Points' : 'Fewest left'}</span>
        <ol>
          {#each ranked.rows as r, i (r.key)}
            <li class:lead={i === 0 && r.loaded}>
              <span class="rk">{i + 1}</span>
              <span class="bn">{r.name}</span>
              <span class="bv">{ranked.allPts ? `${r.pts} pts` : `${r.left} left`}</span>
            </li>
          {/each}
        </ol>
      </div>
    {/if}
  {/if}
</div>

<style>
  .chores {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: min(8px, 2.5cqh);
    container-type: size;
  }
  .head { display: flex; align-items: center; gap: 8px; font-weight: 600; flex: none; }
  .head :global(svg) { color: var(--accent); flex: none; }
  .t { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .n {
    flex: none;
    padding: 0 0.5em;
    height: 1.6em;
    border-radius: 1em;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    font-size: 0.76em;
  }
  .msg {
    flex: 1;
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--muted);
    font-size: 0.88em;
  }

  .cols {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr));
    gap: min(10px, 3cqw);
    align-content: start;
  }
  .col {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0 2px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--text) 5%, transparent);
    border: 1px solid color-mix(in srgb, var(--text) 7%, transparent);
    padding: 6px 8px 4px;
  }
  .p { display: flex; align-items: center; gap: 6px; flex: none; min-width: 0; }
  .av {
    flex: none;
    width: min(1.5em, 5cqh);
    height: min(1.5em, 5cqh);
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 0.78em;
    font-weight: 700;
    background: hsl(var(--h) 60% 50% / 0.35);
    color: var(--text);
  }
  .nm {
    flex: 1;
    min-width: 0;
    font-size: 0.84em;
    font-weight: 600;
    line-height: 1.2;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .ct {
    flex: none;
    min-width: 1.5em;
    padding: 0 0.35em;
    height: 1.5em;
    border-radius: 1em;
    display: grid;
    place-items: center;
    font-size: 0.72em;
    font-weight: 700;
    background: color-mix(in srgb, var(--accent) 20%, transparent);
  }
  .ct.zero { background: color-mix(in srgb, #5bd88f 28%, transparent); }

  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .list::-webkit-scrollbar { width: 4px; }
  .list::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--text) 22%, transparent); border-radius: 4px; }
  .it {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: min(5px, 1.6cqh) 3px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .it:active:not(:disabled) { background: color-mix(in srgb, var(--text) 8%, transparent); }
  .it:disabled { cursor: default; opacity: 0.75; }
  .box {
    flex: none;
    width: min(1.05em, 3.6cqh);
    height: min(1.05em, 3.6cqh);
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--text) 38%, transparent);
  }
  .tx {
    flex: 1;
    min-width: 0;
    font-size: 0.85em;
    line-height: 1.25;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .all {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 0;
    color: color-mix(in srgb, #5bd88f 80%, var(--text));
    font-size: 0.8em;
  }
  .all.load { color: var(--muted); }

  .board { flex: none; display: flex; align-items: center; gap: 8px; min-width: 0; }
  .bl {
    flex: none;
    font-size: 0.66em;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 700;
  }
  .board ol { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; gap: 6px; list-style: none; margin: 0; padding: 0; }
  .board li {
    flex: 1 1 auto;
    min-width: 92px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 7px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text) 6%, transparent);
    font-size: 0.72em;
  }
  .board li.lead { background: color-mix(in srgb, var(--accent) 26%, transparent); }
  .rk { flex: none; font-weight: 700; opacity: 0.7; }
  .bn { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bv { flex: none; opacity: 0.85; font-variant-numeric: tabular-nums; }

  @container (max-width: 460px) {
    .board .bl { display: none; }
  }
  @container (max-width: 330px) {
    .board li { padding: 3px 5px; }
  }
  .small .col { padding: 4px 6px 2px; }
  .small .it { padding: 3px 2px; }
</style>
