// The year's daylight milestones on the way back to light: lighter evenings, the shortest
// day, lighter mornings, and the thresholds someone picks (sunset after 17:00, 10 hours
// of light). Finding them needs sunrise and sunset for about 800 days, so this uses
// NOAA's closed-form equations (https://gml.noaa.gov/grad/solcalc/solareqns.PDF)
// instead of sun.js's sampled day path, which would be slow on older tablets.
const R = Math.PI / 180;
const ZENITH = 90.833 * R;
const DAY = 864e5;
const LOOK_BACK = 400;
const LOOK_AHEAD = 400;

const startOfDay = (t) => new Date(t).setHours(0, 0, 0, 0);
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);

/** Minutes after local midnight, as a wall clock shows them (so after a DST change too). */
function clockMinutes(t, midnight) {
  const d = new Date(t);
  return daysBetween(midnight, t) * 1440 + d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

/** Sunrise, sunset and day length (ms) for the local calendar day y-m-d. */
export function solarDay(y, m, d, lat, lon) {
  const midnight = +new Date(y, m, d);
  const utcMidnight = Date.UTC(y, m, d);
  const yearStart = Date.UTC(y, 0, 1);
  const dayOfYear = Math.round((utcMidnight - yearStart) / DAY) + 1;
  const yearLength = Math.round((Date.UTC(y + 1, 0, 1) - yearStart) / DAY);

  const g = ((2 * Math.PI) / yearLength) * (dayOfYear - 1);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));

  const phi = lat * R;
  const cosH = Math.cos(ZENITH) / (Math.cos(phi) * Math.cos(decl)) - Math.tan(phi) * Math.tan(decl);
  if (cosH >= 1) return { day: midnight, daylight: 0, rise: null, set: null, riseClock: null, setClock: null };
  if (cosH <= -1) return { day: midnight, daylight: DAY, rise: null, set: null, riseClock: null, setClock: null };

  const H = Math.acos(cosH) / R;
  const noon = 720 - 4 * lon - eot;
  // Near the date line the zone's offset differs from the longitude's by up to a day, so
  // the UTC date whose solar noon falls on this local day can be the day before or after.
  const base = utcMidnight - daysBetween(midnight, utcMidnight + noon * 60e3) * DAY;
  const rise = base + (noon - 4 * H) * 60e3;
  const set = base + (noon + 4 * H) * 60e3;
  return { day: midnight, daylight: 8 * H * 60e3, rise, set, riseClock: clockMinutes(rise, midnight), setClock: clockMinutes(set, midnight) };
}

function series(now, lat, lon, before, after) {
  const today = new Date(now);
  const days = [];
  for (let i = -before; i <= after; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    days.push(solarDay(d.getFullYear(), d.getMonth(), d.getDate(), lat, lon));
  }
  return days;
}

const range = (a, b) => { const out = []; for (let i = a; i <= b; i++) out.push(i); return out; };
const after = (i, end) => range(i + 1, end);
const span = (lo, hi) => range(lo, Math.max(lo, hi));

function lastIndexOfMax(v, lo, hi) {
  let peak = -Infinity;
  for (let i = lo; i <= hi; i++) peak = Math.max(peak, v[i]);
  for (let i = hi; i >= lo; i--) if (v[i] >= peak - 500) return i;
  return hi;
}
function firstIndexOfMax(v, lo, hi) {
  let peak = -Infinity;
  for (let i = lo; i <= hi; i++) peak = Math.max(peak, v[i]);
  for (let i = lo; i <= hi; i++) if (v[i] >= peak - 500) return i;
  return lo;
}
function firstIndexOfMin(v, lo, hi) {
  let low = Infinity;
  for (let i = lo; i <= hi; i++) low = Math.min(low, v[i]);
  for (let i = lo; i <= hi; i++) if (v[i] <= low + 500) return i;
  return lo;
}
/** Polar night and midnight sun give runs of identical days; the middle of the run is the solstice. */
function plateauMidpoint(v, i) {
  let lo = i, hi = i;
  while (lo > 0 && Math.abs(v[lo - 1] - v[i]) < 500) lo--;
  while (hi < v.length - 1 && Math.abs(v[hi + 1] - v[i]) < 500) hi++;
  return Math.floor((lo + hi) / 2);
}
function extremeIndex(indices, v, smallest) {
  let best = null;
  for (const i of indices) {
    if (v[i] == null) continue;
    if (best == null || (smallest ? v[i] < v[best] : v[i] > v[best])) best = i;
  }
  return best;
}

/** Under the midnight sun the past year's maximum is a run that can include today. Its midpoint
 *  is the real solstice; if that is still ahead, the cycle started at last year's solstice. */
function lastLongestDay(v, ti) {
  const candidate = plateauMidpoint(v, lastIndexOfMax(v, ti - 366, ti));
  if (candidate <= ti) return candidate;
  return plateauMidpoint(v, lastIndexOfMax(v, Math.max(0, candidate - 400), Math.max(0, candidate - 200)));
}

/**
 * One light cycle, from the last longest day to the next, seen from `now`.
 * `bearable` is a day length in minutes, `evening` a wall-clock sunset in minutes after midnight;
 * null leaves that milestone out.
 */
export function season(now, lat, lon, { bearable = null, evening = null } = {}) {
  const days = series(now, lat, lon, LOOK_BACK, LOOK_AHEAD);
  const ti = LOOK_BACK;
  const light = days.map((d) => d.daylight);
  const rises = days.map((d) => d.riseClock);
  const sets = days.map((d) => d.setClock);

  // Anchored on longest days so every winter milestone, past or future, belongs to the
  // same season for the whole dark half of the year.
  const start = lastLongestDay(light, ti);
  const end = plateauMidpoint(light, firstIndexOfMax(light, start + 200, Math.min(start + 400, days.length - 1)));
  const shortest = plateauMidpoint(light, firstIndexOfMin(light, start, end));
  const found = [];

  let eveningsAt = null;
  if (light[shortest] > 0) {
    const ev = span(Math.max(start, shortest - 60), Math.min(end, shortest + 10));
    const e = extremeIndex(ev, sets, true);
    if (e != null && e !== ev[0] && e !== ev[ev.length - 1]) { eveningsAt = e; found.push({ kind: 'evenings', at: e }); }
    const mo = span(Math.max(start, shortest - 10), Math.min(end, shortest + 60));
    const m = extremeIndex(mo, rises, false);
    if (m != null && m !== mo[0] && m !== mo[mo.length - 1]) found.push({ kind: 'mornings', at: m });
    found.push({ kind: 'grow', at: shortest });
  } else {
    const r = after(shortest, end).find((i) => light[i] > 0);
    if (r != null) found.push({ kind: 'sun-returns', at: r });
  }

  const from = eveningsAt ?? shortest;
  if (evening != null && (sets[from] ?? 0) < evening) {
    const s = after(from, end).find((i) => (sets[i] ?? 0) >= evening);
    if (s != null) found.push({ kind: 'sunset', minutes: evening, at: s });
  }
  const bearableMs = bearable * 60e3;
  if (bearable != null && light[shortest] < bearableMs) {
    const b = after(shortest, end).find((i) => light[i] >= bearableMs);
    if (b != null) found.push({ kind: 'bearable', minutes: bearable, at: b });
  }
  if (light[shortest] < DAY / 2) {
    const q = after(shortest, end).find((i) => light[i] >= DAY / 2);
    if (q != null) found.push({ kind: 'equal', at: q });
  }
  found.push({ kind: 'longest', at: end });

  const points = found
    .map((p, order) => ({ ...p, order }))
    .sort((a, b) => a.at - b.at || a.order - b.order)
    .map(({ order, at, ...p }) => ({ ...p, at, day: days[at].day, key: `${p.kind}-${days[at].day}` }));

  let next = points.findIndex((p) => p.at >= ti);
  if (next < 0) next = points.length - 1;
  const prev = next > 0 ? points[next - 1].at : start;
  const stretch = points[next].at - prev;
  const progress = stretch > 0 ? Math.min(1, Math.max(0, (ti - prev) / stretch)) : 1;

  const today = days[ti];
  const gained = ti > shortest ? today.daylight - light[shortest] : null;
  return {
    today,
    shortest: days[shortest],
    points,
    next,
    progress,
    change: today.daylight - light[ti - 1],
    // The first days after the solstice gain only seconds, which would read as "+0 min".
    gained: gained != null && gained > 30e3 ? gained : null,
    daysUntil: (p) => daysBetween(today.day, p.day),
    done: (p) => p.day < today.day,
  };
}
