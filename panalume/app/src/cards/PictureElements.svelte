<script module>
  // A picture with elements placed on it as a percentage of the picture, the way
  // Home Assistant's Picture elements card works: a floorplan with light tiles,
  // a photo with a door sensor on it, a site plan with gates.
  export const meta = {
    type: 'picture-elements', name: 'Picture elements', icon: 'mdi:image-filter-center-focus', category: 'Controls',
    size: { w: 480, h: 320 }, tap: 'none',
    defaults: { url: '', fit: 'contain' },
    fields: [
      { key: 'url', label: 'Picture (URL, /local/… — template ok)', type: 'text' },
      { key: 'fit', label: 'Fit', type: 'select', options: [
        { value: 'contain', label: 'Whole picture (letterboxed)' },
        { value: 'cover', label: 'Fill the card (crops the edges)' },
        { value: 'fill', label: 'Stretch to the card' },
      ] },
      { key: 'markers', label: 'Elements', type: 'markers', hint: 'X and Y are a percentage of the picture itself: 0,0 is its top-left corner, 100,100 its bottom-right. A marker stays on the same spot of the picture whatever size the card is drawn at.' },
    ],
  };
</script>

<script>
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { name as eName, stateText, entityIcon, isActive, lightColor, canToggle, toggle, domain, unavailable } from '../lib/entity.js';
  import { haImage } from '../lib/ha.svelte.js';
  import { app } from '../lib/config.svelte.js';
  let { props, w = 480, h = 320, editing = false } = $props();

  const src = $derived(String(haImage(String(t(props.url) ?? '').trim()) || ''));
  // Natural size of the picture, so markers land on the picture and not on the
  // letterbox bars when the card's shape differs from the picture's.
  let nat = $state({ w: 0, h: 0 });
  let broken = $state(false);
  let cw0 = $state(0), ch0 = $state(0);
  let seen = '';
  $effect(() => {
    if (src === seen) return;
    seen = src;
    nat = { w: 0, h: 0 };
    broken = false;
  });
  const box = $derived.by(() => {
    // Measure the element the picture is drawn into rather than trusting the
    // card's w/h props: the frame's padding sits outside this box, and a marker
    // placed against the props drifts off the picture by that padding.
    const cw = Math.max(1, Number(cw0) || Number(w) || 1), ch = Math.max(1, Number(ch0) || Number(h) || 1);
    if (!nat.w || !nat.h) return { x: 0, y: 0, w: cw, h: ch };
    if ((props.fit || 'contain') === 'fill') return { x: 0, y: 0, w: cw, h: ch };
    const s = (props.fit || 'contain') === 'cover' ? Math.max(cw / nat.w, ch / nat.h) : Math.min(cw / nat.w, ch / nat.h);
    const dw = nat.w * s, dh = nat.h * s;
    return { x: (cw - dw) / 2, y: (ch - dh) / 2, w: dw, h: dh };
  });

  const markers = $derived(Array.isArray(props.markers) ? props.markers : []);
  const pct = (v, fallback) => {
    const n = Number(String(v ?? '').trim());
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback;
  };
  // Big markers shrink in short cards rather than swallowing the picture.
  const size = (m) => Math.round(Math.max(14, Math.min(Number(m.size) || 24, Math.max(20, (Number(ch0) || Number(h) || 320) * 0.22))));
  const iconOf = (m, e) => String(t(m.icon) ?? '').trim() || entityIcon(e) || 'mdi:help-circle-outline';
  const colourOf = (m, e) => {
    const own = String(t(m.color) ?? '').trim();
    if (own) return own;
    if (isActive(e)) return lightColor(e) || 'var(--on)';
    return 'var(--muted)';
  };
  const labelOf = (m, e) => {
    const own = String(t(m.label) ?? '').trim();
    return own || '';
  };
  const said = (m, e) => [eName(e), stateText(e)].filter(Boolean).join(' · ') || String(m.entity || 'No entity');

  function fire(m) {
    if (editing) return;
    const id = String(t(m.entity) ?? '').trim();
    if (!id) return;
    const e = ent(id);
    const act = m.action || 'more-info';
    if (act === 'toggle' && e && (canToggle(id) || ['scene', 'script', 'button', 'input_button'].includes(domain(id)))) {
      return void toggle(e);
    }
    app.popup = { entity: id };
  }
</script>

<div class="pe" class:editing bind:clientWidth={cw0} bind:clientHeight={ch0}>
  {#if src}<img {src} alt="" draggable="false" style="object-fit:{props.fit || 'contain'}"
      onload={(ev) => (nat = { w: ev.currentTarget.naturalWidth, h: ev.currentTarget.naturalHeight })}
      onerror={() => { broken = true; nat = { w: 0, h: 0 }; }} />{/if}
  {#if !src}
    <div class="empty">Pick a picture</div>
  {:else if broken}
    <div class="empty">The picture didn’t load</div>
  {:else}
    <div class="marks">
      {#each markers as m, i (i)}
        {@const id = String(t(m.entity) ?? '').trim()}
        {@const e = id ? ent(id) : null}
        {@const live = !!e && !unavailable(e)}
        {@const ic = iconOf(m, e)}
        {@const lb = labelOf(m, e)}
        {@const sz = size(m)}
        <button type="button" class="mk" class:on={live && isActive(e)} class:dead={!!id && !live}
          class:blank={!id} class:edit={editing} disabled={editing && !id}
          style="left:{box.x + (pct(m.x, 50) / 100) * box.w}px; top:{box.y + (pct(m.y, 50) / 100) * box.h}px; --mc:{colourOf(m, e)}; --sz:{sz}px"
          title={said(m, e)} aria-label={said(m, e)} onclick={() => fire(m)}>
          <span class="ic"><Icon icon={ic} size="calc(var(--sz) * 0.62)" /></span>
          {#if lb}<span class="lb">{lb}</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .pe { position: relative; height: 100%; width: 100%; container-type: size; border-radius: inherit; overflow: hidden; }
  img { position: absolute; inset: 0; width: 100%; height: 100%; user-select: none; }
  .marks { position: absolute; inset: 0; pointer-events: none; }
  .empty { position: absolute; inset: 0; display: grid; place-items: center; padding: 8px; text-align: center; color: var(--muted); font-size: .85em; }

  .mk {
    position: absolute; transform: translate(-50%, -50%); pointer-events: auto;
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    background: none; border: 0; padding: 0; margin: 0; color: var(--mc);
    cursor: pointer; -webkit-tap-highlight-color: transparent;
  }
  .ic {
    display: grid; place-items: center; flex: none;
    width: max(calc(var(--sz) * 1.5), 28px); height: max(calc(var(--sz) * 1.5), 28px);
    border-radius: 50%;
    background: rgba(9, 13, 19, .58);
    border: 1px solid rgba(255, 255, 255, .16);
    box-shadow: 0 2px 8px rgba(0, 0, 0, .38);
    transition: background .2s, color .2s, border-color .2s, box-shadow .2s;
  }
  .on .ic {
    background: color-mix(in srgb, var(--mc) 26%, rgba(9, 13, 19, .58));
    border-color: color-mix(in srgb, var(--mc) 60%, transparent);
    box-shadow: 0 2px 12px color-mix(in srgb, var(--mc) 45%, transparent);
  }
  .dead { opacity: .45; }
  .lb {
    font-size: max(calc(var(--sz) * .46), 9px); line-height: 1.2; color: var(--text);
    background: rgba(9, 13, 19, .62); border-radius: 99px; padding: 1px 6px;
    max-width: 10em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .blank { display: none; }
  .blank.edit { display: flex; opacity: .75; }
  .blank.edit .ic { border-style: dashed; }
  /* A short card keeps the tiles and drops the words. */
  @container (max-height: 140px) { .lb { display: none; } }
</style>
