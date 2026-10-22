// Small fill-ins so Panalume runs on older tablets (Safari 14–15, e.g. an
// iPad stuck on iPadOS 15). Newer browsers already have these and skip them.

if (!Array.prototype.at) {
  Object.defineProperty(Array.prototype, 'at', {
    configurable: true, writable: true,
    value(i) { i = Math.trunc(i) || 0; if (i < 0) i += this.length; return this[i]; },
  });
}

// Only used for plain settings and Svelte's snapshots, so a JSON copy is enough.
if (typeof structuredClone !== 'function') {
  globalThis.structuredClone = (v) => (v === undefined ? v : v instanceof Date ? new Date(v) : JSON.parse(JSON.stringify(v)));
}

// color-mix() arrived in Safari 16.2.
export const canMix = typeof CSS !== 'undefined' && !!CSS.supports?.('color', 'color-mix(in srgb, red 50%, blue)');
