<script>
  // Picks a folder or album from Home Assistant's media browser (local media,
  // Immich, and any other media source), for the photo frame card.
  import Icon from './Icon.svelte';
  import { send } from '../lib/ha.svelte.js';
  let { value = '', title = '', onpick } = $props();

  let open = $state(false);
  let path = $state([]); // [{ id, title }] from the top level down
  let items = $state([]);
  let here = $state(null);
  let error = $state('');
  let loading = $state(false);

  async function browse(id, crumbs) {
    loading = true; error = '';
    try {
      const r = await send({ type: 'media_source/browse_media', ...(id ? { media_content_id: id } : {}) });
      here = r;
      items = r.children || [];
      path = crumbs;
    } catch (e) {
      error = e?.message || 'Could not open this folder';
    }
    loading = false;
  }
  const start = () => { open = true; browse('', []); };
  const into = (c) => browse(c.media_content_id, [...path, { id: c.media_content_id, title: c.title }]);
  const up = () => { const p = path.slice(0, -1); browse(p.at(-1)?.id || '', p); };
  const folders = $derived(items.filter((c) => c.can_expand));
  const photos = $derived(items.filter((c) => !c.can_expand && (c.media_class === 'image' || String(c.media_content_type).startsWith('image/'))).length);
  function use() {
    const id = path.at(-1)?.id;
    if (!id) return;
    onpick?.(id, path.map((p) => p.title).join(' › '));
    open = false;
  }
</script>

<div class="mf">
  {#if !open}
    <div class="cur">
      <Icon icon="mdi:folder-image" size="1.1em" />
      <span class="t">{title || value || 'No folder chosen'}</span>
      <button type="button" onclick={start}>{value ? 'Change' : 'Choose'}</button>
    </div>
  {:else}
    <div class="crumb">
      <button type="button" class="ic" onclick={up} disabled={!path.length} aria-label="Up"><Icon icon="mdi:arrow-up" size="1em" /></button>
      <span class="t">{path.map((p) => p.title).join(' › ') || 'Media'}</span>
      <button type="button" class="ic" onclick={() => (open = false)} aria-label="Cancel"><Icon icon="mdi:close" size="1em" /></button>
    </div>
    {#if error}<div class="msg">{error}</div>
    {:else if loading}<div class="msg">Loading…</div>
    {:else}
      <div class="list">
        {#each folders as c (c.media_content_id)}
          <button type="button" class="row" onclick={() => into(c)}><Icon icon="mdi:folder-outline" size="1.1em" /><span class="t">{c.title}</span><Icon icon="mdi:chevron-right" size="1em" /></button>
        {/each}
        {#if !folders.length && !photos}<div class="msg">Nothing here</div>{/if}
      </div>
      {#if path.length}
        <button type="button" class="use" onclick={use} disabled={!photos && !folders.length}>Use “{path.at(-1).title}”{photos ? ` (${photos} photo${photos === 1 ? '' : 's'})` : ''}</button>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .mf { display: flex; flex-direction: column; gap: 6px; }
  .cur, .crumb { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .t { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px; }
  button { font: inherit; font-size: 12px; color: inherit; background: rgba(255,255,255,.08); border: 0; border-radius: 8px; padding: 6px 10px; cursor: pointer; }
  button:disabled { opacity: .4; cursor: default; }
  .ic { padding: 5px; display: grid; place-items: center; }
  .list { display: flex; flex-direction: column; gap: 2px; max-height: 220px; overflow-y: auto; }
  .row { display: flex; align-items: center; gap: 8px; text-align: left; background: rgba(255,255,255,.04); }
  .use { background: color-mix(in srgb, var(--accent) 30%, transparent); font-weight: 600; }
  .msg { font-size: 12px; color: var(--muted); padding: 6px 2px; }
</style>
