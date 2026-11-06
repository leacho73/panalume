<script>
  // Repeatable rows of { name, todo, points } for the Chores card: one row per person.
  // Class names are prefixed (prow/padd…) so they cannot collide with the pickers' own .row.
  import Icon from './Icon.svelte';
  import EntityPicker from './EntityPicker.svelte';

  let { values = [], onupdate } = $props();

  const rows = $derived(Array.isArray(values) ? values : []);
  const read = (r) => ({ name: r?.name || '', todo: r?.todo || '', points: r?.points || '' });
  const commit = (next) => onupdate(next.map(read));
  const set = (i, k, v) => commit(rows.map((r, j) => (j === i ? { ...read(r), [k]: v } : read(r))));
  const add = () => commit([...rows.map(read), { name: '', todo: '', points: '' }]);
  const del = (i) => commit(rows.filter((_, j) => j !== i).map(read));
  const move = (i, d) => {
    const next = rows.map(read);
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
</script>

<div class="people">
  {#each rows as r, i (i)}
    <div class="prow">
      <div class="ptop">
        <input
          class="pnm"
          type="text"
          value={r.name || ''}
          placeholder="Name (blank = the list's own name)"
          oninput={(e) => set(i, 'name', e.currentTarget.value)}
        />
        <button type="button" disabled={i === 0} title="Move up" aria-label="Move up" onclick={() => move(i, -1)}>
          <Icon icon="mdi:arrow-up" size="14px" />
        </button>
        <button type="button" disabled={i === rows.length - 1} title="Move down" aria-label="Move down" onclick={() => move(i, 1)}>
          <Icon icon="mdi:arrow-down" size="14px" />
        </button>
        <button type="button" title="Remove person" aria-label="Remove person" onclick={() => del(i)}>
          <Icon icon="mdi:close" size="14px" />
        </button>
      </div>
      <EntityPicker
        bind:value={() => r.todo || '', (v) => set(i, 'todo', v)}
        domain="todo"
        placeholder="To-do list…"
      />
      <EntityPicker
        bind:value={() => r.points || '', (v) => set(i, 'points', v)}
        domain={['number', 'input_number', 'counter']}
        placeholder="Points counter (optional)…"
      />
    </div>
  {/each}
  <button type="button" class="padd" onclick={add}><Icon icon="mdi:plus" size="14px" /> Add person</button>
</div>

<style>
  .people { display: flex; flex-direction: column; gap: 8px; }
  .prow {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 8px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.07);
  }
  .ptop { display: flex; align-items: center; gap: 4px; }
  .pnm {
    flex: 1;
    min-width: 0;
    padding: 6px 9px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
    color: inherit;
    font: inherit;
    font-size: 13px;
  }
  .ptop button {
    flex: none;
    background: none;
    border: 0;
    color: var(--muted);
    padding: 5px;
    border-radius: 6px;
    display: grid;
  }
  .ptop button:hover:not(:disabled) { background: rgba(255, 255, 255, 0.1); }
  .ptop button:disabled { opacity: 0.3; }
  .padd {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 11px;
    border-radius: 8px;
    border: 1px dashed rgba(255, 255, 255, 0.2);
    background: none;
    color: var(--accent);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
</style>
