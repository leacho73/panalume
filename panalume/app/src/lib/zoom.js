// Digital zoom for a camera picture or video: pinch or the mouse wheel zooms in on
// the point under the fingers / pointer, a drag moves around once zoomed in, and a
// double tap or double click zooms in there (or back out). Used as a Svelte action on
// the box that holds the picture: use:zoomable={{ on, doubleTap }}. On a card, whose
// own tap opens the full-screen view, double tap is left off.
//
// While not zoomed in, one finger still scrolls the page (touch-action pan-x pan-y,
// which also leaves two-finger pinches to us rather than the browser); once zoomed
// in, one finger pans the picture instead. A tap that ended a drag or a pinch doesn't
// go on to the card underneath (its tap action).
const MAX = 6;

export function zoomable(node, opts = {}) {
  let enabled = opts.on !== false, dbl = !!opts.doubleTap;
  let s = 1, x = 0, y = 0; // scale, and the picture's offset in px (transform-origin 0 0)
  const pts = new Map(); // pointerId → { x, y } in the box's own coordinates
  let start = null; // the gesture's starting state
  let moved = false;
  let lastTap = 0;

  // Measured on the frame around the picture, which doesn't move or scale with it.
  const box = () => (node.parentElement || node).getBoundingClientRect();
  const local = (ev) => { const r = box(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  function apply() {
    const r = box();
    // Keep the picture covering the box: no empty edges while zoomed in.
    x = Math.min(0, Math.max(r.width - r.width * s, x));
    y = Math.min(0, Math.max(r.height - r.height * s, y));
    node.style.transform = s > 1 ? `translate(${x}px, ${y}px) scale(${s})` : '';
    node.style.touchAction = !enabled ? '' : s > 1 ? 'none' : 'pan-x pan-y';
    node.style.cursor = enabled && s > 1 ? 'grab' : '';
  }
  // Zoom to scale `to`, keeping the point (px, py) of the box where it is.
  function zoomAt(to, px, py) {
    to = Math.min(MAX, Math.max(1, to));
    x = px - ((px - x) * to) / s;
    y = py - ((py - y) * to) / s;
    s = to;
    if (s === 1) x = y = 0;
    apply();
  }

  function down(ev) {
    if (!enabled) return;
    pts.set(ev.pointerId, local(ev));
    try { node.setPointerCapture(ev.pointerId); } catch {}
    const p = [...pts.values()];
    if (p.length === 1) { start = { s, x, y, p: p[0] }; moved = false; }
    else if (p.length === 2) {
      const mid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
      start = { s, x, y, mid, d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1 };
      moved = true;
    }
  }
  function move(ev) {
    if (!enabled || !pts.has(ev.pointerId)) return;
    pts.set(ev.pointerId, local(ev));
    const p = [...pts.values()];
    if (p.length >= 2 && start?.d) {
      // Pinch: scale by how far apart the fingers are, about where they started, and
      // follow the midpoint as it moves.
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      const mid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
      const to = Math.min(MAX, Math.max(1, (start.s * d) / start.d));
      x = mid.x - ((start.mid.x - start.x) * to) / start.s;
      y = mid.y - ((start.mid.y - start.y) * to) / start.s;
      s = to;
      if (s === 1) x = y = 0;
      apply();
      ev.preventDefault();
    } else if (p.length === 1 && start && s > 1) {
      const dx = p[0].x - start.p.x, dy = p[0].y - start.p.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      x = start.x + dx; y = start.y + dy;
      apply();
      ev.preventDefault();
    }
  }
  function up(ev) {
    if (!pts.has(ev.pointerId)) return;
    pts.delete(ev.pointerId);
    const p = [...pts.values()];
    // Lifting one finger of a pinch carries on as a drag from where it is now.
    start = p.length === 1 ? { s, x, y, p: p[0] } : null;
    if (dbl && p.length === 0 && !moved && ev.type === 'pointerup') {
      const now = performance.now();
      if (now - lastTap < 300) { const q = local(ev); zoomAt(s > 1 ? 1 : 2.5, q.x, q.y); lastTap = 0; moved = true; }
      else lastTap = now;
    }
  }
  function wheel(ev) {
    if (!enabled) return;
    ev.preventDefault();
    const q = local(ev);
    zoomAt(s * Math.exp(-ev.deltaY * 0.002), q.x, q.y);
  }
  // The browser would otherwise start dragging the picture itself, which cancels the pan.
  const noDrag = (ev) => { if (enabled) ev.preventDefault(); };
  // A drag, a pinch or a double tap isn't a tap on the card.
  function click(ev) {
    if (enabled && moved) { ev.stopPropagation(); ev.preventDefault(); moved = false; }
  }

  node.style.transformOrigin = '0 0';
  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', up);
  node.addEventListener('wheel', wheel, { passive: false });
  node.addEventListener('click', click, true);
  node.addEventListener('dragstart', noDrag);
  apply();
  return {
    update(v = {}) {
      enabled = v.on !== false; dbl = !!v.doubleTap;
      if (!enabled) { s = 1; x = y = 0; pts.clear(); }
      apply();
    },
    destroy() {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
      node.removeEventListener('wheel', wheel);
      node.removeEventListener('click', click, true);
      node.removeEventListener('dragstart', noDrag);
    },
  };
}
