<script module>
  export const meta = {
    type: 'cover', name: 'Cover / blind', icon: 'mdi:blinds', category: 'Controls',
    size: { w: 280, h: 140 }, tap: 'none', hold: 'more-info',
    defaults: { entity: '' },
    sections: [{ key: 'icon', label: 'Icon' }, { key: 'state', label: 'State' }, { key: 'buttons', label: 'Open / stop / close' }, { key: 'slider', label: 'Position slider' }, { key: 'tilt', label: 'Slat tilt' }],
    fields: [
      { key: 'entity', label: 'Cover', type: 'entity', domain: 'cover' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'icon', label: 'Icon', type: 'icon' },
    ],
  };
</script>

<script>
  // A blind or cover: open / stop / close and a position slider. The buttons
  // sit beside the name when there's room, and drop underneath when the slider
  // is hidden or the card is too narrow for both. Blinds whose slats tilt
  // (Venetian blinds) get a tilt row too.
  import Icon from '../components/Icon.svelte';
  import Slider from '../components/Slider.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { name, entityIcon, stateText } from '../lib/entity.js';
  import { callService } from '../lib/ha.svelte.js';
  let { props, w = 280, h = 140 } = $props();
  const show = (k) => !props.hide?.[k];
  const e = $derived(ent(props.entity));
  const svc = (s, d = {}) => callService('cover', s, d, { entity_id: e.entity_id });
  const hasPos = $derived(e?.attributes.current_position != null);
  // HA's cover features: open tilt 16, close tilt 32, stop tilt 64, set tilt position 128.
  const feats = $derived(Number(e?.attributes.supported_features) || 0);
  const tiltPos = $derived(e?.attributes.current_tilt_position);
  const tiltBtns = $derived(!!(feats & 48));
  const tilt = $derived(show('tilt') && (tiltBtns || tiltPos != null));
  // With a tilt row a short card keeps its buttons beside the name and leaves the
  // position slider out until there's room for it.
  const slider = $derived(show('slider') && hasPos && h >= (tilt ? 150 : 110));
  // Underneath: when there's no slider (and room for a second row), or the
  // name would be squeezed by the buttons.
  const below = $derived(show('buttons') && h >= (tilt ? 190 : 100) && (!slider || w < 330));
  // The tilt slider needs the set-position feature and room beside the buttons.
  const tiltSlider = $derived(tilt && tiltPos != null && (!!(feats & 128) || !tiltBtns) && (!tiltBtns || w >= 300));
</script>

<div class="cv">
  <div class="top">
    {#if show('icon')}<Icon icon={t(props.icon) || entityIcon(e)} size="1.4em" />{/if}
    <div class="txt"><div class="name">{t(props.name) || name(e)}</div>{#if show('state')}<div class="state">{stateText(e)}</div>{/if}</div>
    {#if show('buttons') && !below}{@render btns()}{/if}
  </div>
  {#if below}{@render btns()}{/if}
  {#if slider}<Slider value={e.attributes.current_position} unit="%" onchange={(v) => svc('set_cover_position', { position: v })} />{/if}
  {#if tilt}
    <div class="tilt" data-stop>
      <span class="tl">Tilt</span>
      {#if tiltBtns}
        <div class="btns">
          <button onclick={() => svc('open_cover_tilt')} aria-label="Tilt open"><Icon icon="mdi:arrow-top-right" size="1.2em" /></button>
          {#if feats & 64}<button onclick={() => svc('stop_cover_tilt')} aria-label="Stop tilting"><Icon icon="mdi:stop" size="1.2em" /></button>{/if}
          <button onclick={() => svc('close_cover_tilt')} aria-label="Tilt closed"><Icon icon="mdi:arrow-bottom-left" size="1.2em" /></button>
        </div>
      {/if}
      {#if tiltSlider}<div class="ts"><Slider value={tiltPos} unit="%" height={36} onchange={(v) => svc('set_cover_tilt_position', { tilt_position: v })} /></div>{/if}
    </div>
  {/if}
</div>

{#snippet btns()}
  <div class="btns" class:below data-stop>
    <button onclick={() => svc('open_cover')} aria-label="Open"><Icon icon="mdi:arrow-up" size="1.3em" /></button>
    <button onclick={() => svc('stop_cover')} aria-label="Stop"><Icon icon="mdi:stop" size="1.3em" /></button>
    <button onclick={() => svc('close_cover')} aria-label="Close"><Icon icon="mdi:arrow-down" size="1.3em" /></button>
  </div>
{/snippet}

<style>
  .cv { height: 100%; display: flex; flex-direction: column; justify-content: space-between; gap: 10px; }
  .top { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .txt { flex: 1; min-width: 0; }
  .name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .state { color: var(--muted); font-size: .88em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .btns { display: flex; gap: 4px; flex: none; }
  .btns button { width: 40px; height: 40px; border-radius: 12px; border: 0; background: rgba(255,255,255,.08); color: inherit; display: grid; place-items: center; }
  .btns.below { gap: 8px; }
  .btns.below button { flex: 1; width: auto; height: 44px; }
  .btns button:active { background: var(--accent); }
  .tilt { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .tl { color: var(--muted); font-size: .8em; flex: none; }
  .tilt .btns button { width: 36px; height: 36px; }
  .ts { flex: 1; min-width: 0; }
</style>
