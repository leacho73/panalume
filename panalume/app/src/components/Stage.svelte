<script>
  import { untrack } from 'svelte';
  import { param } from '../lib/params.js';
  // The dashboard canvas. Laid out at the layout's design width and scaled
  // (CSS zoom) to fit the screen. In edit mode cards can be dragged anywhere
  // (including between the sidebar and main area) and resized from any edge or
  // corner. Grouped cards (rooms) move together; double-tap one to move it alone.
  // Shift/Ctrl-click or drag a box on empty space to select several.
  // Positions snap to a 10px grid (hold Shift while dragging for 1px).
  import CardFrame from './CardFrame.svelte';
  import { app, layout, GRID, changed, zoneList, ensureEditable, selectionSet, fitOverflow, usualGap, cardHidden } from '../lib/config.svelte.js';

  let { available, autoDevice, offset = 0 } = $props(); // offset: space taken on the left (the editor panel when docked left)
  let vh = $state(innerHeight);
  let scrollY = $state(0);
  let sbEl = $state();
  // The sidebar's scroll position, kept while a card is being dragged (the
  // sidebar stops scrolling then so cards can be dragged out of it, and the
  // content is shifted by this much instead, so nothing jumps).
  let sbScroll = $state(0);

  const L = $derived(layout());
  const sb = $derived(L.sidebar.enabled ? L.sidebar.width : 0);
  const fit = $derived(available / L.width);
  // Sizing per device (Layout tab, or ?fit=width|screen|actual in the URL):
  // fill the width, fit the whole view on screen (wall tablets), or actual size.
  const display = $derived(param('fit') || app.config.layouts[app.device]?.display || 'width');
  const bottom = (list) => (list || []).reduce((m, p) => Math.max(m, p.y + p.h), 0) + 20;
  const mainContentH = $derived(bottom(L.zones[app.view]));
  const sideContentH = $derived(sb ? bottom(L.zones.sidebar) : 0);
  const preview = $derived(L.width < 700 && app.device !== autoDevice); // phone preview on a big screen
  // Fit-to-screen with a sidebar: by default the sidebar keeps one size on every
  // view and only the main area shrinks to fit (Layout tab can make them shrink together).
  const split = $derived(!!sb && display === 'screen' && !app.editing && !preview && L.sidebar.scaling !== 'shared');
  const sideZ = $derived(split ? Math.min(fit, vh / sideContentH) : 1);
  const mainZ = $derived(split ? Math.min((available - sb * sideZ) / (L.width - sb), vh / mainContentH) : 1);
  const scale = $derived.by(() => {
    if (split) return 1;
    if (preview) return Math.min(fit, 1);
    if (display === 'actual') return Math.min(fit, 1);
    if (display === 'screen' && !app.editing) return Math.min(fit, vh / Math.max(mainContentH, sideContentH));
    return fit;
  });
  // When a wall tablet shrinks a tall view to fit, stretch the canvas to the full
  // screen width (sidebar stays at the edge, main area gets the spare space)
  // instead of centring it with gaps either side.
  const fill = $derived(!split && display === 'screen' && !app.editing && scale < fit);
  const stageW = $derived(split ? available : fill ? available / scale : L.width);
  const left = $derived(offset + (split || fill ? 0 : Math.max(0, (available - L.width * scale) / 2)));
  const mainW = $derived(split ? (available - sb * sideZ) / mainZ : stageW - sb);
  // ...and widen the main area's cards to use that space, rather than leaving a
  // gap on the right (text keeps its size; cards just get wider).
  // Cards placed past the main area's edge (e.g. a layout made before the sidebar
  // got wider) are squeezed to fit rather than hanging off the screen.
  // The right margin matches the left one.
  const mainRight = $derived((L.zones[app.view] || []).reduce((m, p) => Math.max(m, p.x + p.w), 0));
  const mainLeft = $derived((L.zones[app.view] || []).reduce((m, p) => Math.min(m, p.x), Infinity));
  const squeeze = $derived(app.editing || mainRight <= L.width - sb ? 1 : (L.width - sb) / (mainRight + mainLeft));
  const kx = $derived((split || fill ? mainW / (L.width - sb) : 1) * squeeze);
  // The same for the sidebar (e.g. after it was made narrower).
  const sideRight = $derived((L.zones.sidebar || []).reduce((m, p) => Math.max(m, p.x + p.w), 0));
  const sideLeft = $derived((L.zones.sidebar || []).reduce((m, p) => Math.min(m, p.x), Infinity));
  const ks = $derived(app.editing || !sb || sideRight <= sb ? 1 : sb / (sideRight + sideLeft));
  const origin = (zone) => ({
    x: zone === 'sidebar' ? (L.sidebar.side === 'right' ? stageW - sb : 0) : L.sidebar.side === 'right' ? 0 : sb,
    y: zone === 'sidebar' ? scrollY / scale - sbScroll : 0,
  });
  /** Pointer position in a zone's own coordinates. */
  const local = (e, zone) => ({ x: (e.clientX - left) / scale - origin(zone).x, y: (e.clientY + scrollY) / scale - origin(zone).y });
  const mainList = $derived(L.zones[app.view] || []);
  const sideList = $derived(L.zones.sidebar || []);
  // On phones with their own layout, a card hidden by its "Visible when" template
  // gives its space to the cards below it instead of leaving a gap (the automatic
  // phone layout leaves hidden cards out altogether). Only rows where nothing else is
  // showing close up, so a hidden card beside a visible one keeps the row as it is.
  const lift = $derived.by(() => {
    if (app.editing || app.device !== 'phone') return null;
    const hid = mainList.map((p) => cardHidden(app.config.cards[p.card]));
    if (!hid.some(Boolean)) return null;
    const G = usualGap(mainList) || 12;
    const span = (p) => [p.y, p.y + p.h + G];
    const shown = mainList.filter((_, i) => !hid[i]).map(span).sort((a, b) => a[0] - b[0]);
    const bands = [];
    for (const [a0, b] of mainList.filter((_, i) => hid[i]).map(span)) {
      let a = a0;
      for (const [c, d] of shown) {
        if (d <= a || c >= b) continue;
        if (c > a) bands.push([a, c]);
        a = Math.max(a, d);
        if (a >= b) break;
      }
      if (a < b) bands.push([a, b]);
    }
    bands.sort((x, y) => x[0] - y[0]);
    const merged = [];
    for (const [a, b] of bands) { const m = merged.at(-1); if (m && a <= m[1]) m[1] = Math.max(m[1], b); else merged.push([a, b]); }
    return { hid, bands: merged, total: merged.reduce((n, [a, b]) => n + b - a, 0) };
  });
  const liftY = (y) => (lift ? lift.bands.reduce((n, [a, b]) => n + (b <= y ? b - a : a < y ? y - a : 0), 0) : 0);
  const mainH = $derived(Math.max(vh / scale / mainZ, mainList.reduce((m, p) => Math.max(m, p.y + p.h), 0) - (lift?.total || 0) + (app.editing ? 400 : 20)));
  const sideH = $derived(Math.max(vh / scale / sideZ, sideList.reduce((m, p) => Math.max(m, p.y + p.h), 0) + 20));

  // Starting to edit puts any cards hanging off the edge back inside for good.
  $effect(() => { if (app.editing) untrack(() => fitOverflow(layout())); });

  // Put the sidebar back where it was once a drag ends.
  $effect(() => { if (!op && sbEl && Math.abs(sbEl.scrollTop - sbScroll) > 1) sbEl.scrollTop = sbScroll; });

  const sel = $derived(app.editing ? new Set(selectionSet()) : new Set());
  const inSel = (zone, i) => app.selected?.zone === zone && sel.has(i);
  const isPrimary = (zone, i) => app.selected?.zone === zone && app.selected.index === i;
  const selBox = $derived.by(() => {
    if (sel.size < 2 || !app.selected) return null;
    const list = L.zones[app.selected.zone] || [];
    const ps = [...sel].map((i) => list[i]).filter(Boolean);
    const x = Math.min(...ps.map((p) => p.x)), y = Math.min(...ps.map((p) => p.y));
    return { zone: app.selected.zone, x, y, w: Math.max(...ps.map((p) => p.x + p.w)) - x, h: Math.max(...ps.map((p) => p.y + p.h)) - y };
  });

  let op = $state(null); // active drag / resize / box-select
  const snap = (v, free) => (free ? Math.round(v) : Math.round(v / GRID) * GRID);
  // Smart alignment: edges and sizes of the other cards in the zone that a
  // dragged edge snaps to (within SNAP px), shown as guide lines.
  const SNAP = 8;
  function targets(zone, skip) {
    const t = { xs: [], ys: [], ws: [], hs: [] };
    (L.zones[zone] || []).forEach((p, i) => {
      if (skip.includes(i)) return;
      t.xs.push(p.x, p.x + p.w); t.ys.push(p.y, p.y + p.h); t.ws.push([p.w, i]); t.hs.push([p.h, i]);
    });
    return t;
  }
  function near(vals, ts) {
    let best = null;
    for (const v of vals) for (const t of ts) {
      const d = t - v;
      if (Math.abs(d) <= SNAP && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t };
    }
    return best;
  }
  function sameSize(v, ts) {
    const m = near([v], ts.map((x) => x[0]));
    return m && { v: m.t, cards: ts.filter((x) => x[0] === m.t).map((x) => x[1]) };
  }

  // Magnet: the view's usual gap between cards (the commonest one), and which
  // cards are joined — sitting at that gap or touching. Resizing a card carries
  // joined cards with it; a card dragged further away stays on its own, and one
  // brought back within 5 px of the gap snaps to it and joins up again.
  const LINK = 4, GAP_SNAP = 5;
  const overlaps = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 4;
  const joined = (gap, G) => Math.abs(gap - G) <= LINK || (gap >= 0 && gap <= LINK);
  /** Cards joined to card i on side d ('s' below, 'n' above, 'e' right, 'w' left); below cascades. */
  function links(list, i, d, G) {
    const out = new Set();
    const q = [i];
    while (q.length) {
      const a = list[q.shift()];
      list.forEach((b, j) => {
        if (j === i || out.has(j)) return;
        const ok =
          d === 's' ? overlaps(a.x, a.x + a.w, b.x, b.x + b.w) && joined(b.y - (a.y + a.h), G)
          : d === 'n' ? overlaps(a.x, a.x + a.w, b.x, b.x + b.w) && joined(a.y - (b.y + b.h), G)
          : d === 'e' ? overlaps(a.y, a.y + a.h, b.y, b.y + b.h) && joined(b.x - (a.x + a.w), G)
          : overlaps(a.y, a.y + a.h, b.y, b.y + b.h) && joined(a.x - (b.x + b.w), G);
        if (ok) { out.add(j); if (d === 's') q.push(j); }
      });
    }
    return [...out];
  }
  /** Snap targets for edges, plus "one usual gap away" from each other card. */
  function gapTargets(list, skip, G) {
    const g = { l: [], r: [], t: [], b: [] }; // where a left / right / top / bottom edge would sit one gap from a card
    list.forEach((p, i) => {
      if (skip.includes(i)) return;
      g.l.push(p.x + p.w + G); g.r.push(p.x - G); g.t.push(p.y + p.h + G); g.b.push(p.y - G);
    });
    return g;
  }
  /** Fit the moved cards into the column they were dropped on: below any card
   *  whose middle they're past, and push cards underneath (with whatever is
   *  joined below them) down to make room, at the usual gap. */
  function slotIn(list, moving, G) {
    const mv = new Set(moving);
    const box = () => { const x0 = Math.min(...moving.map((p) => p.x)), x1 = Math.max(...moving.map((p) => p.x + p.w)); const y0 = Math.min(...moving.map((p) => p.y)), y1 = Math.max(...moving.map((p) => p.y + p.h)); return { x0, x1, y0, y1 }; };
    const others = () => list.filter((p) => !mv.has(p));
    let b = box();
    const hit = (p) => overlaps(b.x0, b.x1, p.x, p.x + p.w) && p.y < b.y1 && p.y + p.h > b.y0;
    // Go below cards the drop is mostly past.
    for (let n = 0; n < 8; n++) {
      const above = others().filter((p) => hit(p) && b.y0 >= p.y + p.h / 2);
      if (!above.length) break;
      const dy = Math.max(...above.map((p) => p.y + p.h)) + G - b.y0;
      for (const p of moving) p.y += dy;
      b = box();
    }
    // Push down what's in the way, keeping their own columns together.
    const blocked = others().filter((p) => overlaps(b.x0, b.x1, p.x, p.x + p.w) && p.y < b.y1 + G && p.y + p.h > b.y0);
    if (!blocked.length) return;
    // Dropped between two joined cards: sit at the usual gap under the upper one.
    const top = Math.min(...blocked.map((p) => p.y));
    const up = others().filter((p) => overlaps(b.x0, b.x1, p.x, p.x + p.w) && p.y + p.h <= b.y0 + 1).sort((p, q) => q.y + q.h - (p.y + p.h))[0];
    if (up && joined(top - (up.y + up.h), G)) { const dy = up.y + up.h + G - b.y0; for (const p of moving) p.y += dy; b = box(); }
    const snapshot = list.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }));
    const shift = new Map();
    for (const p of blocked) {
      const dy = b.y1 + G - p.y;
      const i = list.indexOf(p);
      for (const j of [i, ...links(snapshot, i, 's', G)]) if (!mv.has(list[j])) shift.set(j, Math.max(shift.get(j) || 0, dy));
    }
    for (const [j, dy] of shift) list[j].y += dy;
  }

  /** Cards moving up (following a card that got shorter, or closing a gap)
   *  stop at the usual gap below anything else in their way, and the cards
   *  joined below them stop with them. `ys` maps index → wanted y. */
  function liftBlocked(list, orig, ys, fixed, G) {
    const moving = new Set([...ys.keys(), ...fixed]);
    for (const j of [...ys.keys()].sort((a, b) => orig[a].y - orig[b].y)) {
      const o = orig[j];
      let y = ys.get(j);
      list.forEach((q, k) => {
        if (k === j || !overlaps(o.x, o.x + o.w, orig[k].x, orig[k].x + orig[k].w)) return;
        const gap = o.y - (orig[k].y + orig[k].h);
        if (gap < -4) return; // not above it
        if (moving.has(k)) { if (ys.has(k) && joined(gap, G)) y = Math.max(y, list[k].y + list[k].h + gap); }
        else y = Math.max(y, q.y + q.h + Math.min(G, Math.max(0, gap)));
      });
      list[j].y = Math.max(0, y);
    }
  }

  function nearGap(v, ts) {
    let best = null;
    for (const t of ts) { const d = t - v; if (Math.abs(d) <= GAP_SNAP && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t }; }
    return best;
  }

  function begin(e, zone, index, mode, dir) {
    if (!app.editing || e.button > 0) return;
    e.stopPropagation();
    e.preventDefault();
    ensureEditable();
    if (mode === 'move' && (e.ctrlKey || e.metaKey)) return toggleSel(zone, index);
    if (mode === 'move' && e.shiftKey) {
      // Shift: a click toggles the selection (in end), a drag moves freely (in move).
      op = { mode: 'pending', zone, index, dir, sx: e.clientX, sy: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    startOp(e, zone, index, mode, dir);
  }

  /** Add / remove a card from the selection. */
  function toggleSel(zone, index) {
    if (app.selected?.zone !== zone) { app.selected = { zone, index }; app.multi = [index]; return; }
    const cur = new Set(app.multi.length ? app.multi : selectionSet());
    cur.has(index) ? cur.delete(index) : cur.add(index);
    app.multi = [...cur];
    if (!cur.has(app.selected.index) && cur.size) app.selected = { zone, index: [...cur][0] };
  }

  function startOp(e, zone, index, mode, dir) {
    const list = L.zones[zone];
    const keep = app.selected?.zone === zone && sel.has(index);
    if (!keep) { app.multi = []; app.single = false; }
    if (!keep || mode === 'resize') app.selected = { zone, index };
    app.panel = 'card';
    const idx = mode === 'move' ? selectionSet() : [index];
    const G = usualGap(list);
    const all = list.map((p) => ({ ...p }));
    const link = mode === 'resize' ? Object.fromEntries([...(dir || '')].map((d) => [d, links(all, index, d, G)])) : {};
    const skip = [...idx, ...Object.values(link).flat()];
    // Moving: the cards joined below the moving ones close up behind it on drop.
    const below = mode === 'move' ? [...new Set(idx.flatMap((i) => links(all, i, 's', G)))].filter((j) => !idx.includes(j)) : [];
    const span = mode === 'move' ? Math.max(...idx.map((i) => all[i].y + all[i].h)) - Math.min(...idx.map((i) => all[i].y)) : 0;
    const close = below.length ? { refs: below.map((j) => list[j]), dy: span + G } : null;
    op = { zone, index, mode, dir, sx: e.clientX, sy: e.clientY, idx, o: idx.map((i) => ({ ...list[i] })), all, G, link, close, moved: false, t: targets(zone, skip), gt: gapTargets(list, skip, G), guides: [], same: [] };
    e.currentTarget?.setPointerCapture(e.pointerId);
  }

  function move(e) {
    if (!op) return;
    if (op.mode === 'box') {
      const p = local(e, op.zone);
      op.x2 = p.x; op.y2 = p.y;
      return;
    }
    let dx = (e.clientX - op.sx) / scale;
    let dy = (e.clientY - op.sy) / scale;
    if (!op.moved && Math.hypot(dx, dy) < 3) return;
    if (op.mode === 'pending') {
      // Shift-drag on a card: move it (and its selection) freely.
      const { sx, sy, zone, index, dir } = op;
      op = null;
      startOp({ clientX: sx, clientY: sy, currentTarget: null }, zone, index, 'move', dir);
    }
    const list = L.zones[op.zone];
    op.moved = true;
    const free = e.shiftKey;
    const guides = [], same = [];
    if (op.mode === 'move') {
      // Snap the selection's edges to other cards' edges, else the first card to the grid.
      const o0 = op.o[0];
      const bx = Math.min(...op.o.map((o) => o.x)), by = Math.min(...op.o.map((o) => o.y));
      const bw = Math.max(...op.o.map((o) => o.x + o.w)) - bx, bh = Math.max(...op.o.map((o) => o.y + o.h)) - by;
      const gx = (a, b) => { const l = nearGap(bx + dx, op.gt.l), r = nearGap(bx + bw + dx, op.gt.r); const m = [l, r].filter(Boolean).sort((p, q) => Math.abs(p.d) - Math.abs(q.d))[0]; return m && { d: m.d, t: m === l ? bx + dx + m.d : bx + bw + dx + m.d }; };
      const gy = () => { const t = nearGap(by + dy, op.gt.t), b = nearGap(by + bh + dy, op.gt.b); const m = [t, b].filter(Boolean).sort((p, q) => Math.abs(p.d) - Math.abs(q.d))[0]; return m && { d: m.d, t: m === t ? by + dy + m.d : by + bh + dy + m.d }; };
      const mx = !free && (near([bx + dx, bx + bw + dx], op.t.xs) || gx());
      const my = !free && (near([by + dy, by + bh + dy], op.t.ys) || gy());
      const sx = mx ? Math.round(dx + mx.d) : snap(o0.x + dx, free) - o0.x;
      const sy = Math.max(-by, my ? Math.round(dy + my.d) : snap(o0.y + dy, free) - o0.y);
      if (mx) guides.push({ x: mx.t });
      if (my) guides.push({ y: my.t });
      op.idx.forEach((i, k) => { list[i].x = op.o[k].x + sx; list[i].y = op.o[k].y + sy; });
    } else {
      const p = list[op.index];
      const o = op.o[0];
      const d = op.dir;
      const MIN = 30;
      // An edge snaps to another card's edge; failing that the size snaps to a
      // card of the same width / height; failing that, the grid.
      const edge = (v, ts, g) => { const m = !free && near([v], ts); if (m) guides.push({ [g]: m.t }); return m ? m.t : null; };
      const size = (v, ts) => { const m = !free && sameSize(v, ts); if (m) same.push(...m.cards); return m ? m.v : null; };
      // ...or sits one usual gap from a card it isn't joined to (magnet).
      const gap = (v, ts, g) => { const m = !free && nearGap(v, ts); if (m) guides.push({ [g]: m.t }); return m ? m.t : null; };
      // Don't squeeze a joined neighbour below the minimum size.
      const room = (k, key) => Math.min(Infinity, ...(free ? [] : (op.link[k] || []).map((j) => op.all[j][key] - MIN)));
      dx = d.includes('e') ? Math.min(dx, room('e', 'w')) : d.includes('w') ? Math.max(dx, -room('w', 'w')) : dx;
      dy = d.includes('n') ? Math.max(dy, -room('n', 'h')) : dy;
      if (d.includes('e')) { const r = edge(o.x + o.w + dx, op.t.xs, 'x') ?? gap(o.x + o.w + dx, op.gt.r, 'x'); p.w = Math.max(MIN, r != null ? r - o.x : size(o.w + dx, op.t.ws) ?? snap(o.w + dx, free)); }
      if (d.includes('s')) { const b = edge(o.y + o.h + dy, op.t.ys, 'y') ?? gap(o.y + o.h + dy, op.gt.b, 'y'); p.h = Math.max(MIN, b != null ? b - o.y : size(o.h + dy, op.t.hs) ?? snap(o.h + dy, free)); }
      if (d.includes('w')) { const l = edge(o.x + dx, op.t.xs, 'x') ?? gap(o.x + dx, op.gt.l, 'x'); const nx = Math.min(o.x + o.w - MIN, l ?? snap(o.x + dx, free)); p.w = o.w + (o.x - nx); p.x = nx; }
      if (d.includes('n')) { const t = edge(o.y + dy, op.t.ys, 'y') ?? gap(o.y + dy, op.gt.t, 'y'); const ny = Math.max(0, Math.min(o.y + o.h - MIN, t ?? snap(o.y + dy, free))); p.h = o.h + (o.y - ny); p.y = ny; }
      // Joined cards follow (not with Shift): those below move with the bottom
      // edge; the neighbour on the other sides gives or takes the space.
      const A = op.all;
      for (const [k, js] of Object.entries(op.link)) for (const j of js) Object.assign(list[j], { x: A[j].x, y: A[j].y, w: A[j].w, h: A[j].h });
      if (!free) {
        const db = p.y + p.h - (o.y + o.h), dr = p.x + p.w - (o.x + o.w), dl = p.x - o.x, dt = p.y - o.y;
        if (db >= 0) for (const j of op.link.s || []) list[j].y = A[j].y + db;
        else if (op.link.s?.length) liftBlocked(list, A, new Map(op.link.s.map((j) => [j, A[j].y + db])), [op.index], op.G);
        // A card below that isn't joined gets pushed too once the edge reaches it
        // (keeping the usual gap), with whatever is joined below it.
        for (const j of op.bumped || []) if (!(op.link.s || []).includes(j)) list[j].y = A[j].y;
        op.bumped = [];
        if (d.includes('s') && db > 0) {
          // Everything that moved down (this card, cards joined below it, cards
          // pushed already) can push the next card it reaches, and so on.
          const moved = new Set([op.index, ...(op.link.s || [])]);
          for (let pass = 0, more = true; more && pass < 12; pass++) {
            more = false;
            for (const m of [...moved]) {
              const c = list[m], bottom = c.y + c.h;
              if (bottom <= A[m].y + A[m].h) continue;
              A.forEach((q, j) => {
                if (j === m || j === op.index || !overlaps(c.x, c.x + c.w, q.x, q.x + q.w)) return;
                if (q.y < A[m].y + A[m].h - 4 || list[j].y >= bottom + op.G) return; // above it, or not reached yet
                // (A card pushed already can be pushed further by another, so a row stays level.)
                const dy = bottom + op.G - list[j].y;
                for (const k of [j, ...links(A, j, 's', op.G)]) if (k !== op.index) { list[k].y += dy; if (!moved.has(k)) { moved.add(k); op.bumped.push(k); } }
                more = true;
              });
            }
          }
        }
        // A neighbour that grows into the freed space stops at the usual gap from
        // any other card in its way.
        const others = (j) => list.filter((q, k) => k !== j && k !== op.index);
        for (const j of op.link.e || []) {
          const lim = Math.max(-Infinity, ...others(j).filter((q) => overlaps(A[j].y, A[j].y + A[j].h, q.y, q.y + q.h) && q.x + q.w <= A[j].x + 4).map((q) => q.x + q.w + op.G));
          const x = Math.min(A[j].x + A[j].w - MIN, Math.max(A[j].x + dr, Math.min(A[j].x, lim)));
          list[j].w = A[j].x + A[j].w - x; list[j].x = x;
        }
        for (const j of op.link.w || []) {
          const lim = Math.min(Infinity, ...others(j).filter((q) => overlaps(A[j].y, A[j].y + A[j].h, q.y, q.y + q.h) && q.x >= A[j].x + A[j].w - 4).map((q) => q.x - op.G));
          list[j].w = Math.max(MIN, Math.min(A[j].w + dl, Math.max(A[j].w, lim - A[j].x)));
        }
        for (const j of op.link.n || []) {
          const lim = Math.min(Infinity, ...others(j).filter((q) => overlaps(A[j].x, A[j].x + A[j].w, q.x, q.x + q.w) && q.y >= A[j].y + A[j].h - 4).map((q) => q.y - op.G));
          list[j].h = Math.max(MIN, Math.min(A[j].h + dt, Math.max(A[j].h, lim - A[j].y)));
        }
      }
    }
    op.guides = guides;
    op.same = same;
  }

  function end(e) {
    if (!op) return;
    const cur = op;
    op = null;
    if (cur.mode === 'pending') return toggleSel(cur.zone, cur.index);
    if (cur.mode === 'box') return finishBox(cur);
    if (!cur.moved) return;
    const { zone, mode } = cur;
    const list = L.zones[zone];
    let target = zone;
    if (mode === 'move' && sb) {
      const sx = (e.clientX - left) / scale;
      const sbX = origin('sidebar').x;
      target = sx >= sbX && sx < sbX + sb ? 'sidebar' : app.view;
    }
    if (target !== zone) {
      // Move the whole selection into the other zone, keeping its screen position.
      const from = origin(zone), to = origin(target);
      const moving = cur.idx.map((i) => list[i]);
      for (const i of [...cur.idx].sort((a, b) => b - a)) list.splice(i, 1);
      const dst = zoneList(target);
      const start = dst.length;
      for (const p of moving) {
        p.x = snap(from.x + p.x - to.x);
        p.y = Math.max(0, snap(from.y + p.y - to.y));
        dst.push(p);
      }
      app.selected = { zone: target, index: start };
      app.multi = moving.length > 1 && !moving[0].group ? moving.map((_, k) => start + k) : [];
    }
    // Keep everything inside its zone horizontally.
    const z = app.selected.zone;
    const zl = L.zones[z];
    const zw = z === 'sidebar' ? sb : mainW;
    const idx = selectionSet();
    const minX = Math.min(...idx.map((i) => zl[i].x));
    const maxX = Math.max(...idx.map((i) => zl[i].x + zl[i].w));
    const shift = minX < 0 ? -minX : maxX > zw ? Math.max(-minX, zw - maxX) : 0;
    for (const i of idx) { zl[i].w = Math.min(zl[i].w, zw); zl[i].x += shift; }
    if (mode === 'move' && !e.shiftKey) {
      // Magnet: the cards that were joined below close up the space left behind…
      if (cur.close) {
        const src = L.zones[zone];
        const orig = src.map((q) => ({ x: q.x, y: q.y, w: q.w, h: q.h }));
        const ys = new Map(cur.close.refs.map((r) => [src.indexOf(r), r.y - cur.close.dy]).filter(([i]) => i >= 0));
        liftBlocked(src, orig, ys, z === zone ? idx : [], cur.G);
      }
      // …and dropping onto a column slots the moved cards in, pushing the rest down.
      slotIn(zl, idx.map((i) => zl[i]), z === zone ? cur.G : usualGap(zl));
    }
    changed();
  }

  function bgDown(e, zone) {
    if (!app.editing || e.target !== e.currentTarget || e.button > 0) return;
    const p = local(e, zone);
    op = { mode: 'box', zone, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function finishBox(b) {
    const x1 = Math.min(b.x1, b.x2), x2 = Math.max(b.x1, b.x2), y1 = Math.min(b.y1, b.y2), y2 = Math.max(b.y1, b.y2);
    if (x2 - x1 < 6 && y2 - y1 < 6) { app.selected = null; app.multi = []; return; }
    const list = L.zones[b.zone] || [];
    const hit = list.map((p, i) => (p.x < x2 && p.x + p.w > x1 && p.y < y2 && p.y + p.h > y1 ? i : -1)).filter((i) => i >= 0);
    if (!hit.length) { app.selected = null; app.multi = []; return; }
    ensureEditable();
    app.selected = { zone: b.zone, index: hit[0] };
    app.multi = hit;
    app.single = false;
    app.panel = 'card';
  }

  function dbl(zone, i) {
    // Double-tap a grouped card to work on it alone.
    app.selected = { zone, index: i };
    app.multi = [];
    app.single = true;
  }

  const HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

  /** Scale everything inside a card (text, buttons, toggles…) without changing its box. */
  function setScale(card, v) {
    card.style.scale = Math.min(250, Math.max(40, v));
    if (card.style.scale === 100) delete card.style.scale;
    changed();
  }
</script>

<svelte:window bind:innerHeight={vh} bind:scrollY />

{#snippet zone(name, list)}
  {#each list as p, i (p.card + ':' + i)}
    {@const card = app.config.cards[p.card]}
    {@const k = name === 'sidebar' ? ks : kx}
    {@const pw = Math.round(p.w * k)}
    {@const main = name !== 'sidebar' && lift}
    {#if card && !(main && lift.hid[i])}
      <div class="place" class:sel={inSel(name, i)} class:primary={isPrimary(name, i) && sel.size === 1} class:grouped={app.editing && p.group}
        style="left:{Math.round(p.x * k)}px;top:{main ? p.y - liftY(p.y) : p.y}px;width:{pw}px;height:{p.h}px;z-index:{(p.z || 0) + (op && inSel(name, i) ? 1000 : isPrimary(name, i) ? 500 : 0)}">
        <CardFrame {card} w={pw} h={p.h} editing={app.editing} />
        {#if app.editing}
          <div class="grab" role="button" tabindex="-1" ondblclick={() => dbl(name, i)}
            onpointerdown={(e) => begin(e, name, i, 'move')} onpointermove={move} onpointerup={end} onpointercancel={end}></div>
          {#if isPrimary(name, i) && sel.size === 1}
            {#each HANDLES as d}
              <div class="h h-{d}" role="button" tabindex="-1" onpointerdown={(e) => begin(e, name, i, 'resize', d)} onpointermove={move} onpointerup={end} onpointercancel={end}></div>
            {/each}
            {#if !op}
              {@const sc = Number(card.style?.scale) || 100}
              <div class="zoomer" role="toolbar" tabindex="-1" onpointerdown={(e) => e.stopPropagation()}>
                <button title="Smaller" onclick={() => setScale(card, sc - 10)}>−</button>
                <span>{sc}%</span>
                <button title="Bigger" onclick={() => setScale(card, sc + 10)}>+</button>
              </div>
            {/if}
            {#if op && op.mode !== 'box'}<div class="size">{p.w} × {p.h}{op.mode === 'move' ? `  @ ${p.x}, ${p.y}` : ''}</div>{/if}
          {/if}
        {/if}
      </div>
    {/if}
  {/each}
  {#if selBox && selBox.zone === name}
    <div class="selbox" style="left:{selBox.x - 6}px;top:{selBox.y - 6}px;width:{selBox.w + 12}px;height:{selBox.h + 12}px">
      <span>{sel.size} cards{list[app.selected.index]?.group && app.multi.length < 2 ? ' · group' : ''}</span>
    </div>
  {/if}
  {#if op?.zone === name && op.guides?.length}
    {#each op.guides as g}<div class="guide" class:gx={g.x != null} style={g.x != null ? `left:${g.x}px` : `top:${g.y}px`}></div>{/each}
  {/if}
  {#if op?.zone === name && op.same?.length}
    {#each op.same as i}{@const q = list[i]}{#if q}<div class="same" style="left:{q.x}px;top:{q.y}px;width:{q.w}px;height:{q.h}px"></div>{/if}{/each}
  {/if}
  {#if op?.mode === 'box' && op.zone === name}
    <div class="band" style="left:{Math.min(op.x1, op.x2)}px;top:{Math.min(op.y1, op.y2)}px;width:{Math.abs(op.x2 - op.x1)}px;height:{Math.abs(op.y2 - op.y1)}px"></div>
  {/if}
{/snippet}

<div class="stage" class:editing={app.editing} class:dragging={!!op} class:right={L.sidebar.side === 'right'}
  style="width:{stageW}px;zoom:{scale};margin-left:{left / scale}px;--grid:{GRID}px">
  {#if sb}
    <aside class="zone sidebar" bind:this={sbEl} style="width:{sb}px;height:{vh / scale / sideZ}px;zoom:{sideZ}" onscroll={() => { if (!op) sbScroll = sbEl.scrollTop; }}>
      <div class="inner" role="presentation" style="height:{sideH}px;--sb-scroll:{sbScroll}" onpointerdown={(e) => bgDown(e, 'sidebar')} onpointermove={move} onpointerup={end}>{@render zone('sidebar', sideList)}</div>
    </aside>
  {/if}
  <main class="zone main" role="presentation" data-size="{L.width}px layout · edge of the canvas" style="width:{mainW}px;height:{mainH}px;zoom:{mainZ};{app.config.views.find((v) => v.id === app.view)?.background ? 'background:' + app.config.views.find((v) => v.id === app.view).background : ''}"
    onpointerdown={(e) => bgDown(e, app.view)} onpointermove={move} onpointerup={end}>
    {@render zone(app.view, mainList)}
  </main>
</div>

<style>
  .stage { display: flex; position: relative; }
  .stage.right { flex-direction: row-reverse; }
  .zone { position: relative; flex: none; }
  .sidebar { position: sticky; top: 0; overflow-y: auto; overflow-x: hidden; background: var(--sidebar-bg); border-right: 1px solid rgba(255,255,255,.05); scrollbar-width: none; }
  .right .sidebar { border-right: 0; border-left: 1px solid rgba(255,255,255,.05); }
  .sidebar .inner { position: relative; }
  .dragging .sidebar { overflow-x: visible; overflow-y: clip; z-index: 5; }
  .dragging .sidebar .inner { transform: translateY(calc(var(--sb-scroll) * -1px)); }
  .editing .zone { background-image: radial-gradient(circle, rgba(255,255,255,.09) 1px, transparent 1.2px); background-size: calc(var(--grid) * 2) calc(var(--grid) * 2); touch-action: none; }
  .editing .sidebar { outline: 1px dashed rgba(122,162,255,.35); outline-offset: -1px; }
  .editing .main { outline: 1px dashed rgba(122,162,255,.35); outline-offset: -1px; }
  .editing .main::after { content: attr(data-size); position: absolute; right: 8px; bottom: 8px; font-size: 11px; color: var(--muted); pointer-events: none; }
  .place { position: absolute; }
  .guide { position: absolute; left: 0; right: 0; height: 0; border-top: 1px solid #ff5fa2; z-index: 2000; pointer-events: none; }
  .guide.gx { top: 0; bottom: 0; left: auto; right: auto; width: 0; height: auto; border-top: 0; border-left: 1px solid #ff5fa2; }
  .same { position: absolute; z-index: 1999; pointer-events: none; border: 2px dashed #ff5fa2; border-radius: var(--radius); }
  .editing .place:hover { outline: 1px solid rgba(122,162,255,.4); outline-offset: 2px; border-radius: var(--radius); }
  .editing .place.grouped:not(.sel)::after { content: ''; position: absolute; top: 6px; right: 6px; width: 6px; height: 6px; border-radius: 50%; background: rgba(122,162,255,.6); z-index: 3; pointer-events: none; }
  .place.sel { outline: 1px solid rgba(122,162,255,.7) !important; outline-offset: 2px; border-radius: var(--radius); }
  .place.primary { outline: 2px solid var(--accent) !important; }
  .grab { position: absolute; inset: 0; cursor: move; touch-action: none; z-index: 2; }
  .h { position: absolute; z-index: 3; touch-action: none; }
  .h::after { content: ''; position: absolute; inset: 50% auto auto 50%; width: 12px; height: 12px; transform: translate(-50%, -50%); background: #fff; border: 2px solid var(--accent); border-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,.4); }
  .h-n, .h-s { left: 16px; right: 16px; height: 20px; cursor: ns-resize; }
  .h-e, .h-w { top: 16px; bottom: 16px; width: 20px; cursor: ew-resize; }
  .h-n { top: -12px; } .h-s { bottom: -12px; } .h-e { right: -12px; } .h-w { left: -12px; }
  .h-ne, .h-nw, .h-se, .h-sw { width: 26px; height: 26px; }
  .h-ne { top: -13px; right: -13px; cursor: nesw-resize; } .h-sw { bottom: -13px; left: -13px; cursor: nesw-resize; }
  .h-nw { top: -13px; left: -13px; cursor: nwse-resize; } .h-se { bottom: -13px; right: -13px; cursor: nwse-resize; }
  .h-ne::after, .h-nw::after, .h-se::after, .h-sw::after { width: 14px; height: 14px; border-radius: 50%; }
  .size { position: absolute; left: 50%; top: -34px; transform: translateX(-50%); background: var(--accent); color: #000; font-size: 12px; font-weight: 600; padding: 3px 8px; border-radius: 8px; white-space: pre; z-index: 4; pointer-events: none; }
  .zoomer { position: absolute; right: 0; bottom: -46px; z-index: 5; display: flex; align-items: center; gap: 2px; background: rgba(20,24,36,.96); border: 1px solid rgba(122,162,255,.5); border-radius: 12px; padding: 3px; box-shadow: 0 6px 20px rgba(0,0,0,.4); font-size: 13px; }
  .zoomer button { width: 30px; height: 28px; border: 0; border-radius: 9px; background: rgba(255,255,255,.08); color: var(--text); font-size: 17px; line-height: 1; }
  .zoomer button:hover { background: var(--accent); color: #000; }
  .zoomer span { min-width: 44px; text-align: center; color: var(--muted); font-variant-numeric: tabular-nums; }
  .selbox { position: absolute; border: 2px dashed var(--accent); border-radius: calc(var(--radius) + 6px); pointer-events: none; z-index: 900; }
  .selbox span { position: absolute; top: -26px; left: 0; background: var(--accent); color: #000; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 8px; white-space: nowrap; }
  .band { position: absolute; border: 1px solid var(--accent); background: rgba(122,162,255,.12); z-index: 950; pointer-events: none; }
</style>
