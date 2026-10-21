// Automatic phone layout: the main layout reflowed into a single column.
// Rooms (groups) stay together, small cards pair up two-per-row, media-like
// cards keep their aspect ratio. Navigation goes to the top of every view and
// the rest of the sidebar to the end of the first view.
const GAP = 12;
const ASPECT = new Set(['camera', 'image', 'iframe', 'powerflow']);

export function reflow(master, width, views, cards, skip = null) {
  const W = width - 32;
  const half = Math.floor((W - GAP) / 2);
  const mainW = master.width - (master.sidebar.enabled ? master.sidebar.width : 0);
  const type = (p) => cards[p.card]?.type;
  const side = master.sidebar.enabled ? master.zones.sidebar || [] : [];
  const navs = side.filter((p) => type(p) === 'nav');
  const TEXT = new Set(['textlist', 'markdown', 'entities']);
  const top = side.filter((p) => type(p) !== 'nav' && !TEXT.has(type(p)));
  const rest = side.filter((p) => TEXT.has(type(p)));
  const zones = { sidebar: [] };

  views.forEach((v, vi) => {
    const out = [];
    let y = 12;
    const place = (items, srcW) => {
      let pending = null; // a half-width card waiting for a partner
      for (const p of items) {
        if (skip?.(p)) continue;
        const small = p.w <= srcW * 0.3 && type(p) !== 'markdown';
        if (small) {
          if (pending) {
            out.push({ ...p, x: 16 + half + GAP, y: pending.y, w: half, h: pending.h });
            y = pending.y + pending.h + GAP;
            pending = null;
          } else {
            pending = { ...p, x: 16, y, w: half };
            out.push(pending);
          }
          continue;
        }
        if (pending) { y = pending.y + pending.h + GAP; pending = null; }
        const h = ASPECT.has(type(p)) ? Math.round((p.h * W) / p.w) : p.h;
        out.push({ ...p, x: 16, y, w: W, h });
        y += h + GAP;
      }
      if (pending) y = pending.y + pending.h + GAP;
    };
    place(navs.map((p) => ({ ...p, h: 56 })), W);
    if (vi === 0) place(top.map((p) => ({ ...p, w: Math.max(p.w, W) })), W);
    // Consecutive ungrouped cards flow together (so small ones can pair up);
    // each group (room) is placed as its own block.
    let loose = [];
    const flushLoose = () => { if (loose.length) { place(loose, mainW); y += 6; loose = []; } };
    for (const block of blocks(master.zones[v.id] || [])) {
      if (block.length === 1 && !block[0].group) { loose.push(block[0]); continue; }
      flushLoose();
      place(block, mainW);
      y += 6;
    }
    flushLoose();
    if (vi === 0) place(rest, master.sidebar.width * 3.4);
    zones[v.id] = out;
  });
  return { width, mode: 'auto', sidebar: { enabled: false, side: 'left', width: 300 }, zones };
}

/** Cards grouped (rooms) and in reading order: top-to-bottom bands, then left-to-right. */
function blocks(list) {
  const map = new Map();
  list.forEach((p, i) => {
    const k = p.group || '#' + i;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(p);
  });
  const order = (a, b) => (Math.abs(a.y - b.y) > 20 ? a.y - b.y : a.x - b.x);
  const out = [...map.values()].map((items) => {
    items.sort(order);
    return { items, x: Math.min(...items.map((p) => p.x)), y: Math.min(...items.map((p) => p.y)) };
  });
  out.sort(order);
  return out.map((b) => b.items);
}
