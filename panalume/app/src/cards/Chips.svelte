<script module>
  // A row of small chips: one per light, sensor, scene or cover, each with its own
  // icon, what it says, colour and tap. The chips line up and centre themselves, wrap
  // onto another row when the card is tall enough, and count whatever will not fit.
  export const meta = {
    type: 'chips', name: 'Chips', icon: 'mdi:tag-multiple-outline', category: 'Controls',
    size: { w: 480, h: 80 }, tap: 'none',
    defaults: { chips: [], align: 'center', overflow: 'count' },
    fields: [
      { key: 'chips', label: 'Chips', type: 'chips', hint: 'One chip per thing. A chip can say the name, the state or both; its colour and its Visible when are templates, with `entity_id` set to the chip’s own entity. Chips are laid out in the space the card has — a slim bar keeps one row, a taller card wraps onto more — and anything that does not fit is counted in the last chip.' },
      { key: 'overflow', label: 'When they do not all fit', type: 'select', options: [
        { value: 'count', label: 'Count the rest in a +N chip' },
        { value: 'slide', label: 'Slide the row sideways' },
      ], hint: 'Counting keeps every chip at its full size and says how many are not on the card. Sliding keeps them all reachable with a finger: the row scrolls inside the card, the edge fades while there is more to see, and the chips snap to the left as they come in.' },
      { key: 'align', label: 'Line up', type: 'select', options: [
        { value: 'center', label: 'Centred' },
        { value: 'flex-start', label: 'From the left' },
        { value: 'flex-end', label: 'To the right' },
        { value: 'space-between', label: 'Spread across the card' },
      ] },
    ],
  };
</script>

<script>
  import { tick } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import { t, ent, truthy } from '../lib/tpl.js';
  import { states } from '../lib/ha.svelte.js';
  import { name as eName, stateText, entityIcon, isActive, unavailable, lightColor, canToggle, toggle, domain } from '../lib/entity.js';
  import { app } from '../lib/config.svelte.js';

  let { props, editing = false } = $props();

  const list = $derived(
    (Array.isArray(props.chips) ? props.chips : [])
      .filter((c) => c && (!c.visible || truthy(t(c.visible, { entity_id: c.entity })))),
  );

  const idOf = (c) => String(t(c.entity) ?? '').trim();
  const entOf = (c) => (idOf(c) ? ent(idOf(c)) : null);
  // A chip is lit only when it is something that can be switched and it is on: a
  // temperature sensor has a reading, but it is not "on", and a bar of glowing
  // readings reads as a bar of switches that are all stuck on.
  const active = (c, e) => !!e && isActive(e) && canToggle(idOf(c));
  const iconOf = (c, e) => String(t(c.icon) ?? '').trim() || entityIcon(e) || 'mdi:help-circle-outline';
  // A chip's own colour wins; otherwise it takes the light's colour when it is on,
  // and stays quiet when it is not.
  const colourOf = (c, e) => {
    const own = String(t(c.color) ?? '').trim();
    if (own) return own;
    return active(c, e) ? lightColor(e) || 'var(--on)' : 'var(--muted)';
  };
  const labelOf = (c, e) => String(t(c.label) ?? '').trim() || eName(e) || idOf(c) || 'Chip';
  const said = (c, e) => (unavailable(e) ? '—' : stateText(e));
  const shape = (c) => c.show || 'name';
  const switchable = (id) => canToggle(id) || ['scene', 'script', 'button', 'input_button'].includes(domain(id));

  function fire(c) {
    if (editing) return;
    const id = idOf(c);
    if (!id) return;
    const e = ent(id);
    const act = c.action || (switchable(id) ? 'toggle' : 'more-info');
    if (act === 'none') return;
    if (act === 'toggle' && e && switchable(id)) return void toggle(e);
    app.popup = { entity: id };
  }

  // Fit: the chips are measured after they paint rather than counted from a guessed
  // chip width, because a chip's width is its icon plus whatever its label says this
  // second. Everything is shown, the first chip that lands outside the card is found,
  // and the ones after it are dropped in favour of a count. The count chip takes a
  // slot too, so the pass repeats until it fits — at most a few rounds, as each one
  // drops a chip.
  let boxW = $state(0), boxH = $state(0);
  let shown = $state(0);
  // While deciding what fits, the row is measured from its top: a vertically centred
  // stack that is too tall overflows both ends, so the top row gets clipped before any
  // bottom row is counted.
  let measuring = $state(false);
  let els = [];
  let rowEl = null;
  let tail = null;
  let fitToken = 0;
  // Sliding: the row is a sideways scroller, so nothing is measured away and the count
  // is not drawn. Edges fade while there is more of the row past them.
  const slide = $derived((props.overflow || 'count') === 'slide');
  let edges = $state({ l: false, r: false });
  function measureEdges() {
    if (!slide || !rowEl) { if (edges.l || edges.r) edges = { l: false, r: false }; return; }
    const max = rowEl.scrollWidth - rowEl.clientWidth;
    const next = { l: rowEl.scrollLeft > 2, r: max > 2 && rowEl.scrollLeft < max - 2 };
    if (next.l !== edges.l || next.r !== edges.r) edges = next;
  }
  // Mouse drags and a plain wheel move the row too: a wall panel is a finger, a desk is not.
  let drag = null, suppress = false;
  function down(e) {
    if (!slide || editing || e.pointerType === 'touch') return;
    drag = { x: e.clientX, left: rowEl?.scrollLeft || 0, moved: false };
  }
  function move(e) {
    if (!drag || !rowEl) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) {
      drag.moved = true;
      rowEl.scrollLeft = drag.left - dx;
    }
  }
  function up() {
    if (!drag) return;
    suppress = drag.moved;
    drag = null;
    setTimeout(() => (suppress = false), 60);
  }
  function wheel(e) {
    if (!slide || !rowEl || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    if (rowEl.scrollWidth <= rowEl.clientWidth) return;
    rowEl.scrollLeft += e.deltaY;
    e.preventDefault();
  }

  // Compare the chip with the row it sits in, both in the same frame: the card is often
  // zoomed by the board, and `offsetTop` is measured against the card's padded content
  // box rather than the row, so the two numbers are not the same space.
  const offBox = (el) => {
    if (!el || !rowEl) return false;
    const box = rowEl.getBoundingClientRect(), r = el.getBoundingClientRect();
    return r.height > 0 && r.bottom > box.bottom + 1;
  };

  async function fit() {
    const mine = ++fitToken;          // a later run wins; an older one stops where it is
    const n = list.length;
    if (!n || !boxH || slide) { shown = n; measuring = false; requestAnimationFrame(measureEdges); return; }
    measuring = true;
    shown = n;                        // measure with everything on the card
    await tick();
    if (mine !== fitToken) return;
    let over = -1;
    for (let i = 0; i < n; i++) if (offBox(els[i])) { over = i; break; }
    if (over === -1) { shown = n; measuring = false; return; }
    let keep = over;                  // every chip that fitted; the "+N" then has to fit too
    for (let pass = 0; pass < 4; pass++) {
      shown = keep;
      await tick();
      if (mine !== fitToken) return;
      if (keep === 0 || !offBox(tail)) break;
      keep -= 1;
    }
    shown = keep;
    measuring = false;
    requestAnimationFrame(measureEdges);
  }

  // Re-fit when the chips change, the card is resized, or a state arrives and changes
  // how wide a chip is.
  $effect(() => {
    void list.map((c) => `${c.entity}|${c.label}|${c.show}|${c.icon}`).join('~');
    void boxW; void boxH; void states.size; void slide;
    const raf = requestAnimationFrame(() => fit());
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="wrap" bind:clientWidth={boxW} bind:clientHeight={boxH}>
  {#if !list.length}
    <div class="empty">Pick a few chips</div>
  {:else}
    <div class="row" class:measuring class:scroll={slide} class:fade-l={edges.l} class:fade-r={edges.r}
      bind:this={rowEl} style:justify-content={slide ? 'flex-start' : props.align || 'center'}
      onscroll={measureEdges} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}
      onwheel={wheel} onclickcapture={(e) => { if (suppress) { e.stopPropagation(); e.preventDefault(); } }}>
      {#each list as c, i (i)}
        {@const e = entOf(c)}
        {@const on = active(c, e)}
        {@const sh = shape(c)}
        <button
          type="button" class="ch" class:on data-stop
          style:--c={colourOf(c, e)}
          style:display={!slide && i >= shown ? 'none' : null}
          bind:this={els[i]}
          title={[labelOf(c, e), said(c, e)].filter(Boolean).join(' · ')}
          onclick={() => fire(c)}>
          <span class="ic"><Icon icon={iconOf(c, e)} size="1.1em" /></span>
          {#if sh === 'state'}
            <span class="lb">{said(c, e)}</span>
          {:else if sh === 'both'}
            <span class="lb">{labelOf(c, e)}<span class="st"> · {said(c, e)}</span></span>
          {:else if sh !== 'icon'}
            <span class="lb">{labelOf(c, e)}</span>
          {/if}
        </button>
      {/each}
      {#if !slide && shown < list.length}
        <span class="ch tail" bind:this={tail} title="{list.length - shown} more chip{list.length - shown === 1 ? '' : 's'} than the card has room for">+{list.length - shown}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .wrap { height: 100%; min-height: 0; display: flex; flex-direction: column; justify-content: center; container-type: size; }
  .empty { margin: auto; color: var(--muted); font-size: .85em; }
  .row.measuring { align-content: flex-start; }
  .row.scroll {
    flex-wrap: nowrap; align-content: center; overflow-x: auto; overflow-y: hidden;
    scroll-snap-type: x proximity; scrollbar-width: none; -ms-overflow-style: none;
    touch-action: pan-x; overscroll-behavior-x: contain; cursor: grab;
  }
  .row.scroll::-webkit-scrollbar { display: none; }
  .row.scroll:active { cursor: grabbing; }
  .row.scroll .ch { scroll-snap-align: start; }
  .row.fade-r { mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 2.6em), transparent 100%);
    -webkit-mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 2.6em), transparent 100%); }
  .row.fade-l { mask-image: linear-gradient(90deg, transparent 0, #000 2.6em);
    -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 2.6em); }
  .row.fade-l.fade-r {
    mask-image: linear-gradient(90deg, transparent 0, #000 2.6em, #000 calc(100% - 2.6em), transparent 100%);
    -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 2.6em, #000 calc(100% - 2.6em), transparent 100%);
  }
  .row { display: flex; flex-wrap: wrap; align-content: center; align-items: center; gap: min(.45em, 6cqh); height: 100%; min-height: 0; overflow: hidden; }
  .ch {
    display: flex; align-items: center; gap: .4em; flex: 0 0 auto; max-width: 100%; min-width: 0;
    height: max(1.35em, min(2.1em, 64cqh)); padding: 0 min(.75em, 3cqw);
    border-radius: 999px; border: 1px solid rgba(255, 255, 255, .1);
    background: rgba(255, 255, 255, .07); color: var(--text);
    font: inherit; font-size: clamp(9px, 27cqh, .9em); line-height: 1; cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .ch:active { transform: scale(.97); }
  .ch.on {
    color: var(--c, var(--on));
    background: color-mix(in srgb, var(--c, var(--on)) 22%, transparent);
    border-color: color-mix(in srgb, var(--c, var(--on)) 42%, transparent);
  }
  .ic { display: grid; flex: none; color: var(--c, var(--muted)); }
  .ch.on .ic { color: var(--c, var(--on)); }
  .lb { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .st { color: var(--muted); font-weight: 400; }
  .tail { cursor: default; color: var(--muted); background: rgba(255, 255, 255, .04); border-style: dashed; }
  @container (max-width: 300px) { .st { display: none; } }
</style>
