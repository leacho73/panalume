<script module>
  export const meta = {
    type: 'music', name: 'Music', icon: 'mdi:music-box-multiple', category: 'Media',
    size: { w: 640, h: 520 }, tap: 'none',
    defaults: { players: [], default_players: [], show_playlist: true, show_album: true, show_radio: true, title: '' },
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'players', label: 'Speakers to offer (Music Assistant players)', type: 'entities', domain: 'media_player' },
      { key: 'default_players', label: 'Speakers chosen by default', type: 'entities', domain: 'media_player' },
      { key: 'show_playlist', label: 'Show favourite playlists', type: 'bool' },
      { key: 'show_album', label: 'Show favourite albums', type: 'bool' },
      { key: 'show_radio', label: 'Show favourite radio stations', type: 'bool' },
      { key: 'config_entry', label: 'Music Assistant entry id (only if you have more than one)', type: 'text' },
    ],
  };
</script>

<script>
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/tpl.js';
  import { name } from '../lib/entity.js';
  import { send, callService, states, conn, haImage, toast } from '../lib/ha.svelte.js';
  import { TYPES, GROUP_LABEL, speakerChips, groupSearch, toTile, pickShelf, planPlay, latestOnly, loadLast, saveLast } from '../lib/music.js';

  let { props, card } = $props();

  const ICON = { playlist: 'mdi:playlist-music', artist: 'mdi:account-music', album: 'mdi:album', track: 'mdi:music-note', radio: 'mdi:radio' };
  const SOURCE = { favorites: 'Favourites', most_played: 'Most played', last_played: 'Recently played' };
  const SHELF_TYPES = ['playlist', 'album', 'radio'];

  let entry = $state(null); // Music Assistant config entry id; '' once we know there isn't one
  let shelf = $state([]); // [{ type, label, tiles }]
  let shelfError = $state('');
  let query = $state('');
  let results = $state(null); // null = not searching
  let searching = $state(false);
  let searchError = $state('');
  let broken = $state({}); // tile uri -> picture failed to load

  /** Call a music_assistant service and get its response. */
  const ma = (service, data) =>
    send({ type: 'call_service', domain: 'music_assistant', service, service_data: { config_entry_id: entry, ...data }, return_response: true }).then((r) => r?.response);

  // Speakers from the card's list, remembered per device. Ones Music Assistant
  // can't play are shown greyed out rather than hidden.
  const allChips = $derived(speakerChips(props.players || [], (id) => states.get(id)));
  // Offered speakers stay chosen while switched off, so they're back once they return.
  const offered = $derived(allChips.map((c) => c.id));
  let selected = $state(null);
  $effect(() => {
    if (selected !== null || !offered.length) return;
    const last = (loadLast(card.id) || []).filter((id) => offered.includes(id));
    selected = last.length ? last : (props.default_players || []).filter((id) => offered.includes(id));
  });
  function toggle(id) {
    selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    saveLast(card.id, selected);
  }

  // Try again every 30 s while Music Assistant isn't ready (e.g. just after
  // Home Assistant restarts), and refresh the shelf every 10 minutes.
  let tick = $state(0);
  $effect(() => {
    const timer = setInterval(() => tick++, entry === '' || shelfError ? 30e3 : 600e3);
    return () => clearInterval(timer);
  });

  // Find Music Assistant, then load the shelf (favourites, or most / recently played).
  $effect(() => {
    if (!conn.connected) return;
    void tick;
    const wanted = t(props.config_entry);
    const types = SHELF_TYPES.filter((ty) => props[`show_${ty}`] !== false);
    (async () => {
      let id = wanted;
      if (!id) {
        let list;
        try {
          list = await send({ type: 'config_entries/get', domain: 'music_assistant' });
        } catch {
          shelfError = 'Could not reach Home Assistant';
          return;
        }
        id = list.find((e) => e.state === 'loaded')?.entry_id || '';
        if (!id && list.length) {
          shelfError = 'Music Assistant is starting…';
          return;
        }
      }
      entry = id;
      if (!id) return;
      try {
        const rows = [];
        for (const type of types) {
          const lib = (extra) => ma('get_library', { media_type: type, limit: 24, ...extra }).then((r) => r?.items || []);
          const favorites = await lib({ favorite: true });
          const mostPlayed = favorites.length ? [] : await lib({ order_by: 'play_count_desc' });
          const lastPlayed = favorites.length || mostPlayed.length ? [] : await lib({ order_by: 'last_played_desc' });
          const { items, source } = pickShelf({ favorites, mostPlayed, lastPlayed });
          if (items.length) rows.push({ type, label: `${GROUP_LABEL[type]} · ${SOURCE[source]}`, tiles: items.map(toTile) });
        }
        shelf = rows;
        shelfError = '';
      } catch (e) {
        shelfError = e?.message || 'Could not load your music';
      }
    })();
  });

  // Search the library and every Music Assistant provider as you type.
  const latest = latestOnly();
  $effect(() => {
    const q = query.trim();
    if (q.length < 2 || !entry) {
      latest.next(); // a search still on its way back must not reappear
      results = null;
      searching = false;
      return;
    }
    searching = true;
    const n = latest.next();
    const timer = setTimeout(() => {
      ma('search', { name: q, media_type: TYPES, limit: 8 })
        .then((r) => { if (latest.isLatest(n)) { results = groupSearch(r); searchError = ''; } })
        .catch((e) => { if (latest.isLatest(n)) { results = []; searchError = e?.message || 'Search failed'; } })
        .finally(() => { if (latest.isLatest(n)) searching = false; });
    }, 400);
    return () => clearTimeout(timer);
  });

  // Tap: add to the queue of whatever is playing, or start it if nothing is.
  async function play(tile) {
    const plan = planPlay(selected || [], (id) => states.get(id), offered);
    if (!plan) return toast('Pick a speaker');
    // callService shows its own error toast and resolves undefined when a call fails.
    for (const id of plan.unjoin) await callService('media_player', 'unjoin', {}, { entity_id: id });
    if (plan.join.length) await callService('media_player', 'join', { group_members: plan.join }, { entity_id: plan.leader });
    let ok = 0;
    for (const p of plan.plays) {
      const r = await callService('music_assistant', 'play_media', { media_id: tile.uri, media_type: tile.type, enqueue: p.enqueue }, { entity_id: p.entity_id });
      if (r !== undefined) ok++;
    }
    if (!ok) return;
    let msg = plan.plays[0].enqueue === 'add' ? `Added to queue: ${tile.name}` : `Playing ${tile.name}`;
    if (plan.plays.length > 1) msg += ' · Tip: a Music Assistant group keeps these speakers in sync';
    toast(msg);
  }

  const rows = $derived(results ?? shelf);
</script>

<div class="music">
  {#if t(props.title)}<div class="title">{t(props.title)}</div>{/if}
  {#if entry === ''}
    <div class="note"><Icon icon="mdi:music-off" size="1.4em" /> Needs Home Assistant's Music Assistant integration (2025.x or later).</div>
  {:else}
    <div class="search" data-stop>
      <Icon icon="mdi:magnify" size="1.2em" />
      <input type="search" placeholder="Search playlists, artists, albums, radio…" bind:value={query} />
      {#if query}<button class="clear" aria-label="Clear search" onclick={() => (query = '')}><Icon icon="mdi:close" size="1.1em" /></button>{/if}
    </div>
    <div class="chips" data-stop>
      {#each allChips as c (c.id)}
        {#if c.usable}
          <button class="chip" class:on={selected?.includes(c.id)} onclick={() => toggle(c.id)}>{name(states.get(c.id)) || c.id}</button>
        {:else if c.reason === 'unavailable'}
          <button class="chip off" class:on={selected?.includes(c.id)} disabled title="{c.id} is switched off or unreachable">{name(states.get(c.id)) || c.id} · off</button>
        {:else}
          <button class="chip off" disabled title="{c.id} isn't a Music Assistant player: pick its Music Assistant version in the card settings">{name(states.get(c.id)) || c.id} · not in Music Assistant</button>
        {/if}
      {:else}
        <span class="hint">Choose the speakers to offer in this card's settings.</span>
      {/each}
    </div>
    <div class="rows" data-stop>
      {#if results && searching && !results.length}<div class="hint">Searching…</div>{/if}
      {#if results && !searching && !results.length}<div class="hint">{searchError || 'No results'}</div>{/if}
      {#if !results && shelfError}<div class="hint">{shelfError}</div>{/if}
      {#if !results && !shelfError && entry && !shelf.length}<div class="hint">Nothing in your library yet. Search to find something to play.</div>{/if}
      {#each rows as row (row.type)}
        <div class="row">
          <div class="label">{row.label}</div>
          <div class="grid">
            {#each row.tiles as tile (tile.uri)}
              <button class="tile" onclick={() => play(tile)} title={tile.name}>
                <div class="art">
                  {#if tile.image && !broken[tile.uri]}
                    <img src={haImage(tile.image)} alt="" loading="lazy" onerror={() => (broken[tile.uri] = true)} />
                  {:else}
                    <Icon icon={ICON[tile.type] || 'mdi:music'} size="2.4em" />
                  {/if}
                </div>
                <div class="name">{tile.name}</div>
                <div class="sub">{tile.sub}</div>
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .music { height: 100%; display: flex; flex-direction: column; gap: 10px; min-height: 0; }
  .title { font-weight: 600; font-size: 1.1em; }
  .note, .hint { color: var(--muted); font-size: .9em; display: flex; align-items: center; gap: 8px; padding: 6px 2px; }
  .search { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.18); border-radius: 12px; padding: 4px 10px; }
  .search input { flex: 1; min-width: 0; background: none; border: 0; outline: 0; color: inherit; font: inherit; padding: 8px 0; }
  .search input::-webkit-search-cancel-button { display: none; }
  .clear { background: none; border: 0; color: inherit; padding: 4px; border-radius: 50%; display: grid; place-items: center; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { background: none; color: inherit; font: inherit; font-size: .85em; border: 1px solid rgba(255,255,255,.25); border-radius: 999px; padding: 6px 12px; }
  .chip.on { background: var(--accent); border-color: var(--accent); color: #000; font-weight: 600; }
  .chip.off { opacity: .45; border-style: dashed; }
  .rows { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
  .label { color: var(--muted); font-size: .8em; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 6px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
  .tile { background: rgba(255,255,255,.06); border: 0; border-radius: 14px; padding: 0 0 8px; color: inherit; font: inherit; text-align: left; overflow: hidden; display: flex; flex-direction: column; }
  .tile:active { transform: scale(.97); }
  .art { aspect-ratio: 1; display: grid; place-items: center; background: var(--card-bg, rgba(255,255,255,.08)); color: var(--muted); }
  .art img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .name { padding: 8px 10px 0; font-size: .9em; font-weight: 600; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .sub { padding: 2px 10px 0; color: var(--muted); font-size: .78em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
