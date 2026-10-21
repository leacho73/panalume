<script>
  import Icon from './Icon.svelte';
  import MoreInfo from './MoreInfo.svelte';
  import CardFrame from './CardFrame.svelte';
  import { app } from '../lib/config.svelte.js';
  import { cards } from '../lib/registry.js';
  import Camera from '../cards/Camera.svelte';
  let vw = $state(0), vh = $state(0);
  const close = () => (app.popup = null);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

{#if app.popup?.camera}
  <div class="full" role="dialog" aria-modal="true" bind:clientWidth={vw} bind:clientHeight={vh}>
    <Camera props={{ entity: app.popup.camera, name: app.popup.name, mode: 'live', fit: 'contain', show_name: true, sound: true }} w={vw} h={vh} />
    <button class="x" onclick={close} aria-label="Close"><Icon icon="mdi:close" size="1.5em" /></button>
  </div>
{:else if app.popup}
  <div class="back" role="presentation" onclick={(e) => e.target === e.currentTarget && close()}>
    <div class="pop" role="dialog" aria-modal="true">
      <button class="x" onclick={close} aria-label="Close"><Icon icon="mdi:close" size="1.3em" /></button>
      {#if app.popup.entity}
        <MoreInfo entity={app.popup.entity} />
      {:else}
        {#if app.popup.title}<h2>{app.popup.title}</h2>{/if}
        <div class="cards">
          {#each app.popup.cards as id}
            {@const card = app.config.cards[id]}
            {#if card}
              {@const h = card.popupHeight || cards[card.type]?.meta.size?.h || 140}
              <div style="height:{h}px"><CardFrame {card} w={480} {h} inPopup /></div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .back { position: fixed; inset: 0; z-index: 900; background: rgba(0,0,0,.45); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); display: grid; place-items: center; padding: 20px; animation: fade .18s ease; }
  .pop { position: relative; width: min(560px, 100%); max-height: calc(100dvh - 40px); overflow: auto; background: rgba(22,26,38,.92); border: 1px solid rgba(255,255,255,.08); border-radius: 26px; padding: 24px; box-shadow: 0 30px 80px rgba(0,0,0,.5); animation: rise .22s cubic-bezier(.2,.9,.3,1.2); }
  .x { position: absolute; top: 14px; right: 14px; background: rgba(255,255,255,.08); border: 0; color: inherit; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; z-index: 2; }
  .full { position: fixed; inset: 0; z-index: 900; background: #000; color: #fff; animation: fade .18s ease; }
  .full .x { top: max(16px, env(safe-area-inset-top)); right: max(16px, env(safe-area-inset-right)); width: 48px; height: 48px; background: rgba(0,0,0,.5); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
  h2 { margin: 0 0 14px; font-weight: 600; }
  .cards { display: flex; flex-direction: column; gap: 12px; }
  @keyframes fade { from { opacity: 0; } }
  @keyframes rise { from { transform: translateY(20px) scale(.97); opacity: 0; } }
</style>
