<script module>
  // A row of small chips: one per light, sensor, scene or cover, each with its own
  // icon, what it says, colour and tap. The chips line up and centre themselves, wrap
  // onto another row when the card is tall enough, and count whatever will not fit.
  export const meta = {
    type: 'chips', name: 'Chips', icon: 'mdi:tag-multiple-outline', category: 'Controls',
    size: { w: 480, h: 80 }, tap: 'none',
    defaults: { chips: [], align: 'center', overflow: 'count' },
    fields: [
      { key: 'chips', label: 'Chips', type: 'chips', hint: 'One chip per thing, as a button or as a slider you drag. A chip can say the name, the state or both; its colour and its Visible when are templates, with `entity_id` set to the chip’s own entity. Chips are laid out in the space the card has — a slim bar keeps one row, a taller card wraps onto more — and anything that does not fit is counted in the last chip.' },
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
  import { states, callService } from '../lib/ha.svelte.js';
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

  // ---- slider chips -------------------------------------------------------
  // A chip can be a button or a slider. A slider writes the number the integration
  // already uses: a light's brightness as a percentage, a cover's position, a
  // thermostat's set point, a speaker's volume, a number helper's value. The range
  // comes from the entity where it publishes one, so a thermostat is dragged between
  // its own min and max rather than a made-up 0 to 100.
  const isSlider = (c) => String(c.control || '').toLowerCase() === 'slider';
  const num = (v, d) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };

  function rangeOf(c, e) {
    const d = domain(idOf(c));
    const a = e?.attributes || {};
    if (d === 'climate') return { min: num(a.min_temp, 7), max: num(a.max_temp, 35), step: num(a.target_temp_step, 0.5), unit: '°' };
    if (d === 'humidifier') return { min: num(a.min_humidity, 0), max: num(a.max_humidity, 100), step: 1, unit: '%' };
    if (d === 'number' || d === 'input_number') return { min: num(a.min, 0), max: num(a.max, 100), step: num(a.step, 1), unit: '' };
    return { min: 0, max: 100, step: 1, unit: d === 'media_player' || d === 'light' || d === 'fan' || d === 'cover' ? '%' : '' };
  }

  function valueOf(c, e) {
    if (!e) return 0;
    const d = domain(idOf(c));
    const a = e.attributes || {};
    if (d === 'light') return e.state === 'off' ? 0 : Math.round((num(a.brightness, 255) / 255) * 100);
    if (d === 'cover') return num(a.current_position, e.state === 'open' ? 100 : 0);
    if (d === 'climate') return num(a.temperature, num(a.current_temperature, 20));
    if (d === 'media_player') return Math.round(num(a.volume_level, 0) * 100);
    if (d === 'fan') return num(a.percentage, e.state === 'on' ? 100 : 0);
    if (d === 'humidifier') return num(a.humidity, 0);
    return num(e.state, 0);
  }

  function setTo(c, v) {
    const id = idOf(c);
    if (!id) return;
    const d = domain(id);
    const t = { entity_id: id };
    if (d === 'light') return v > 0
      ? callService('light', 'turn_on', { brightness_pct: Math.round(v) }, t)
      : callService('light', 'turn_off', {}, t);
    if (d === 'cover') return callService('cover', 'set_cover_position', { position: Math.round(v) }, t);
    if (d === 'fan') return callService('fan', 'set_percentage', { percentage: Math.round(v) }, t);
    if (d === 'climate') return callService('climate', 'set_temperature', { temperature: Math.round(v * 10) / 10 }, t);
    if (d === 'media_player') return callService('media_player', 'volume_set', { volume_level: Math.round(v) / 100 }, t);
    if (d === 'humidifier') return callService('humidifier', 'set_humidity', { humidity: Math.round(v) }, t);
    if (d === 'number') return callService('number', 'set_value', { value: v }, t);
    if (d === 'input_number') return callService('input_number', 'set_value', { value: v }, t);
    return undefined;
  }

  // Where the finger is, as a value: the chip is its own track, so the percentage is
  // measured against the chip's box rather than the card's.
  function chipValueAt(ev, el, c, e) {
    const r = el.getBoundingClientRect();
    const rg = rangeOf(c, e);
    const f = Math.min(1, Math.max(0, (ev.clientX - r.left) / (r.width || 1)));
    const raw = rg.min + f * (rg.max - rg.min);
    return Math.round((raw - rg.min) / rg.step) * rg.step + rg.min;
  }

  let dragChip = $state(null);
  function chipDown(ev, el, c, e, i) {
    if (editing || !e || ev.button > 0) return;
    ev.stopPropagation();     // the row does not scroll under a slider
    ev.preventDefault();
    el.setPointerCapture?.(ev.pointerId);
    dragChip = { i, el, c, e, v: chipValueAt(ev, el, c, e) };
  }
  function chipMove(ev) {
    if (!dragChip) return;
    const v = chipValueAt(ev, dragChip.el, dragChip.c, dragChip.e);
    if (v !== dragChip.v) dragChip = { ...dragChip, v };
  }
  function chipUp(ev) {
    if (!dragChip) return;
    const done = dragChip;
    dragChip = null;
    done.el.releasePointerCapture?.(ev?.pointerId);
    setTo(done.c, done.v);
  }
  function chipKey(ev, c, e, rg) {
    const step = ev.shiftKey ? Math.max(rg.step, Math.round((rg.max - rg.min) / 10 / rg.step) * rg.step) : rg.step;
    const now = valueOf(c, e);
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') { setTo(c, Math.min(rg.max, now + step)); ev.preventDefault(); }
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') { setTo(c, Math.max(rg.min, now - step)); ev.preventDefault(); }
  }
  const fmt = (v) => (Number.isInteger(Number(v)) ? String(Number(v)) : String(Math.round(Number(v) * 10) / 10));

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
        {#if isSlider(c)}
          {@const rg = rangeOf(c, e)}
          {@const val = dragChip?.i === i ? dragChip.v : valueOf(c, e)}
          {@const pctVal = Math.min(100, Math.max(0, ((val - rg.min) / (rg.max - rg.min || 1)) * 100))}
          <div
            class="ch slw" class:on={active(c, e)} data-stop role="slider" tabindex="0"
            aria-label={labelOf(c, e)} aria-valuemin={rg.min} aria-valuemax={rg.max} aria-valuenow={val}
            aria-valuetext={`${fmt(val)}${rg.unit}`}
            style:--c={colourOf(c, e)} style:--fill={`${pctVal}%`}
            style:display={!slide && i >= shown ? 'none' : null}
            bind:this={els[i]}
            title={`${labelOf(c, e)} · ${fmt(val)}${rg.unit}`}
            onpointerdown={(ev) => chipDown(ev, ev.currentTarget, c, e, i)}
            onpointermove={chipMove} onpointerup={chipUp} onpointercancel={chipUp}
            onkeydown={(ev) => chipKey(ev, c, e, rg)}>
            <span class="fill" aria-hidden="true"></span>
            <span class="ic"><Icon icon={iconOf(c, e)} size="1.1em" /></span>
            {#if sh !== 'icon'}
              <span class="lb">{#if sh !== 'state'}{labelOf(c, e)}<span class="st"> · </span>{/if}<span class="v">{fmt(val)}{rg.unit}</span></span>
            {/if}
          </div>
        {:else}
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
        {/if}
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
  .slw { position: relative; overflow: hidden; cursor: ew-resize; touch-action: none; }
  .slw.on { background: rgba(255, 255, 255, .07); border-color: rgba(255, 255, 255, .12); color: var(--text); }
  .slw .v { color: var(--c, var(--on)); font-variant-numeric: tabular-nums; }
  .slw:active { transform: none; }
  .slw .fill {
    position: absolute; inset: 0 auto 0 0; width: var(--fill, 0%);
    background: color-mix(in srgb, var(--c, var(--on)) 32%, transparent);
    border-right: 2px solid color-mix(in srgb, var(--c, var(--on)) 70%, transparent);
    pointer-events: none; transition: width .12s ease;
  }
  .slw > .ic, .slw > .lb { position: relative; }
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
