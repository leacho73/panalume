// Kiosk mode: hide Home Assistant's header bar around this add-on page.
// Ingress serves us from HA's own origin, so we can reach the parent page,
// find our <iframe> (through HA's shadow DOM) and hide the header above it.
export function findFrame(root) {
  for (const el of root.querySelectorAll('*')) {
    if (el.tagName === 'IFRAME' && el.contentWindow === window) return el;
    if (el.shadowRoot) {
      const f = findFrame(el.shadowRoot);
      if (f) return f;
    }
  }
  return null;
}

let timer;
let frame;
export function setKiosk(on) {
  clearInterval(timer);
  const apply = () => {
    try {
      if (window.parent === window) return;
      frame = frame?.isConnected ? frame : findFrame(window.parent.document);
      if (!frame) return;
      const header = frame.parentNode?.querySelector?.('.header, ha-top-app-bar, ha-top-app-bar-fixed, app-header');
      if (header && header !== frame) header.style.display = on ? 'none' : '';
      frame.style.height = on ? '100%' : '';
    } catch {
      // Not same-origin (e.g. opened directly) — nothing to hide.
    }
  };
  apply();
  // HA can re-render the panel; keep it applied.
  if (on) timer = setInterval(apply, 3000);
}
