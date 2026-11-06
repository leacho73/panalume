<script module>
  import { states } from '../lib/ha.svelte.js';
  // The shopping list if there is one, otherwise the first to-do list.
  const autofill = () => {
    const ids = [...states.keys()].filter((id) => id.startsWith('todo.')).sort();
    return { entity: ids.find((id) => id === 'todo.shopping_list') || ids[0] || '' };
  };
  export const meta = {
    type: 'todo', name: 'To-do list', icon: 'mdi:clipboard-check-outline', category: 'Info',
    size: { w: 320, h: 360 }, tap: 'none',
    defaults: { entity: '', add: true, done: true, staples: '' },
    autofill,
    sections: [{ key: 'head', label: 'Title' }, { key: 'add', label: 'Adding items' }],
    fields: [
      { key: 'entity', label: 'List', type: 'entity', domain: 'todo', hint: 'Home Assistant\'s shopping list, a Local to-do list, Todoist, Google Tasks…' },
      { key: 'name', label: 'Title (blank = the list\'s name)', type: 'text' },
      { key: 'add', label: 'Add items from the card', type: 'bool' },
      { key: 'staples', label: 'Quick-add items', type: 'text', hint: 'Comma separated, shown as one-tap chips: Milk, Eggs, Bread' },
      { key: 'badges', label: 'Show quantities as badges', type: 'bool', hint: '"2 x Milk" or "Milk x2" shows as Milk with a small ×2.' },
      { key: 'done', label: 'Show ticked items (under "Done")', type: 'bool' },
    ],
  };
</script>

<script>
  // A to-do list from Home Assistant (shopping list, Local to-do, Todoist…): tick items off,
  // add new ones, and clear the ticked ones. Live: changes from anywhere show at once.
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { subscribe, callService, conn } from '../lib/ha.svelte.js';
  import { name } from '../lib/entity.js';
  import { SvelteSet } from 'svelte/reactivity';
  let { props, h = 360 } = $props();
  const show = (k) => !props.hide?.[k];

  const e = $derived(ent(props.entity));
  const id = $derived(e?.entity_id || '');
  // What the list allows (HA's TodoListEntityFeature): add 1, remove 2, update (tick) 4.
  const feat = $derived(Number(e?.attributes.supported_features) || 0);
  const canAdd = $derived(!!(feat & 1));
  const canRemove = $derived(!!(feat & 2));
  const canTick = $derived(!!(feat & 4));

  let items = $state([]);
  let loaded = $state(false);
  $effect(() => {
    if (!id || !conn.connected) return;
    loaded = false;
    return subscribe({ type: 'todo/item/subscribe', entity_id: id }, (ev) => { items = ev.items || []; loaded = true; });
  });
  const open = $derived(items.filter((i) => i.status !== 'completed'));
  const done = $derived(items.filter((i) => i.status === 'completed'));
  let showDone = $state(false);

  const call = (svc, data) => callService('todo', svc, data, { entity_id: id });
  // Tick straight away on screen; the live list confirms it a moment later.
  function tick(item) {
    if (!canTick) return;
    const status = item.status === 'completed' ? 'needs_action' : 'completed';
    items = items.map((i) => (i === item ? { ...i, status } : i));
    call('update_item', { item: item.uid || item.summary, status });
  }
  let text = $state('');
  function add(want) {
    const s = String(want ?? '').trim();
    if (!s || !canAdd) return;
    call('add_item', { item: s });
  }
  // A quick-add chip: an item already in Done comes back rather than being added twice.
  // Once tapped it hides at once, so a double tap can't add it twice.
  const tapped = new SvelteSet();
  function quick(s) {
    const key = s.toLowerCase();
    if (tapped.has(key)) return;
    tapped.add(key);
    setTimeout(() => tapped.delete(key), 5000);
    const old = done.find((i) => split(i).label.toLowerCase() === key || (i.summary || '').trim().toLowerCase() === key);
    if (old && canTick) call('update_item', { item: old.uid || old.summary, status: 'needs_action' });
    else add(s);
  }
  function submit(ev) {
    ev?.preventDefault();
    add(text);
    text = '';
  }
  const clearDone = () => call('remove_completed_items', {});

  // "2 x milk" and "milk x2" both mean two of them; anything else keeps its name whole.
  // The x needs a space on its far side, so "6x4 frames", "Firefox 3" and "1 xmas card" stay whole.
  function split(item) {
    const s = item.summary || '';
    const m = s.match(/^(\d+(?:[.,]\d+)?)\s*[x×]\s+(.+)$/i) || s.match(/^(.+?)\s+[x×]\s*(\d+(?:[.,]\d+)?)$/i);
    if (!m) return { qty: '', label: s };
    const [qty, label] = /^\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
    return { qty: `×${qty}`, label: label.trim() };
  }

  // A regular already on the list is not a chip; "2 x Milk" counts as Milk.
  const staples = $derived.by(() => {
    const have = new Set(open.flatMap((i) => [(i.summary || '').trim().toLowerCase(), split(i).label.toLowerCase()]));
    return String(props.staples || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !have.has(s.toLowerCase()) && !tapped.has(s.toLowerCase()));
  });

  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  function due(item) {
    if (!item.due) return null;
    const d = new Date(item.due.length <= 10 ? `${item.due}T00:00` : item.due);
    if (isNaN(d)) return null;
    const day = new Date(d); day.setHours(0, 0, 0, 0);
    const diff = Math.round((day - today()) / 864e5);
    const label = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : d.toLocaleDateString(undefined, diff > 1 && diff < 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' });
    return { label, late: diff < 0 && item.status !== 'completed' };
  }
  const title = $derived(t(props.name) || name(e) || 'To-do');
  const small = $derived(h < 170);
</script>

<div class="todo" class:small>
  {#if show('head') && !small}
    <div class="head">
      <Icon icon={e?.attributes.icon || 'mdi:clipboard-check-outline'} size="1.2em" />
      <span class="t">{title}</span>
      {#if open.length}<span class="n">{open.length}</span>{/if}
    </div>
  {/if}

  {#if !props.entity}
    <div class="msg">Pick a to-do list in the card's settings.</div>
  {:else if !e}
    <div class="msg">List not found</div>
  {:else}
    {#if props.add !== false && canAdd && !small}
      {#if show('add') && staples.length}
        <div class="chips" data-stop>
          {#each staples as s (s)}
            <button class="chip" onclick={() => quick(s)}>{s}</button>
          {/each}
        </div>
      {/if}
      {#if show('add')}
        <form class="add" onsubmit={submit} data-stop>
          <input bind:value={text} placeholder="Add an item" enterkeyhint="done" />
          <button type="submit" disabled={!text.trim()} aria-label="Add"><Icon icon="mdi:plus" size="1.2em" /></button>
        </form>
      {/if}
    {/if}
    <div class="list" data-stop>
      {#each open as item (item.uid || item.summary)}
        {@const d = due(item)}
        {@const q = props.badges ? split(item) : { qty: '' }}
        <button class="it" onclick={() => tick(item)} disabled={!canTick}>
          <span class="box"></span>
          <!-- Without a badge the row is plain text, exactly as before. -->
          <span class="tx">{#if q.qty}<span class="nm"><span class="l">{q.label}</span><span class="qty">{q.qty}</span></span>{:else}{item.summary}{/if}{#if d}<small class:late={d.late}>{d.label}</small>{/if}</span>
        </button>
      {:else}
        {#if loaded}<div class="empty"><Icon icon="mdi:check-all" size="1.3em" />All done</div>{/if}
      {/each}
      {#if props.done !== false && done.length}
        <div class="donebar">
          <button class="dt" onclick={() => (showDone = !showDone)} aria-expanded={showDone}><Icon icon={showDone ? 'mdi:chevron-down' : 'mdi:chevron-right'} size="1.1em" />Done ({done.length})</button>
          {#if canRemove}<button class="clear" onclick={clearDone}>Clear</button>{/if}
        </div>
        {#if showDone}
          {#each done as item (item.uid || item.summary)}
            <button class="it done" onclick={() => tick(item)} disabled={!canTick}>
              <span class="box"><Icon icon="mdi:check" size=".85em" /></span>
              <span class="tx">{item.summary}</span>
            </button>
          {/each}
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .todo { height: 100%; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
  .head { display: flex; align-items: center; gap: 8px; font-weight: 600; }
  .head :global(svg) { color: var(--accent); flex: none; }
  .t { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .n { flex: none; min-width: 1.6em; height: 1.6em; padding: 0 .45em; border-radius: 1em; display: grid; place-items: center; background: color-mix(in srgb, var(--accent) 25%, transparent); font-size: .78em; }
  .msg { flex: 1; display: grid; place-items: center; text-align: center; color: var(--muted); font-size: .85em; }
  .add { display: flex; gap: 6px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); border-radius: 99px; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--text); font: inherit; font-size: .82em; padding: 5px 11px; cursor: pointer; }
  .chip:active { background: color-mix(in srgb, var(--accent) 28%, transparent); }
  .add input { flex: 1; min-width: 0; padding: 8px 11px; border-radius: 10px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05); color: inherit; font: inherit; font-size: .9em; }
  .add input:focus { outline: none; border-color: var(--accent); }
  .add button { flex: none; width: 2.4em; border: 0; border-radius: 10px; background: color-mix(in srgb, var(--accent) 30%, transparent); color: var(--text); display: grid; place-items: center; }
  .add button:disabled { opacity: .4; }
  .list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; scrollbar-width: thin; mask-image: linear-gradient(to bottom, #000 calc(100% - 16px), transparent); }
  .it { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 6px; border: 0; border-radius: 9px; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  .it:active:not(:disabled) { background: rgba(255,255,255,.05); }
  .it:disabled { cursor: default; }
  .box { flex: none; width: 1.25em; height: 1.25em; border-radius: 50%; border: 2px solid rgba(255,255,255,.35); display: grid; place-items: center; color: #0b0f17; }
  .done .box { background: var(--accent); border-color: var(--accent); }
  .tx { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: .92em; overflow-wrap: anywhere; }
  .nm { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .l { min-width: 0; overflow-wrap: anywhere; }
  .qty { flex: none; font-size: .8em; font-weight: 600; padding: 1px 6px; border-radius: 99px; background: color-mix(in srgb, var(--accent) 26%, transparent); }
  .tx small { font-size: .75em; color: var(--muted); }
  .tx small.late { color: #ff8a8a; }
  .done .tx { color: var(--muted); text-decoration: line-through; }
  .empty { display: flex; align-items: center; gap: 8px; justify-content: center; padding: 14px 0; color: var(--muted); font-size: .85em; }
  .donebar { display: flex; align-items: center; margin-top: 6px; }
  .dt { display: inline-flex; align-items: center; gap: 2px; border: 0; background: none; color: var(--muted); font: inherit; font-size: .78em; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; padding: 4px 0; cursor: pointer; }
  .clear { margin-left: auto; border: 0; background: none; color: var(--accent); font: inherit; font-size: .8em; cursor: pointer; }
  .small .it { padding: 5px 4px; }
</style>
