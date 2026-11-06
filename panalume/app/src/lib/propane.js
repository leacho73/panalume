// Propane tank card helpers (cards/Propane.svelte): what a tank looks like and
// holds for each size, the colour band for a fill level, and how high the
// liquid sits in a horizontal tank.
//
// Sizes use the same keys as the Mopeka Enhanced integration's "Tank preset"
// sensor (20lb_v, 120gal_h, 29_3gal_asme_fk, 11kg_v…), so the card can follow
// that sensor, or the size can be picked by hand for any fill % sensor.

/** Sizes offered in the card's settings ('auto' follows the tank preset sensor). */
export const SIZES = [
  { value: 'auto', label: 'From the tank preset sensor' },
  { value: '20lb_v', label: '20 lb (vertical)' },
  { value: '30lb_v', label: '30 lb (vertical)' },
  { value: '40lb_v', label: '40 lb (vertical)' },
  { value: '100lb_v', label: '100 lb (vertical)' },
  { value: '120gal_v', label: '120 gal (vertical)' },
  { value: '120gal_h', label: '120 gal (horizontal)' },
  { value: '150gal_h', label: '150 gal (horizontal)' },
  { value: '250gal_h', label: '250 gal (horizontal)' },
  { value: '500gal_h', label: '500 gal (horizontal)' },
  { value: '1000gal_h', label: '1000 gal (horizontal)' },
];

// Liquid propane capacity at the 80% fill mark, in gallons (as the integration uses).
const LB_GAL = { 20: 4.7, 30: 7.1, 40: 9.4, 100: 23.6 };
// Height ÷ width of the body (vertical) or length ÷ diameter (horizontal), from typical tank dimensions.
const LB_ASPECT = { 20: 1.3, 30: 1.75, 40: 2.15, 100: 2.9 };
const H_ASPECT = { 120: 2.6, 150: 3.2, 250: 3.1, 500: 3.3, 1000: 4.4 };

/**
 * A tank from a size key. Returns
 *   shape   'v' (upright cylinder) | 'h' (lying down) | 'asme' (RV tank, lying down, no legs)
 *   aspect  body height ÷ width (v) or length ÷ diameter (h / asme)
 *   amount  { value, unit } the tank holds when full ('lb' / 'kg' for cylinders, else 'gal'), or null
 *   gal     full capacity in gallons, when known
 *   label   a short name ("30 lb", "500 gal")
 */
export function tankFor(key) {
  const k = String(key || '').toLowerCase().trim();
  const num = (s) => Number(String(s).replace('_', '.'));
  let m;
  if ((m = k.match(/^(\d+(?:_\d+)?)lb_v$/))) {
    const lb = num(m[1]);
    return { shape: 'v', aspect: LB_ASPECT[lb] ?? 1.8, amount: { value: lb, unit: 'lb' }, gal: LB_GAL[lb] ?? +(lb / 4.236).toFixed(1), label: `${lb} lb` };
  }
  if ((m = k.match(/^(\d+(?:_\d+)?)kg(?:_[a-z]+)?_v$/))) {
    const kg = num(m[1]);
    return { shape: 'v', aspect: kg >= 40 ? 2.6 : kg >= 15 ? 1.9 : kg >= 9 ? 1.55 : 1.25, amount: { value: kg, unit: 'kg' }, gal: null, label: `${kg} kg` };
  }
  if ((m = k.match(/^(\d+(?:_\d+)?)gal_asme/)) || k === 'asme_h') {
    const gal = m ? num(m[1]) : null;
    return { shape: 'asme', aspect: 2.3, amount: gal ? { value: gal, unit: 'gal' } : null, gal, label: gal ? `${gal} gal ASME` : 'ASME tank' };
  }
  if ((m = k.match(/^(\d+)gal_v$/))) {
    const gal = num(m[1]);
    return { shape: 'v', aspect: 2.1, amount: { value: gal, unit: 'gal' }, gal, label: `${gal} gal` };
  }
  if ((m = k.match(/^(\d+)gal_h$/))) {
    const gal = num(m[1]);
    return { shape: 'h', aspect: H_ASPECT[gal] ?? 3.2, amount: { value: gal, unit: 'gal' }, gal, label: `${gal} gal` };
  }
  return null;
}

/** The tank to draw: the card's chosen size, or the preset sensor's when set to 'auto' (a 30 lb cylinder if neither is known). */
export function pickTank(size, presetState) {
  const own = size && size !== 'auto' ? tankFor(size) : null;
  return own || tankFor(presetState) || { ...tankFor('30lb_v'), amount: null, gal: null, label: '' };
}

/** 'high' (green), 'mid' (yellow) or 'low' (red); thresholds in %, swapped if given the wrong way round. */
export function band(pct, greenFrom = 50, redBelow = 25) {
  const num = (v, d) => (v === '' || v == null || !Number.isFinite(Number(v)) ? d : Number(v)); // a cleared box in the editor is ''
  let hi = num(greenFrom, 50);
  let lo = num(redBelow, 25);
  if (lo > hi) [lo, hi] = [hi, lo];
  if (!Number.isFinite(pct)) return null;
  return pct >= hi ? 'high' : pct < lo ? 'low' : 'mid';
}

/**
 * How high the liquid stands in a horizontal cylinder (0–1 of the diameter)
 * when it's `frac` (0–1) full by volume: the inverse of the circular-segment
 * area, found by bisection. Upright tanks are linear, so this is only for 'h' / 'asme'.
 */
export function liquidHeight(frac) {
  const f = Math.min(1, Math.max(0, frac));
  if (f <= 0 || f >= 1) return f;
  const area = (h) => { const x = 1 - 2 * h; return (Math.acos(x) - x * Math.sqrt(1 - x * x)) / Math.PI; };
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (area(mid) < f) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/** What's left: { value, unit } from the fill % and what the tank holds, or null. */
export function amountLeft(pct, tank) {
  if (!Number.isFinite(pct) || !tank?.amount) return null;
  return { value: (Math.min(100, Math.max(0, pct)) / 100) * tank.amount.value, unit: tank.amount.unit };
}

/** 14.2 lb · 3.3 gal · 312 gal */
export function fmtAmount(v, unit) {
  if (!Number.isFinite(v)) return '';
  const n = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`;
}

/** Reading quality (0 / 33 / 66 / 100 %, i.e. 0–3 stars) as stars; null if unknown. */
export function stars(quality) {
  const q = Number(quality);
  return Number.isFinite(q) ? Math.max(0, Math.min(3, Math.round(q / (100 / 3)))) : null;
}
