<script>
  // Generic settings field, bound to obj[key]. Text fields accept HA templates.
  import EntityPicker from './EntityPicker.svelte';
  import IconPicker from './IconPicker.svelte';
  import MediaFolderPicker from './MediaFolderPicker.svelte';
  import Icon from './Icon.svelte';
  import { states } from '../lib/ha.svelte.js';
  import { changed, app } from '../lib/config.svelte.js';
  import { isTpl } from '../lib/tpl.js';
  let { obj, f, onset, hide = null, ontoggle } = $props();
  const set = (v) => { if (onset) return onset(v); obj[f.key] = v; changed(); };
  // Ready-made colours for colour-button settings (click to add / remove, in order).
  const PALETTE = [['Red', '#ff4d4d'], ['Orange', '#ff9a3c'], ['Amber', '#ffc861'], ['Yellow', '#fff35c'], ['Lime', '#b6f25c'], ['Green', '#5bd88f'], ['Teal', '#2ed3c4'], ['Cyan', '#4fe0ff'],
    ['Sky blue', '#4fb4ff'], ['Blue', '#4f6bff'], ['Indigo', '#7a6bff'], ['Purple', '#b48cff'], ['Magenta', '#ff5cd6'], ['Pink', '#ff8fb1'], ['Warm white', '#ffd7a8'], ['Cool white', '#e6f0ff']];
  const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : '#7aa2ff');
</script>

<div class="field" class:wide={f.type === 'textarea' || f.type === 'entities' || f.type === 'cards'}>
  {#if f.type !== 'bool'}<label for={f.key}>{f.label}{#if isTpl(obj[f.key])}<span class="tpl">template</span>{/if}
    {#if ontoggle}<button type="button" class="eye" class:off={hide} title={hide ? 'Hidden on the card — click to show' : 'Shown on the card — click to hide'} onclick={ontoggle}><Icon icon={hide ? 'mdi:eye-off-outline' : 'mdi:eye'} size="15px" /></button>{/if}</label>{/if}
  {#if f.type === 'media-folder'}
    <MediaFolderPicker value={obj[f.key] || ''} title={obj[f.key + '_title'] || ''} onpick={(id, title) => { obj[f.key + '_title'] = title; set(id); }} />
  {:else if f.type === 'entity'}
    <EntityPicker bind:value={() => obj[f.key] || '', set} domain={f.domain} />
  {:else if f.type === 'entities'}
    <div class="ents">
      {#each obj[f.key] || [] as id, i}
        <div class="chip">
          <span>{states.get(id)?.attributes.friendly_name || id}</span>
          <button type="button" disabled={i === 0} onclick={() => { const a = obj[f.key]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; changed(); }}><Icon icon="mdi:arrow-up" size="14px" /></button>
          <button type="button" onclick={() => { obj[f.key].splice(i, 1); changed(); }}><Icon icon="mdi:close" size="14px" /></button>
        </div>
      {/each}
      <EntityPicker domain={f.domain} placeholder="Add entity…" onpick={(id) => { (obj[f.key] ??= []).push(id); changed(); }} />
    </div>
  {:else if f.type === 'cards'}
    <div class="ents">
      {#each obj[f.key] || [] as id, i}
        <div class="chip"><span>{app.config.cards[id]?.type} · {app.config.cards[id]?.props?.name || app.config.cards[id]?.props?.entity || id}</span>
          <button type="button" onclick={() => { obj[f.key].splice(i, 1); changed(); }}><Icon icon="mdi:close" size="14px" /></button></div>
      {/each}
      <select value="" onchange={(e) => { if (e.currentTarget.value) { (obj[f.key] ??= []).push(e.currentTarget.value); changed(); } e.currentTarget.value = ''; }}>
        <option value="">Add card…</option>
        {#each Object.values(app.config.cards) as c}<option value={c.id}>{c.type} · {c.props?.name || c.props?.entity || c.props?.title || c.id}</option>{/each}
      </select>
    </div>
  {:else if f.type === 'bool'}
    <label class="chk"><input type="checkbox" checked={!!obj[f.key]} onchange={(e) => set(e.currentTarget.checked)} /> {f.label}</label>
  {:else if f.type === 'select'}
    <select id={f.key} value={obj[f.key] ?? ''} onchange={(e) => set(e.currentTarget.value)}>
      {#if !f.options.includes(obj[f.key] ?? '')}<option value="">—</option>{/if}
      {#each f.options as o}<option value={typeof o === 'string' ? o : o.value}>{typeof o === 'string' ? o : o.label}</option>{/each}
    </select>
  {:else if f.type === 'number'}
    <input id={f.key} type="number" value={obj[f.key] ?? ''} oninput={(e) => set(e.currentTarget.value === '' ? '' : Number(e.currentTarget.value))} />
  {:else if f.type === 'color'}
    <div class="color">
      <input type="color" value={hex(obj[f.key])} oninput={(e) => set(e.currentTarget.value)} />
      <input id={f.key} type="text" value={obj[f.key] ?? ''} placeholder={f.placeholder || 'colour / css / template'} oninput={(e) => set(e.currentTarget.value)} />
    </div>
  {:else if f.type === 'swatches'}
    {@const picked = String(obj[f.key] || f.placeholder || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)}
    <div class="pal">
      {#each PALETTE as [name, c]}
        {@const on = picked.includes(c)}
        <button type="button" class="pc" class:on style="background:{c}" title={name} aria-label={name} aria-pressed={on}
          onclick={() => set((on ? picked.filter((x) => x !== c) : [...picked, c]).join(', '))}>{#if on}{picked.indexOf(c) + 1}{/if}</button>
      {/each}
    </div>
    <input id={f.key} type="text" value={obj[f.key] ?? ''} placeholder={f.placeholder || ''} oninput={(e) => set(e.currentTarget.value)} />
  {:else if f.type === 'icon'}
    <IconPicker bind:value={() => obj[f.key] || '', (v) => (obj[f.key] = v)} onchange={changed} />
  {:else if f.type === 'textarea'}
    <textarea id={f.key} rows="5" value={obj[f.key] ?? ''} oninput={(e) => set(e.currentTarget.value)}></textarea>
  {:else}
    <input id={f.key} type="text" value={obj[f.key] ?? ''} placeholder={f.placeholder || ''} oninput={(e) => set(e.currentTarget.value)} />
  {/if}
  {#if f.hint}<div class="hint">{f.hint}</div>{/if}
</div>

<style>
  .field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  label { font-size: 12px; color: var(--muted); display: flex; gap: 6px; align-items: center; }
  .hint { font-size: 11px; color: var(--muted); opacity: .8; line-height: 1.35; }
  .eye { margin-left: auto; background: none; border: 0; color: var(--accent); padding: 0 2px; display: grid; }
  .eye.off { color: var(--muted); opacity: .6; }
  .field:has(.eye.off) :global(input) { opacity: .5; }
  .pal { display: grid; grid-template-columns: repeat(8, 1fr); gap: 5px; margin-bottom: 4px; }
  .pc { aspect-ratio: 1; border-radius: 50%; border: 2px solid transparent; padding: 0; font-size: 10px; font-weight: 700; color: #0b0f16; cursor: pointer; }
  .pc.on { border-color: #fff; box-shadow: 0 0 0 2px rgba(0,0,0,.4); }
  .tpl { background: rgba(122,162,255,.2); color: #a9c1ff; border-radius: 6px; padding: 0 5px; font-size: 10px; }
  .chk { color: var(--text); font-size: 13px; cursor: pointer; }
  .color { display: flex; gap: 6px; }
  .color input[type='color'] { width: 34px; padding: 0; flex: none; height: 34px; border: 0; background: none; }
  .ents { display: flex; flex-direction: column; gap: 4px; }
  .chip { display: flex; align-items: center; gap: 4px; background: rgba(255,255,255,.05); border-radius: 8px; padding: 4px 4px 4px 10px; font-size: 13px; }
  .chip span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip button { background: none; border: 0; color: var(--muted); padding: 4px; border-radius: 6px; display: grid; }
  .chip button:hover { background: rgba(255,255,255,.1); }
</style>
