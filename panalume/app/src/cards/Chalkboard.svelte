<script module>
  export const meta = {
    type: 'chalkboard', name: 'Chalkboard', icon: 'mdi:chalkboard', category: 'Info',
    size: { w: 400, h: 300 }, tap: 'none', hold: 'none',
    defaults: { colour: '#f4f6fb', chalk: 3, board: 'slate', export: true, undo: true },
    sections: [{ key: 'board', label: 'Board' }, { key: 'tools', label: 'Buttons' }, { key: 'hint', label: 'Hint' }],
    fields: [
      { key: 'name', label: 'Title (blank = nothing)', type: 'text' },
      { key: 'board', label: 'Board', type: 'select', options: [{ value: 'slate', label: 'Slate' }, { value: 'green', label: 'Classroom green' }, { value: 'black', label: 'Black' }, { value: 'pink', label: 'Dusty pink' }] },
      { key: 'colour', label: 'Chalk colour', type: 'color' },
      { key: 'chalk', label: 'Chalk thickness', type: 'number' },
      { key: 'export', label: 'Export PNG button', type: 'bool', section: 'tools' },
      { key: 'undo', label: 'Undo button', type: 'bool', section: 'tools' },
      { key: 'hint', label: 'Hint (blank = “Draw with a finger”)', type: 'text', section: 'hint' },
    ],
  };
</script>

<script>
  // A chalkboard you can draw on with a finger. Strokes live in this browser's
  // localStorage, per card, so the note survives a reload without a server, an
  // integration or a single request — and it can be saved out as a PNG.
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/tpl.js';
  let { props, card } = $props();
  const show = (k) => !props.hide?.[k];

  const BOARDS = {
    slate: { bg: '#1b2430', edge: 'rgba(255,255,255,.06)' },
    green: { bg: '#1d3a2c', edge: 'rgba(255,255,255,.06)' },
    black: { bg: '#0d0f13', edge: 'rgba(255,255,255,.05)' },
    pink: { bg: '#3a2430', edge: 'rgba(255,255,255,.06)' },
  };
  const board = $derived(BOARDS[props.board] || BOARDS.slate);
  const ink = $derived(String(t(props.colour) || '#f4f6fb'));
  const size = $derived(Math.max(1, Math.min(24, Number(props.chalk) || 3)));
  const key = $derived(`panalume.chalkboard.${card?.id || 'default'}`);
  const MAX_POINTS = 12000;

  let canvas;
  let strokes = $state([]); // [{p: [[x, y], …]}] in 0..1 of the board
  let drawing = null; // the stroke under the finger: plain state, so a move doesn't re-run effects
  let live = $state(false);
  let saveTimer;
  let clearArmed = $state(false);
  let armTimer;

  // ---- storage ----------------------------------------------------------------
  function load() {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data?.s) ? data.s.filter((s) => Array.isArray(s?.p) && s.p.length) : [];
    } catch {
      return [];
    }
  }
  // Writing is explicitly called after every change: an effect that both read and
  // wrote the same state would re-enter and Svelte would abort the whole card.
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        if (strokes.length) localStorage.setItem(key, JSON.stringify({ v: 1, s: strokes }));
        else localStorage.removeItem(key);
      } catch {
        /* a full or blocked localStorage leaves the drawing on screen, unsaved */
      }
    }, 500);
  }
  onMount(() => {
    strokes = load();
    paint();
    const ro = new ResizeObserver(() => paint());
    if (canvas?.parentElement) ro.observe(canvas.parentElement);
    return () => {
      ro.disconnect();
      clearTimeout(saveTimer);
    };
  });

  // ---- drawing ----------------------------------------------------------------
  // The canvas is sized from its own box, so the card survives a layout change.
  function fit() {
    const c = canvas;
    if (!c) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const r = c.getBoundingClientRect();
    const W = Math.max(1, Math.round(r.width * dpr));
    const H = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    paint();
  }
  function strokePath(ctx, pts, colour, width, scale) {
    if (!pts.length) return;
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (pts.length === 1) {
      // A tap is a dot, not nothing.
      ctx.arc(pts[0][0] * scale.x, pts[0][1] * scale.y, width / 2, 0, Math.PI * 2);
      ctx.fillStyle = colour;
      ctx.fill();
      return;
    }
    ctx.moveTo(pts[0][0] * scale.x, pts[0][1] * scale.y);
    for (let i = 1; i < pts.length - 1; i++) {
      // Join points through their midpoints: smooth chalk rather than a polyline.
      const mx = ((pts[i][0] + pts[i + 1][0]) / 2) * scale.x;
      const my = ((pts[i][1] + pts[i + 1][1]) / 2) * scale.y;
      ctx.quadraticCurveTo(pts[i][0] * scale.x, pts[i][1] * scale.y, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0] * scale.x, last[1] * scale.y);
    // A wider, fainter pass under the line: chalk dust either side of the stroke,
    // which is what stops it looking like a vector pen.
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = width * 1.7;
    ctx.stroke();
    ctx.restore();
    ctx.stroke();
  }
  function paint() {
    const c = canvas;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const scale = { x: c.width, y: c.height };
    const dpr = c.width / Math.max(1, c.getBoundingClientRect().width);
    for (const s of strokes) strokePath(ctx, s.p, s.c || ink, (s.w || size) * dpr, scale);
    if (drawing) strokePath(ctx, drawing.p, ink, size * dpr, scale);
  }
  // A change of chalk colour, thickness or board repaints without touching state.
  $effect(() => {
    if (canvas && ink && size && board) fit();
  });

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  function down(e) {
    if (e.button != null && e.button !== 0) return;
    if (drawing) return;
    // Capturing keeps a finger that slides off the canvas drawing; it throws if the
    // pointer is already gone (a synthetic event, or a very fast tap), which must not
    // stop the stroke from starting.
    try {
      canvas.setPointerCapture?.(e.pointerId);
    } catch {}
    drawing = { p: [pos(e)], pointer: e.pointerId };
    live = true;
    paint();
  }
  function move(e) {
    if (!drawing || e.pointerId !== drawing.pointer) return;
    const [x, y] = pos(e);
    const last = drawing.p[drawing.p.length - 1];
    // Skip points the screen can't show; a slow finger otherwise fills the budget.
    if (Math.abs(x - last[0]) * canvas.width < 2 && Math.abs(y - last[1]) * canvas.height < 2) return;
    drawing.p.push([x, y]);
    paint();
  }
  function up(e) {
    if (!drawing || (e && e.pointerId != null && e.pointerId !== drawing.pointer)) return;
    const total = strokes.reduce((n, s) => n + s.p.length, 0) + drawing.p.length;
    if (total <= MAX_POINTS) strokes = [...strokes, { p: drawing.p, c: ink, w: size }];
    drawing = null;
    live = false;
    paint();
    save();
  }
  function undo() {
    if (!strokes.length) return;
    strokes = strokes.slice(0, -1);
    paint();
    save();
  }
  function clear() {
    if (!clearArmed) {
      clearArmed = true;
      clearTimeout(armTimer);
      armTimer = setTimeout(() => (clearArmed = false), 3000);
      return;
    }
    clearTimeout(armTimer);
    clearArmed = false;
    strokes = [];
    drawing = null;
    live = false;
    paint();
    save();
  }
  function savePng() {
    // The card is drawn at screen size; the file is twice that, on the board colour.
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d');
    ctx.fillStyle = board.bg;
    ctx.fillRect(0, 0, out.width, out.height);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    for (const s of strokes) strokePath(ctx, s.p, s.c || ink, (s.w || size) * dpr, { x: out.width, y: out.height });
    out.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      a.href = URL.createObjectURL(blob);
      a.download = `chalkboard-${stamp}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
  }
  const empty = $derived(!strokes.length && !live);
</script>

<div class="chalk" style="--board:{board.bg}">
  {#if t(props.name)}
    <div class="title"><Icon icon="mdi:chalkboard" size="1em" />{t(props.name)}</div>
  {/if}
  <div class="board" style="background:var(--board)">
    <canvas bind:this={canvas} data-stop
      onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onpointerleave={up}></canvas>
    {#if empty && show('hint')}
      <div class="hint"><Icon icon="mdi:gesture-swipe" size="1.3em" />{t(props.hint) || 'Draw with a finger'}</div>
    {/if}
    <div class="tools" data-stop>
      {#if props.undo !== false}<button onclick={undo} disabled={!strokes.length} title="Undo" aria-label="Undo"><Icon icon="mdi:undo" size="1.1em" /></button>{/if}
      {#if props.export !== false}<button onclick={savePng} disabled={!strokes.length} title="Save as PNG" aria-label="Save as PNG"><Icon icon="mdi:download" size="1.1em" /></button>{/if}
      <button class="clr" class:armed={clearArmed} onclick={clear} title={clearArmed ? 'Tap again to clear' : 'Clear'} aria-label="Clear">
        <Icon icon={clearArmed ? 'mdi:check' : 'mdi:eraser'} size="1.1em" />{#if clearArmed}<span>Clear?</span>{/if}
      </button>
    </div>
  </div>
</div>

<style>
  .chalk { height: 100%; display: flex; flex-direction: column; gap: 6px; container-type: size; }
  .title { display: flex; align-items: center; gap: 6px; font-size: .8em; font-weight: 600; color: var(--muted); flex: none; }
  .title :global(svg) { color: var(--accent); }
  .board { position: relative; flex: 1; min-height: 0; border-radius: 12px; overflow: hidden; box-shadow: inset 0 0 0 1px rgba(255,255,255,.07), inset 0 6px 24px rgba(0,0,0,.35); }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; display: block; cursor: crosshair; }
  .hint { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: rgba(255,255,255,.28); font-size: .8em; pointer-events: none; }
  .tools { position: absolute; right: 8px; bottom: 8px; display: flex; gap: 4px; opacity: .35; transition: opacity .2s; }
  .board:hover .tools, .tools:focus-within { opacity: 1; }
  .tools button { display: inline-flex; align-items: center; gap: 4px; border: 0; padding: 5px 7px; border-radius: 9px; background: rgba(10,14,20,.6); color: rgba(255,255,255,.85); backdrop-filter: blur(4px); }
  .tools button:disabled { opacity: .4; }
  .tools button:active { background: rgba(255,255,255,.18); }
  .clr.armed { background: rgba(255,122,144,.85); color: #1a0d12; font-weight: 600; font-size: .8em; }
</style>
