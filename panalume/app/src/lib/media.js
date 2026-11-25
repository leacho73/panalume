// Shared bits for the media cards.

/** Where a player is in the track, in seconds: media_position is a snapshot taken at
 *  media_position_updated_at, so while it plays it's moved on by the time since. */
export function mediaPosition(a, playing, nowMs) {
  const base = Number(a?.media_position);
  if (!Number.isFinite(base)) return null;
  const dur = Number(a.media_duration) || Infinity;
  const at = a.media_position_updated_at;
  const started = typeof at === 'number' ? at * 1000 : Date.parse(at || '');
  if (!playing || Number.isNaN(started)) return Math.min(dur, base);
  return Math.min(dur, base + (nowMs - started) / 1000);
}

/** 3:07, or 1:02:07 for long ones. */
export function clockTime(s) {
  const v = Math.max(0, Math.round(s));
  const m = Math.floor(v / 60), sec = v % 60, hh = Math.floor(m / 60);
  return hh ? `${hh}:${String(m % 60).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** The player that runs the queue: in a group (Music Assistant, Sonos and others) skip,
 *  seek, shuffle and repeat belong to the group's leader, the first of group_members,
 *  even when they're pressed on another member. */
export function queueOwner(id, a) {
  const g = a?.group_members;
  return Array.isArray(g) && g.length > 1 && g.includes(id) && g[0] !== id ? g[0] : id;
}
