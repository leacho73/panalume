// What the Music card shows and how it plays things (cards/Music.svelte draws
// it). Works with Music Assistant through Home Assistant's music_assistant
// integration.
//
// Tapping an item never cuts off music: if a chosen speaker is already playing,
// it leads, the others join it and the item goes on the end of its queue. Only
// when nothing chosen is playing does the item start straight away.

export const TYPES = ['playlist', 'artist', 'album', 'track', 'radio'];
export const TYPE_LABEL = { playlist: 'Playlist', artist: 'Artist', album: 'Album', track: 'Track', radio: 'Radio' };
export const GROUP_LABEL = { playlist: 'Playlists', artist: 'Artists', album: 'Albums', track: 'Tracks', radio: 'Radio' };
// Music Assistant search answers per type under these keys (it also returns
// audiobooks and podcasts, which the card leaves out).
const SEARCH_KEY = { playlist: 'playlists', artist: 'artists', album: 'albums', track: 'tracks', radio: 'radio' };
const GROUPING = 524288; // MediaPlayerEntityFeature.GROUPING

/** Is this media_player state a Music Assistant player (or MA group)? */
export const isMaPlayer = (st) => st?.attributes?.mass_player_type != null;
/** Is it a Music Assistant group player (these can't be joined to others)? */
export const isGroupPlayer = (st) => st?.attributes?.mass_player_type === 'group';
/** Can it be joined with other speakers so they play in sync? */
export const canJoin = (st) => isMaPlayer(st) && !isGroupPlayer(st) && ((st.attributes.supported_features ?? 0) & GROUPING) === GROUPING;

/**
 * The speaker chips for the card's chosen players, in order and without
 * repeats. Ones Music Assistant can't play (e.g. the plain Cast copy of a
 * speaker, or one that no longer exists) stay visible but unusable, so a wrong
 * pick in the settings is easy to spot.
 */
export function speakerChips(players, getState) {
  return [...new Set(players)].map((id) => {
    const st = getState(id);
    // A switched-off speaker loses its Music Assistant attributes, so check that first.
    const reason = !st ? 'missing' : st.state === 'unavailable' ? 'unavailable' : !isMaPlayer(st) ? 'not_ma' : '';
    return { id, usable: !reason, reason };
  });
}

/** Every available Music Assistant player (and group), by name: what a new card offers. */
export function maSpeakers(states) {
  const name = (id) => states.get(id).attributes.friendly_name || id;
  return [...states.keys()]
    .filter((id) => id.startsWith('media_player.') && isMaPlayer(states.get(id)) && states.get(id).state !== 'unavailable')
    .sort((a, b) => name(a).localeCompare(name(b)));
}

/** A Music Assistant item as a tile: name, subtitle, picture and what to play. */
export function toTile(item) {
  const type = item.media_type;
  const artist = (type === 'album' || type === 'track') && item.artists?.[0]?.name;
  return {
    uri: item.uri,
    type,
    name: item.version ? `${item.name} (${item.version})` : item.name,
    sub: artist || TYPE_LABEL[type] || '',
    image: item.image || null,
  };
}

/** Search results as labelled rows of tiles, in TYPES order, without empty rows. */
export function groupSearch(resp) {
  return TYPES.map((type) => ({ type, label: GROUP_LABEL[type], tiles: (resp?.[SEARCH_KEY[type]] || []).map(toTile) })).filter((g) => g.tiles.length);
}

/** Favourites if there are any, else most played, else recently played. */
export function pickShelf({ favorites = [], mostPlayed = [], lastPlayed = [] }) {
  if (favorites.length) return { items: favorites, source: 'favorites' };
  if (mostPlayed.length) return { items: mostPlayed, source: 'most_played' };
  if (lastPlayed.length) return { items: lastPlayed, source: 'last_played' };
  return { items: [], source: 'empty' };
}

/**
 * How to play a tapped item on the chosen speakers: which speaker leads, which
 * join or leave it, and which play_media calls to make. null when no chosen
 * speaker can be used (gone, unavailable or not a Music Assistant player).
 * `offered` is every speaker on the card: one that is grouped with the leader
 * but no longer chosen is taken out of the group.
 */
export function planPlay(selected, getState, offered = []) {
  const usable = [...new Set(selected)].filter((id) => {
    const st = getState(id);
    return st && isMaPlayer(st) && st.state !== 'unavailable' && st.state !== 'unknown';
  });
  if (!usable.length) return null;
  const playing = (id) => getState(id).state === 'playing';
  const members = (id) => getState(id).attributes.group_members || [];
  const together = (a, b) => members(a).includes(b) || members(b).includes(a);
  // Something playing leads; otherwise a chosen group, so it plays to all its speakers.
  const leader = usable.find(playing) ?? usable.find((id) => isGroupPlayer(getState(id))) ?? usable[0];
  const lead = getState(leader);
  const join = [];
  const plays = [{ entity_id: leader, enqueue: playing(leader) ? 'add' : 'play' }];
  for (const id of usable) {
    if (id === leader || together(leader, id)) continue;
    // A speaker playing something else keeps it: queue there rather than join and cut it off.
    if (playing(id)) plays.push({ entity_id: id, enqueue: 'add' });
    else if (canJoin(lead) && canJoin(getState(id))) join.push(id);
    else plays.push({ entity_id: id, enqueue: 'play' });
  }
  const unjoin = members(leader).filter((id) => id !== leader && offered.includes(id) && !selected.includes(id));
  return { leader, join, unjoin, plays };
}

/** Numbers requests so a slow earlier answer can't overwrite a newer one. */
export function latestOnly() {
  let last = 0;
  return { next: () => ++last, isLatest: (n) => n === last };
}

/** Where this device remembers the card's last chosen speakers. */
export const lastKey = (cardId) => 'hd-music-' + cardId;

/** The card's last chosen speakers on this device, or null. */
export function loadLast(cardId, storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage.getItem(lastKey(cardId)));
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** Remember the chosen speakers on this device. */
export function saveLast(cardId, ids, storage = globalThis.localStorage) {
  try {
    storage.setItem(lastKey(cardId), JSON.stringify(ids));
  } catch {
    // Private mode or no storage: just don't remember.
  }
}
