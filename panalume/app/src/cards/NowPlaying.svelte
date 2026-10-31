<script module>
  import { states } from '../lib/ha.svelte.js';

  const OFF = ['off', 'unavailable', 'unknown', 'idle', 'standby'];

  export const meta = {
    type: 'now-playing', name: 'Now playing', icon: 'mdi:music-box-outline', category: 'Media',
    size: { w: 300, h: 300 }, tap: 'more-info', hold: 'more-info',
    defaults: { entity: '', art: 'fill' },
    sections: [
      { key: 'art', label: 'Artwork' },
      { key: 'source', label: 'Player name' },
      { key: 'title', label: 'Track' },
      { key: 'artist', label: 'Artist and album' },
      { key: 'progress', label: 'Progress' },
      { key: 'controls', label: 'Controls' },
    ],
    // Something playing now, else the first player that could play something.
    autofill: () => ({ entity: pick() }),
    fields: [
      { key: 'entity', label: 'Media player', type: 'entity', domain: 'media_player' },
      { key: 'name', label: 'Name (blank = the player’s own name)', type: 'text' },
      { key: 'art', label: 'Artwork', type: 'select', options: ['fill', 'cover', 'none'], hint: 'fill covers the tile with the picture. cover puts a square beside the text, over a blurred copy. none is text only, for players that never have artwork.' },
    ],
  };

  function pick() {
    const ids = [...states.keys()].filter((id) => id.startsWith('media_player.'));
    const playing = ids.find((id) => states.get(id)?.state === 'playing');
    const usable = ids.find((id) => !OFF.includes(states.get(id)?.state));
    return playing || usable || ids[0] || '';
  }
</script>

<script>
  // The tile an Android phone opens its media player with: the artwork, what is
  // playing, how far in, and three buttons.
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { name } from '../lib/entity.js';
  import { callService, haImage } from '../lib/ha.svelte.js';

  let { props, w = 300, h = 300 } = $props();
  const show = (k) => !props.hide?.[k];
  const e = $derived(ent(props.entity));
  const a = $derived(e?.attributes || {});
  const sf = $derived(Number(a.supported_features) || 0);
  const has = (bit) => (sf & bit) !== 0;
  const playing = $derived(e?.state === 'playing');
  const mode = $derived(show('art') ? props.art || 'fill' : 'none');
  // Artwork goes through Home Assistant's own image proxy and is drawn as a
  // background, so a player with no picture (or a dead URL) leaves a plain tile
  // rather than a broken image.
  const art = $derived(mode === 'none' ? '' : haImage(a.entity_picture_local || a.entity_picture));
  const title = $derived.by(() => {
    if (!e) return 'No player picked';
    if (e.state === 'unavailable' || e.state === 'unknown') return 'Player unavailable';
    if (a.media_title) return a.media_title;
    if (e.state === 'off') return 'Off';
    if (e.state === 'idle') return 'Nothing playing';
    if (e.state === 'paused') return 'Paused';
    return a.media_series_title || e.state;
  });
  // The album only when it is not just the track's own name again.
  const artist = $derived([a.media_artist, a.media_album_name !== a.media_title ? a.media_album_name : ''].filter(Boolean).join(' — '));
  const device = $derived(t(props.name) || name(e) || '');
  const app = $derived(a.app_name && a.app_name !== device ? a.app_name : '');
  const dur = $derived(Number(a.media_duration) || 0);
  // media_position is a snapshot from media_position_updated_at; while it plays,
  // keep it moving so the bar is not a second out of date.
  let nowMs = $state(Date.now());
  $effect(() => {
    if (!playing) return;
    const i = setInterval(() => { nowMs = Date.now(); }, 1000);
    return () => clearInterval(i);
  });
  const pos = $derived.by(() => {
    const base = Number(a.media_position);
    if (!Number.isFinite(base)) return null;
    const started = Date.parse(a.media_position_updated_at || '');
    if (!playing || Number.isNaN(started)) return base;
    return Math.min(dur || Infinity, base + (nowMs - started) / 1000);
  });
  const pct = $derived(dur > 0 && pos != null ? Math.max(0, Math.min(100, (pos / dur) * 100)) : 0);
  const clock = (s) => {
    const v = Math.max(0, Math.round(s));
    const m = Math.floor(v / 60), sec = v % 60, hh = Math.floor(m / 60);
    return hh ? `${hh}:${String(m % 60).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
  };
  const svc = (s, d = {}) => callService('media_player', s, d, { entity_id: e?.entity_id });
  const landscape = $derived(w > h * 1.5);
  const small = $derived(h < 200 || w < 200);
</script>

<div class="np" class:over={!!art} class:landscape class:small>
  {#if art}
    <div class="back" class:blur={mode === 'cover'} style="background-image:url('{art}')"></div>
    <div class="veil"></div>
  {/if}

  {#if show('source') && device}
    <div class="src">
      <Icon icon="mdi:speaker" size="1em" />
      <span class="dev">{device}</span>
      {#if app}<span class="app">· {app}</span>{/if}
    </div>
  {/if}

  <div class="mid">
    {#if art && mode === 'cover' && !small}<img class="cover" src={art} alt="" />{/if}
    <div class="text">
      {#if show('title')}<div class="title" class:muted={!a.media_title}>{title}</div>{/if}
      {#if show('artist') && artist}<div class="artist">{artist}</div>{/if}
      {#if show('progress') && dur > 0 && pos != null}
        <div class="prog">
          <div class="track"><div class="done" style="width:{pct}%"></div></div>
          <span class="times">{clock(pos)} / {clock(dur)}</span>
        </div>
      {/if}
    </div>
  </div>

  {#if show('controls') && e}
    <div class="controls" data-stop>
      {#if has(16)}<button onclick={() => svc('media_previous_track')} aria-label="Previous"><Icon icon="mdi:skip-previous" size="1.5em" /></button>{:else}<span class="gap"></span>{/if}
      <button class="play" onclick={() => (e.state === 'off' && has(128) ? svc('turn_on') : svc('media_play_pause'))} aria-label={playing ? 'Pause' : 'Play'}>
        <Icon icon={e.state === 'off' ? 'mdi:power' : playing ? 'mdi:pause' : 'mdi:play'} size="1.6em" />
      </button>
      {#if has(32)}<button onclick={() => svc('media_next_track')} aria-label="Next"><Icon icon="mdi:skip-next" size="1.5em" /></button>{:else}<span class="gap"></span>{/if}
    </div>
  {/if}
</div>

<style>
  .np { position: relative; height: 100%; display: flex; flex-direction: column; justify-content: space-between; gap: 6px; isolation: isolate; container-type: size; min-height: 0; }
  .back { position: absolute; inset: calc(var(--pad) * -1); background-size: cover; background-position: center; border-radius: inherit; z-index: -2; transition: background-image .4s; }
  .back.blur { filter: blur(22px) saturate(1.15) brightness(.62); transform: scale(1.1); }
  .veil { position: absolute; inset: calc(var(--pad) * -1); border-radius: inherit; z-index: -1;
    background: linear-gradient(180deg, rgba(0,0,0,.5) 0%, rgba(0,0,0,.04) 26%, rgba(0,0,0,.5) 52%, rgba(0,0,0,.78) 78%, rgba(0,0,0,.92) 100%); }
  .over { color: #fff; }
  .src { display: flex; align-items: center; gap: 5px; min-width: 0; font-size: .8em; color: var(--muted); }
  .over .src { color: rgba(255,255,255,.72); }
  .dev { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .app { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mid { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; gap: 12px; }
  .cover { height: min(46cqh, 42cqw); aspect-ratio: 1; object-fit: cover; border-radius: 12px; flex: none;
    box-shadow: 0 8px 22px rgba(0,0,0,.45); }
  .text { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; justify-content: flex-end; }
  .title { font-size: min(1.3em, 8cqw); font-weight: 600; line-height: 1.15; letter-spacing: -.01em;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-shadow: 0 1px 8px rgba(0,0,0,.35); }
  .title.muted { font-weight: 500; opacity: .85; }
  .artist { font-size: .85em; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .over .artist { color: rgba(255,255,255,.75); }
  .prog { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
  .track { flex: 1; height: 4px; border-radius: 2px; background: rgba(127,127,127,.35); overflow: hidden; }
  .over .track { background: rgba(255,255,255,.28); }
  .done { height: 100%; border-radius: 2px; background: var(--accent); transition: width 1s linear; }
  .times { font-size: .7em; color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .over .times { color: rgba(255,255,255,.7); }
  .controls { display: flex; align-items: center; justify-content: center; gap: 6px; }
  button { background: none; border: 0; color: inherit; padding: 7px; border-radius: 50%; display: grid; place-items: center; }
  button:active { background: rgba(127,127,127,.25); }
  .over .controls button:not(.play) { background: rgba(255,255,255,.16); }
  .over .controls button:not(.play):active { background: rgba(255,255,255,.3); }
  .play { width: min(52px, 17cqh); height: min(52px, 17cqh); background: rgba(255,255,255,.94); color: #111;
    box-shadow: 0 4px 14px rgba(0,0,0,.35); }
  .play:active { background: #fff; }
  .gap { width: 2.4em; }
  .small .play { width: min(40px, 20cqh); height: min(40px, 20cqh); }
  .small .gap, .small .controls button:not(.play) { display: none; }
  .small .src { display: none; }
  .landscape .mid { align-items: center; }
  .landscape .title { font-size: min(1.2em, 4.6cqw); }
</style>
