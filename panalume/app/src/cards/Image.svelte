<script module>
  export const meta = {
    type: 'image', name: 'Image', icon: 'mdi:image', category: 'Media',
    size: { w: 300, h: 200 }, tap: 'none',
    defaults: { url: '', fit: 'cover' },
    fields: [
      { key: 'url', label: 'Image URL (template ok)', type: 'text' },
      { key: 'fit', label: 'Fit', type: 'select', options: ['cover', 'contain', 'fill'] },
    ],
  };
</script>

<script>
  import { t } from '../lib/tpl.js';
  import { haImage } from '../lib/ha.svelte.js';
  let { props } = $props();
  const src = $derived(haImage(t(props.url)));
</script>

{#if src}<img {src} alt="" style="object-fit:{props.fit}" />{:else}<div class="hint">Give an image address in the card's settings.</div>{/if}

<style>
  .hint { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 0 1em; text-align: center; color: var(--muted); font-size: .82em; }
  img { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: inherit; }
</style>
