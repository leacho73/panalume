<script>
  // The banner Home Assistant sends (lib/notify.svelte.js): over everything, at the top,
  // tap to close; "+2" when more are waiting.
  import Icon from './Icon.svelte';
  import { banner, dismissBanner } from '../lib/notify.svelte.js';
  const b = $derived(banner.current);
  const ICON = { info: 'mdi:information-outline', warning: 'mdi:alert-outline', critical: 'mdi:alert-octagon-outline' };
</script>

{#if b}
  {#key b.id}
    <button class="banner {b.severity}" style={b.color ? `--tone:${b.color}` : ''} onclick={dismissBanner} aria-live="assertive" title="Tap to close">
      <span class="ic"><Icon icon={b.icon || ICON[b.severity]} size="1.4em" /></span>
      <span class="txt">{#if b.title}<b>{b.title}</b>{/if}<span>{b.message}</span></span>
      {#if banner.queue.length}<span class="more">+{banner.queue.length}</span>{/if}
    </button>
  {/key}
{/if}

<style>
  .banner { --tone: var(--accent); position: fixed; z-index: 2000; top: calc(12px + var(--sa-top, 0px)); left: 50%; transform: translateX(-50%);
    width: min(560px, calc(100vw - 24px)); display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 0; border-radius: 16px;
    background: #161b25; color: var(--text, #fff); font: inherit; text-align: left; cursor: pointer;
    box-shadow: 0 12px 40px rgba(0,0,0,.5), inset 0 0 0 1px color-mix(in srgb, var(--tone) 45%, transparent);
    animation: drop .25s ease-out; }
  .warning { --tone: #ffb020; }
  .critical { --tone: #ff5b5b; }
  .ic { flex: none; width: 2.4em; height: 2.4em; border-radius: 50%; display: grid; place-items: center; color: var(--tone); background: color-mix(in srgb, var(--tone) 18%, transparent); }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .txt b { font-size: 1.05em; }
  .txt span { color: var(--muted, #aab); }
  .txt b + span { font-size: .92em; }
  .txt span:only-child { color: inherit; font-weight: 500; }
  .more { flex: none; padding: 2px 8px; border-radius: 99px; background: rgba(255,255,255,.1); font-size: .8em; color: var(--muted, #aab); }
  @keyframes drop { from { opacity: 0; transform: translate(-50%, -12px); } }
</style>
