<script module>
  import { states } from '../lib/ha.svelte.js';

  export const meta = {
    type: 'media-activity', name: 'Media activity', icon: 'mdi:play-circle-outline', category: 'Media',
    size: { w: 480, h: 220 }, tap: 'none',
    defaults: { title: 'Watching now', entities: [], entity: '', poster: 'art', show_progress: true, show_quality: true },
    // Any sensor that carries the sessions in a `sessions` attribute (Tautulli via REST, or a template sensor built on it).
    autofill: () => ({
      entities: [...states.keys()].filter((id) => Array.isArray(states.get(id)?.attributes?.sessions)).sort().slice(0, 4),
    }),
    fields: [
      { key: 'entities', label: 'Sensors', type: 'entities', domain: 'sensor', hint: 'One or more sensors whose `sessions` attribute lists what is playing — Tautulli\'s `get_activity` answer (raw or trimmed) from each server. Streams seen by more than one sensor are shown once. The poster is whatever image URL a row carries; a server that reports a bare path needs a template sensor in Home Assistant to complete it, not a key in this card.' },
      { key: 'title', label: 'Title (blank = hidden)', type: 'text' },
      { key: 'show_progress', label: 'Progress and time left', type: 'bool' },
      { key: 'show_quality', label: 'Direct play / transcode and resolution', type: 'bool' },
      { key: 'poster', label: 'Poster', type: 'select', options: [{ value: 'art', label: 'Poster beside each row' }, { value: 'none', label: 'Icon only' }] },
    ],
  };
</script>

<script>
  // What is playing right now, one row per stream: who, what, how far in, and
  // whether the server is transcoding. Reads a sensor's `sessions` attribute, so
  // it works with Tautulli's own session objects and with a trimmed template
  // sensor in front of them.
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { haImage } from '../lib/ha.svelte.js';
  let { props, h = 220 } = $props();

  const pad = (n) => String(Number(n) || 0).padStart(2, '0');
  const num = (v) => (Number(v) || 0);

  // Tautulli's raw session shape, or an already-trimmed row (which carries
  // `progress` and `duration` in seconds).
  function norm(s) {
    const mt = s.media_type || 'movie';
    if (s.progress != null && s.progress_percent == null) {
      return { ...s, poster: s.poster || s.grandparent_thumb || s.parent_thumb || s.thumb || '', progress: num(s.progress), duration: num(s.duration), offset: num(s.offset) };
    }
    const title = mt === 'episode' ? (s.grandparent_title || s.title) : s.title;
    let sub = '';
    if (mt === 'episode') sub = `S${pad(s.parent_media_index)}E${pad(s.media_index)}` + (s.title ? ` · ${s.title}` : '');
    else if (mt === 'track') sub = [s.grandparent_title, s.parent_title].filter(Boolean).join(' · ');
    else sub = s.year ? String(s.year) : '';
    return {
      user: s.friendly_name || s.user || 'Someone',
      title: title || 'Unknown',
      subtitle: sub,
      media_type: mt,
      state: s.state || 'playing',
      progress: num(s.progress_percent),
      duration: Math.round(num(s.duration) / 1000),
      offset: Math.round(num(s.view_offset) / 1000),
      poster: s.poster || s.grandparent_thumb || s.parent_thumb || s.thumb || '',
      player: s.player || '',
      product: s.product || '',
      platform: s.platform || '',
      decision: s.transcode_decision || 'direct play',
      resolution: s.stream_video_resolution || s.video_full_resolution || '',
      bandwidth: num(s.bandwidth),
    };
  }

  // One sensor or several: two Plex servers, Tautulli and the Plex integration side by side.
  const ids = $derived(
    [...(Array.isArray(props.entities) ? props.entities : []), props.entity]
      .map((v) => String(t(v) || '').trim())
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
  );
  const sessions = $derived.by(() => {
    const seen = new Set();
    const out = [];
    for (const id of ids) {
      const e = ent(id);
      if (!e || e.state === 'unavailable') continue;
      for (const s of Array.isArray(e.attributes?.sessions) ? e.attributes.sessions : []) {
        const row = norm(s);
        // The same stream reaching the card from two sensors is one row.
        const key = `${row.title}|${row.subtitle}|${row.user}|${row.player}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(row);
      }
    }
    return out;
  });
  const waiting = $derived(!ids.length);
  const icon = (s) => (s.media_type === 'track' ? 'mdi:music' : s.media_type === 'episode' ? 'mdi:television-classic' : 'mdi:movie-open');
  // The picture the row carries, or none. The sensor publishes a URL the browser can fetch:
  // HA serves it under /api, or an integration may give a full URL. A bare server path is not
  // resolvable here, and the card does not ask for a token to make one - no keys in settings.
  const art = (path) => {
    const p = String(path || '').trim();
    if (!p || props.poster === 'none') return '';
    return p.startsWith('http') || p.startsWith('/api/') ? haImage(p) : '';
  };
  const pct = (s) => Math.max(0, Math.min(100, s.progress));
  const left = (s) => {
    const m = Math.max(0, Math.round((s.duration - s.offset) / 60));
    if (!s.duration) return '';
    return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min left` : `${m} min left`;
  };
  const quality = (s) => {
    if (s.decision === 'transcode') return { label: 'Transcode', tone: 'warn' };
    if (s.decision === 'copy' || s.decision === 'direct stream') return { label: 'Direct stream', tone: 'ok' };
    return { label: 'Direct play', tone: 'good' };
  };
  const tight = $derived(h < 190);
</script>

<div class="act">
  {#if props.title && !tight}
    <div class="head">
      <span>{t(props.title)}</span>
      {#if sessions.length}<span class="count">{sessions.length}</span>{/if}
    </div>
  {/if}

  {#if waiting}
    <div class="none"><Icon icon="mdi:television-off" size="1.8em" /><div>Pick a sensor with a sessions attribute.</div></div>
  {:else if !sessions.length}
    <div class="none"><Icon icon="mdi:television-off" size="1.8em" /><div>Nothing playing.</div></div>
  {:else}
    <div class="rows" class:single={sessions.length === 1}>
      {#each sessions as s, i (i + s.user + s.title)}
        <div class="row" class:paused={s.state === 'paused'}>
          {#if art(s.poster)}
            <img class="art" src={art(s.poster)} alt="" loading="lazy" decoding="async" />
          {:else}
            <div class="ic"><Icon icon={icon(s)} size="1.35em" /></div>
          {/if}
          <div class="main">
            <div class="line">
              <span class="t">{s.title}</span>
              <span class="u">{s.user}</span>
            </div>
            {#if s.subtitle && !tight}<div class="s">{s.subtitle}</div>{/if}
            {#if props.show_progress !== false}
              <div class="bar"><div class="fill" style="width:{pct(s)}%"></div></div>
              <div class="foot">
                <span>
                  {#if s.state === 'paused'}<Icon icon="mdi:pause" size="0.9em" /> Paused
                  {:else}{left(s)}{#if s.duration}{' · ' + pct(s) + '%'}{/if}{/if}
                </span>
                {#if props.show_quality !== false}
                  <span class="q {quality(s).tone}">{quality(s).label}{#if s.resolution && !tight}{' · ' + s.resolution}{/if}</span>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .act { height: 100%; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
  .head { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 1.05em; }
  .count { background: rgba(255,255,255,.1); color: var(--muted); border-radius: 8px; padding: 0 7px; font-size: .8em; font-weight: 600; }
  .rows { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; overflow: auto; }
  .rows.single { justify-content: center; }
  .single .ic { width: 3.1em; height: 3.1em; }
  .single .t { font-size: 1.15em; }
  .row { display: flex; gap: 12px; align-items: center; min-width: 0; }
  .row + .row { border-top: 1px solid rgba(255,255,255,.08); padding-top: 10px; }
  .ic { flex: none; width: 2.4em; height: 2.4em; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.08); color: var(--accent); }
  .art { flex: none; width: 2.4em; height: 3.5em; object-fit: cover; border-radius: 6px; background: rgba(255,255,255,.06); }
  .single .art { width: 3.4em; height: 5em; }
  .paused .ic { color: var(--muted); }
  .main { flex: 1; min-width: 0; }
  .line { display: flex; align-items: baseline; gap: 8px; }
  .t { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .u { margin-left: auto; color: var(--muted); font-size: .82em; white-space: nowrap; }
  .s { color: var(--muted); font-size: .86em; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar { height: 4px; border-radius: 2px; background: rgba(255,255,255,.12); margin-top: 7px; overflow: hidden; }
  .fill { height: 100%; background: var(--accent); border-radius: 2px; transition: width .4s; }
  .paused .fill { background: var(--muted); }
  .foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 4px; color: var(--muted); font-size: .78em; }
  .foot span { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .q.ok { color: #7ec8ff; }
  .q.good { color: #6fdc9b; }
  .q.warn { color: #ffc861; }
  .none { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--muted); font-size: .9em; text-align: center; }
</style>
