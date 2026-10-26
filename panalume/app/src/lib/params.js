// Address options (?device=, ?fit=, ?kiosk, ?view=, ?noedit). Inside Home Assistant
// we run in an iframe on HA's own origin, so options added to HA's address bar
// (…/panalume?view=upstairs) are read from the parent page as well as our own.
function searches() {
  const out = [location.search];
  try {
    if (window.parent !== window) out.push(window.parent.location.search);
  } catch {
    // Not same-origin: only our own address.
  }
  return out;
}

/** The view named after # in Home Assistant's own address (…/panalume#energy), or ''. */
export function parentHash() {
  try {
    if (window.parent !== window) return decodeURIComponent(window.parent.location.hash.slice(1));
  } catch {}
  return '';
}

/** Show the current view in Home Assistant's address bar (…/panalume#energy), so it can be bookmarked or shared. */
export function setParentHash(id) {
  try {
    if (window.parent === window) return;
    const loc = window.parent.location;
    const want = id ? '#' + encodeURIComponent(id) : '';
    if (loc.hash !== want) window.parent.history.replaceState(window.parent.history.state, '', loc.pathname + loc.search + want);
  } catch {
    // Not same-origin: nothing to update.
  }
}

/** The option's value ('' for a bare flag like ?kiosk), or null if absent. */
export function param(name) {
  for (const s of searches()) {
    const v = new URLSearchParams(s).get(name);
    if (v != null) return v;
  }
  return null;
}
