<script module>
  import { states } from '../lib/ha.svelte.js';
  // A shopping list, if the house has one. Anything else is left for the person to pick:
  // a chores list with milk on it is worse than an empty card that says what to do.
  const autofill = () => {
    const ids = [...states.keys()].filter((id) => id.startsWith('todo.')).sort();
    return {
      entity:
        ids.find((id) => id === 'todo.shopping_list') ||
        ids.find((id) => /shop|grocer|basket|cart/.test(id)) ||
        '',
    };
  };
  export const meta = {
    type: 'shopping', name: 'Shopping list', icon: 'mdi:cart-outline', category: 'Info',
    size: { w: 360, h: 520 }, tap: 'none',
    defaults: { entity: '', name: '', staples: '', add: true, done: true },
    autofill,
    sections: [
      { key: 'head', label: 'Title' },
      { key: 'add', label: 'Adding items' },
      { key: 'done', label: 'In the trolley' },
    ],
    fields: [
      { key: 'entity', label: 'List', type: 'entity', domain: 'todo', hint: "Home Assistant's shopping list, a Local to-do list named Shopping, Todoist, Google Tasks…" },
      { key: 'name', label: 'Title (blank = the list\'s name)', type: 'text' },
      { key: 'staples', label: 'Quick-add items', type: 'text', hint: 'Comma separated, shown as one-tap chips: Milk, Eggs, Bread' },
      { key: 'add', label: 'Add items from the card', type: 'bool' },
      { key: 'done', label: 'Keep what is ticked (under "In the trolley")', type: 'bool' },
    ],
  };
</script>

<script>
  // A shopping list for a kitchen wall: what is still to get, one tap to cross it off,
  // one tap to put a regular back on, and a line to type something new. Quantities
  // written as "2 x milk" or "milk x2" are shown as a badge and left in the name.
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { subscribe, callService, conn } from '../lib/ha.svelte.js';
  import { name } from '../lib/entity.js';
  let { props, h = 520 } = $props();
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
    return subscribe({ type: 'todo/item/subscribe', entity_id: id }, (ev) => {
      items = ev.items || [];
      loaded = true;
    });
  });
  const open = $derived(items.filter((i) => i.status !== 'completed'));
  const done = $derived(items.filter((i) => i.status === 'completed'));

  const call = (svc, data) => callService('todo', svc, data, { entity_id: id });
  function tick(item) {
    if (!canTick) return;
    const status = item.status === 'completed' ? 'needs_action' : 'completed';
    items = items.map((i) => (i === item ? { ...i, status } : i));
    call('update_item', { item: item.uid || item.summary, status });
  }

  let text = $state('');
  let doneOpen = $state(false);
  function add(want) {
    const s = String(want ?? '').trim();
    if (!s || !canAdd) return;
    const seen = items.some((i) => i.summary.trim().toLowerCase() === s.toLowerCase());
    if (seen) return;
    call('add_item', { item: s });
  }
  function submit(ev) {
    ev?.preventDefault();
    add(text);
    text = '';
  }
  const clearDone = () => call('remove_completed_items', {});

  // "2 x milk" and "milk x2" both mean two of them; anything else keeps its name whole.
  function split(item) {
    const s = item.summary || '';
    let m = s.match(/^(\d+(?:[.,]\d+)?)\s*[x×]\s*(.+)$/i) || s.match(/^(.+?)\s*[x×]\s*(\d+(?:[.,]\d+)?)$/i);
    if (!m) return { qty: '', label: s };
    const [qty, label] = /^\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
    return { qty: `×${qty}`, label: label.trim() };
  }

  const staples = $derived.by(() => {
    // A regular already on the list is not a chip; "2 x Milk" counts as Milk.
    const have = new Set(open.flatMap((i) => [i.summary.trim().toLowerCase(), split(i).label.toLowerCase()]));
    return String(props.staples || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !have.has(s.toLowerCase()));
  });

  const title = $derived(t(props.name) || name(e) || 'Shopping list');
  // Three shapes from one file: a full card, a short card with the rows but no typing
  // (a wall nobody types on), and a single line for a card too short for rows.
  const small = $derived(h < 190);
  const tickerMode = $derived(h < 110);
  const ticker = $derived(
    open.length ? `${open.length} to get · ${open.slice(0, 3).map((i) => split(i).label).join(', ')}${open.length > 3 ? '…' : ''}` : 'Nothing to get'
  );
</script>

<div class="shop" class:small>
  {#if tickerMode}
    <div class="tick" data-stop>
      <Icon icon="mdi:cart-outline" size="1.05em" />
      <span class="tt">{ticker}</span>
    </div>
  {:else if show('head')}
    <div class="head">
      <Icon icon="mdi:cart-outline" size="1.2em" />
      <span class="t">{title}</span>
      <span class="n" class:none={!open.length}>{open.length}</span>
    </div>
  {/if}

  {#if !props.entity}
    <div class="msg">Pick a shopping list in the card's settings.</div>
  {:else if !e}
    <div class="msg">List not found</div>
  {:else if !tickerMode}
    {#if props.add !== false && canAdd && show('add') && !small}
      <form class="add" onsubmit={submit} data-stop>
        <input bind:value={text} placeholder="Add an item" enterkeyhint="done" aria-label="Add an item" />
        <button type="submit" disabled={!text.trim()} aria-label="Add"><Icon icon="mdi:plus" size="1.2em" /></button>
      </form>
      {#if staples.length}
        <div class="chips" data-stop>
          {#each staples.slice(0, 6) as s (s)}
            <button class="chip" onclick={() => add(s)}><Icon icon="mdi:plus" size=".85em" />{s}</button>
          {/each}
        </div>
      {/if}
    {/if}

    <div class="list" data-stop>
      {#each open as item (item.uid || item.summary)}
        {@const p = split(item)}
        <button class="it" onclick={() => tick(item)} disabled={!canTick}>
          <span class="box"></span>
          {#if p.qty}<span class="qty">{p.qty}</span>{/if}
          <span class="tx">{p.label}</span>
        </button>
      {:else}
        {#if loaded}
          <div class="empty"><Icon icon="mdi:cart-check" size="1.4em" />Nothing to get</div>
        {/if}
      {/each}

      {#if props.done !== false && done.length && show('done')}
        <div class="bar">
          <button class="bt" onclick={() => (doneOpen = !doneOpen)} aria-expanded={doneOpen}>
            <Icon icon={doneOpen ? 'mdi:chevron-down' : 'mdi:chevron-right'} size="1.1em" />In the trolley ({done.length})
          </button>
          {#if canRemove}<button class="clear" onclick={clearDone}>Clear</button>{/if}
        </div>
        {#if doneOpen}
          {#each done as item (item.uid || item.summary)}
            <button class="it done" onclick={() => tick(item)} disabled={!canTick} title="Put it back">
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
  .shop { height: 100%; display: flex; flex-direction: column; gap: 8px; min-height: 0; container-type: size; }
  .head { display: flex; align-items: center; gap: 8px; font-weight: 600; flex: none; }
  .head :global(svg) { color: var(--accent); flex: none; }
  .t { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .n { flex: none; min-width: 1.7em; height: 1.7em; padding: 0 .45em; border-radius: 1em; display: grid; place-items: center; background: color-mix(in srgb, var(--accent) 28%, transparent); font-size: .8em; }
  .n.none { background: rgba(255,255,255,.07); color: var(--muted); }
  .tick { display: flex; align-items: center; gap: 8px; min-height: 0; color: var(--text); }
  .tick :global(svg) { color: var(--accent); flex: none; }
  .tt { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: .92em; }
  .msg { flex: 1; display: grid; place-items: center; text-align: center; color: var(--muted); font-size: .85em; padding: 0 8px; }
  .add { display: flex; gap: 6px; flex: none; }
  .add input { flex: 1; min-width: 0; padding: 8px 11px; border-radius: 10px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05); color: inherit; font: inherit; font-size: .9em; }
  .add input:focus { outline: none; border-color: var(--accent); }
  .add button { flex: none; width: 2.4em; border: 0; border-radius: 10px; background: color-mix(in srgb, var(--accent) 32%, transparent); color: var(--text); display: grid; place-items: center; }
  .add button:disabled { opacity: .4; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; flex: none; max-height: min(4.6em, 20cqh); overflow: hidden; }
  .chip { display: inline-flex; align-items: center; gap: 3px; padding: 4px 9px 4px 6px; border: 1px solid rgba(255,255,255,.12); border-radius: 1em; background: rgba(255,255,255,.06); color: var(--text); font: inherit; font-size: .8em; cursor: pointer; }
  .chip:active { background: color-mix(in srgb, var(--accent) 30%, transparent); }
  .list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; scrollbar-width: thin; mask-image: linear-gradient(to bottom, #000 calc(100% - 16px), transparent); }
  .it { display: flex; align-items: center; gap: 10px; width: 100%; flex: none; padding: 9px 6px; border: 0; border-radius: 9px; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  .it:active:not(:disabled) { background: rgba(255,255,255,.05); }
  .it:disabled { cursor: default; }
  .box { flex: none; width: 1.3em; height: 1.3em; border-radius: 50%; border: 2px solid rgba(255,255,255,.35); display: grid; place-items: center; color: #0b0f17; }
  .done .box { background: var(--accent); border-color: var(--accent); }
  .qty { flex: none; font-size: .78em; font-weight: 700; padding: 2px 6px; border-radius: 6px; background: color-mix(in srgb, var(--accent) 26%, transparent); }
  .tx { flex: 1; min-width: 0; font-size: .95em; overflow-wrap: anywhere; }
  .done .tx { color: var(--muted); text-decoration: line-through; }
  .empty { display: flex; align-items: center; gap: 8px; justify-content: center; padding: 16px 0; color: var(--muted); font-size: .85em; }
  .bar { display: flex; align-items: center; margin-top: 6px; flex: none; }
  .bt { display: inline-flex; align-items: center; gap: 2px; border: 0; background: none; color: var(--muted); font: inherit; font-size: .78em; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; padding: 4px 0; cursor: pointer; }
  .clear { margin-left: auto; border: 0; background: none; color: var(--accent); font: inherit; font-size: .8em; cursor: pointer; }
  .small .it { padding: 5px 4px; }
</style>
