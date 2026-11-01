<script>
  import Icon from './Icon.svelte';
  // A view's mark: an image when one is set, otherwise the icon. The image wins
  // so a view can carry a real logo or a photo, not just a tinted glyph.
  let { view = {}, size = '1.2em', box = false, class: cls = '' } = $props();
  const src = $derived(typeof view?.image === 'string' ? view.image.trim() : '');
</script>

{#if src}
  <img class="vimg {cls}" src={src} alt="" style={box
      ? `width:calc(${size} * 1.7);height:${size};object-fit:contain`
      : `height:${size};max-width:calc(${size} * 1.7)`} loading="lazy" decoding="async" />
{:else}
  <Icon icon={view?.icon || 'mdi:view-dashboard-outline'} {size} class={cls} />
{/if}

<style>
  /* Height matches the SVG glyphs beside it, width follows the image's own aspect
     so a wide wordmark stays readable instead of being squeezed into a square. */
  .vimg { flex: none; display: inline-block; width: auto; object-fit: contain; border-radius: 4px; }
</style>
