// The iPad / iPhone screen edges (notch, home bar). Home Assistant pads its app
// frame by them with its own grey background unless the app says it handles
// them itself; then it sends the sizes, and Panalume pads its own content so
// its background fills the edges. Older Home Assistant ignores the message and
// keeps padding, and the sizes stay 0.
import { findFrame } from './kiosk.js';

export const safe = $state({ top: 0, right: 0, bottom: 0, left: 0 });

const px = (v) => Math.max(0, parseFloat(v) || 0);

// HA's header bar, when it's showing, already sits under the status bar.
let frame;
function headerShown() {
  try {
    frame = frame?.isConnected ? frame : findFrame(window.parent.document);
    const header = frame?.parentNode?.querySelector?.('.header');
    return !!header && header !== frame && header.offsetHeight > 0;
  } catch { return false; }
}

let rawTop = 0;
// Kiosk mode can hide or show HA's header after the sizes arrive, so look again now and then.
const checkTop = () => { const top = headerShown() ? 0 : rawTop; if (safe.top !== top) safe.top = top; };

export function startSafeArea() {
  if (window.parent === window) return;
  let timer;
  window.addEventListener('message', (ev) => {
    if (ev.source !== window.parent || ev.data?.type !== 'home-assistant/properties') return;
    const s = ev.data.safeAreaInsets;
    if (!s) return;
    rawTop = px(s.top);
    safe.right = px(s.right);
    safe.bottom = px(s.bottom);
    safe.left = px(s.left);
    checkTop();
    timer ??= setInterval(checkTop, 2000);
  });
  window.parent.postMessage({ type: 'home-assistant/subscribe-properties', handleSafeArea: true }, '*');
}
