<script>
  // Picks one of Home Assistant's own dashboards and a view on it, for the web
  // page card. The value is the view's path on Home Assistant (/lovelace/0,
  // /dashboard-cameras/front…), or '' for none.
  import { send } from '../lib/ha.svelte.js';
  let { value = '', onpick } = $props();

  let boards = $state([]);   // [{ path, title }]
  let views = $state([]);    // [{ path, title }] for the chosen dashboard
  let error = $state('');
  const board = $derived(value.split('/')[1] || '');
  const view = $derived(value.split('/').slice(2).join('/'));

  $effect(() => {
    send({ type: 'get_panels' }).then((panels) => {
      boards = Object.values(panels || {}).filter((p) => p.component_name === 'lovelace')
        .map((p) => ({ path: p.url_path, title: p.title || (p.url_path === 'lovelace' ? 'Overview' : p.url_path) }))
        .sort((a, b) => (a.path === 'lovelace' ? -1 : b.path === 'lovelace' ? 1 : a.title.localeCompare(b.title)));
    }).catch((e) => (error = e?.message || 'Could not load the dashboards'));
  });
  $effect(() => {
    const b = board;
    views = [];
    if (!b) return;
    send({ type: 'lovelace/config', url_path: b === 'lovelace' ? null : b }).then((cfg) => {
      if (b !== board) return;
      views = (cfg?.views || []).map((v, i) => ({ path: v.path || String(i), title: v.title || v.path || `View ${i + 1}` }));
    }).catch(() => (views = []));   // e.g. a dashboard Home Assistant builds itself: no view list, its first view is used
  });
  const pickBoard = (b) => onpick?.(b ? `/${b}` : '');
  const pickView = (v) => onpick?.(`/${board}${v ? '/' + v : ''}`);
</script>

{#if error}<div class="msg">{error}</div>{/if}
<div class="hv">
  <select value={board} onchange={(ev) => pickBoard(ev.currentTarget.value)}>
    <option value="">— None (use the URL) —</option>
    {#each boards as b (b.path)}<option value={b.path}>{b.title}</option>{/each}
    {#if board && !boards.some((b) => b.path === board)}<option value={board}>{board}</option>{/if}
  </select>
  {#if board && views.length}
    <select value={view} onchange={(ev) => pickView(ev.currentTarget.value)}>
      {#if !views.some((v) => v.path === view)}<option value={view}>{view || 'First view'}</option>{/if}
      {#each views as v (v.path)}<option value={v.path}>{v.title}</option>{/each}
    </select>
  {/if}
</div>

<style>
  .hv { display: flex; flex-direction: column; gap: 6px; }
  .msg { font-size: .8em; color: var(--muted); }
</style>
