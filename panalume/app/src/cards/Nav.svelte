<script module>
  export const meta = {
    type: 'nav', name: 'Navigation', icon: 'mdi:menu', category: 'Layout',
    size: { w: 260, h: 220 }, tap: 'none',
    defaults: { direction: 'vertical', show_icons: true, show_names: true, icon_style: 'plain' },
    fields: [
      { key: 'direction', label: 'Direction', type: 'select', options: ['vertical', 'horizontal'] },
      { key: 'show_icons', label: 'Icons', type: 'bool' },
      { key: 'icon_style', label: 'Icon style', type: 'select', options: [{ value: 'plain', label: 'Plain' }, { value: 'tile', label: 'Tile (Android-style)' }], hint: 'A tile is a rounded, tinted square behind each icon, filled with the accent colour for the view you are on.' },
      { key: 'show_names', label: 'Names', type: 'bool' },
    ],
  };
</script>

<script>
  import Icon from '../components/Icon.svelte';
  import { app, setView } from '../lib/config.svelte.js';
  let { props, w = 0, h = 0 } = $props();
  // A wide, short nav card lays out horizontally whatever its setting (e.g. on phones).
  const dir = $derived(w > h * 3 ? 'horizontal' : props.direction);
  const tiles = $derived(props.icon_style === 'tile');
</script>

<nav class="nav {dir}" class:tiles data-stop>
  {#each app.config.views as v}
    <button class:sel={app.view === v.id} onclick={() => setView(v.id)}>
      {#if props.show_icons !== false && v.icon}
        {#if tiles}
          <span class="tile"><Icon icon={v.icon} size="1.15em" /></span>
        {:else}
          <Icon icon={v.icon} size="1.3em" />
        {/if}
      {/if}
      {#if props.show_names !== false}<span class="name">{v.name}</span>{/if}
    </button>
  {/each}
</nav>

<style>
  .nav { height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 4px; overflow: hidden; }
  /* Rows share the height: they shrink together when the card is short instead of overflowing. */
  .nav:not(.horizontal) button { flex: 0 1 46px; min-height: 0; padding-block: 0; }
  .horizontal { flex-direction: row; align-items: center; }
  button { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; border: 0; background: none; color: var(--muted); font: inherit; font-weight: 500; text-align: left; white-space: nowrap; transition: all .2s; min-width: 0; }
  .horizontal { gap: 2px; }
  .horizontal button { flex: 1 1 0; min-width: 0; justify-content: center; gap: 6px; padding: 10px 6px; font-size: .9em; }
  .horizontal button span { overflow: hidden; text-overflow: ellipsis; }
  button.sel { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--text); }
  button.sel :global(svg) { color: var(--accent); }
  /* Android-style tiles: a rounded square of tint per icon, the view you are on
     in the accent colour with the glyph knocked out of it. */
  /* The tile gives way when the card is short, so a thin bar keeps its labels. */
  .nav { --tile: 1.9em; }
  .tiles { --tile: min(1.9em, 44cqh); }
  .tile { flex: none; display: grid; place-items: center; width: var(--tile); height: var(--tile); border-radius: 30%; background: rgba(255,255,255,.08); transition: background .2s; }
  .tiles :global(svg) { transition: color .2s; }
  .tiles button.sel .tile { background: var(--accent); }
  .tiles button.sel .tile :global(svg) { color: #0b0f16; }
  .tiles button.sel { background: none; }
  .tiles button:hover .tile { background: rgba(255,255,255,.14); }
  .tiles button.sel:hover .tile { background: var(--accent); }
  /* On a bar, the tile sits over its label the way an Android bottom bar does;
     the label steps aside when the bar is too narrow to hold one per item. */
  .nav { container-type: size; }
  .tiles.horizontal button { flex-direction: column; gap: 2px; padding: 2px 4px; font-size: .82em; }
  .tiles.horizontal .name { font-size: 1.02em; line-height: 1.1; }
  @container (max-width: 340px) { .tiles.horizontal .name { display: none; } }
  .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
</style>
