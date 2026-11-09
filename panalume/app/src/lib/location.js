// Where a person is, for the People card's "open a map" option. The same test
// the Map card uses: a latitude and a longitude that are real numbers.

const num = (v) => (v == null || v === '' ? NaN : Number(v));

/** Does this person / tracker report where it is? */
export function hasLocation(e) {
  const a = e?.attributes;
  return Number.isFinite(num(a?.latitude)) && Number.isFinite(num(a?.longitude));
}

/** What tapping someone in the People card opens: their map if chosen and they have a location, else their details. */
export function personTap(props, e) {
  return props.open === 'map' && hasLocation(e) ? 'map' : 'details';
}
