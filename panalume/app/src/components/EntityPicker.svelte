<script>
  import Icon from './Icon.svelte';
  import { states } from '../lib/ha.svelte.js';
  import { entityIcon, name } from '../lib/entity.js';
  let { value = $bindable(''), domain = null, onpick, placeholder = 'Search entities…', inline = false } = $props();
  let q = $state('');
  let open = $state(false);
  const domains = $derived(domain ? (Array.isArray(domain) ? domain : [domain]) : null);
  const results = $derived.by(() => {
    if (!open) return [];
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const out = [];
    for (const [id, e] of states) {
      if (domains && !domains.includes(id.split('.')[0])) continue;
      const hay = (id + ' ' + name(e) + ' ' + (e.attributes.friendly_name || '')).toLowerCase();
      if (terms.every((t) => hay.includes(t))) out.push(e);
      if (out.length >= 60) break;
    }
    return out;
  });
  function pick(id) {
    if (onpick) onpick(id);
    else value = id;
    q = '';
    open = false;
  }
</script>

<div class="ep">
  <input type="text" value={onpick ? q : open ? q : value} {placeholder}
    onfocus={() => { open = true; q = onpick ? q : ''; }}
    onclick={() => (open = true)}
    oninput={(e) => { q = e.currentTarget.value; open = true; }}
    onblur={() => setTimeout(() => (open = false), 150)}
    onkeydown={(e) => { if (e.key === 'Enter' && results[0]) pick(results[0].entity_id); if (e.key === 'Enter' && !results[0] && q.includes('.')) pick(q); }} />
  {#if !onpick && value && !open}
    <button type="button" class="clear" title="Remove" aria-label="Remove entity" onclick={() => (value = '')}><Icon icon="mdi:close" size="14px" /></button>
  {/if}
  {#if open && results.length}
    <div class="list" class:inline>
      {#each results as e (e.entity_id)}
        <button type="button" onmousedown={(ev) => ev.preventDefault()} onclick={() => pick(e.entity_id)}>
          <Icon icon={entityIcon(e)} size="1.1em" />
          <span class="n">{name(e)}<small>{e.entity_id}</small></span>
          <span class="s">{e.state}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .ep { position: relative; }
  .ep:has(.clear) input { padding-right: 30px; }
  .clear { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); width: 24px; height: 24px; padding: 0; justify-content: center; border-radius: 6px; color: var(--muted); }
  .clear:hover { color: var(--text); }
  .list { position: absolute; z-index: 50; left: 0; right: 0; top: calc(100% + 4px); max-height: 300px; overflow: auto; background: #1b2030; border: 1px solid rgba(255,255,255,.1); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.5); }
  .list.inline { position: relative; z-index: auto; top: auto; margin-top: 4px; }
  button { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; background: none; border: 0; color: inherit; padding: 7px 10px; font: inherit; font-size: 13px; }
  button:hover { background: rgba(255,255,255,.07); }
  .n { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  small { color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; }
  .s { color: var(--muted); font-size: 11px; max-width: 70px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
