<script module>
  import { t, truthy } from '../lib/tpl.js';
  // A view's badge (Views panel): a template that's true for a dot, or an icon name
  // (mdi:walk) for that icon; empty or false for nothing. A template error counts as
  // nothing, not as true, so a typo doesn't leave a badge up for good.
  export function viewBadge(v) {
    if (!v?.badge) return null;
    const r = String(t(v.badge) ?? '').trim();
    if (r.startsWith('⚠') || !truthy(r)) return null;
    const color = String(t(v.badge_color) ?? '').trim();
    return { icon: /^[a-z0-9-]+:[a-z0-9-]+$/.test(r) ? r : '', color: color.startsWith('⚠') ? '' : color };
  }
</script>

<script>
  import Icon from './Icon.svelte';
  // A view's mark: an image when one is set, otherwise the icon. The image wins
  // so a view can carry a real logo or a photo, not just a tinted glyph.
  // With `badge`, the view's badge sits on the mark's top-right corner.
  let { view = {}, size = '1.2em', box = false, badge = false, class: cls = '' } = $props();
  const src = $derived(typeof view?.image === 'string' ? view.image.trim() : '');
  const b = $derived(badge ? viewBadge(view) : null);
</script>

{#snippet mark()}
  {#if src}
    <img class="vimg {cls}" src={src} alt="" style={box
        ? `width:calc(${size} * 1.7);height:${size};object-fit:contain`
        : `height:${size};max-width:calc(${size} * 1.7)`} loading="lazy" decoding="async" />
  {:else}
    <Icon icon={view?.icon || 'mdi:view-dashboard-outline'} {size} class={cls} />
  {/if}
{/snippet}

{#if b}
  <span class="vwrap">
    {@render mark()}
    <span class="vb" class:glyph={!!b.icon} style={b.color ? `--vb:${b.color}` : ''}>{#if b.icon}<Icon icon={b.icon} size="100%" />{/if}</span>
  </span>
{:else}
  {@render mark()}
{/if}

<style>
  /* Height matches the SVG glyphs beside it, width follows the image's own aspect
     so a wide wordmark stays readable instead of being squeezed into a square. */
  .vimg { flex: none; display: inline-block; width: auto; object-fit: contain; border-radius: 4px; }
  .vwrap { position: relative; flex: none; display: inline-flex; line-height: 1; }
  /* A dot, ringed in the card's background so it reads on top of the icon. */
  .vb { position: absolute; top: -.12em; right: -.18em; width: .42em; height: .42em; border-radius: 50%; background: var(--vb, var(--accent)); box-shadow: 0 0 0 .1em var(--card-bg, #11151c); pointer-events: none; }
  /* An icon badge: a small round chip with the glyph in it. */
  .vb.glyph { top: -.3em; right: -.38em; width: .78em; height: .78em; padding: .08em; display: grid; place-items: center; color: #0b0f16; }
</style>
