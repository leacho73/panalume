<script module>
  import { states } from '../lib/ha.svelte.js';

  export const meta = {
    type: 'media-server', name: 'Media server', icon: 'mdi:play-box-multiple', category: 'Media',
    size: { w: 480, h: 300 }, tap: 'none',
    defaults: { title: 'Emby', sessions: '', movies: '', series: '', episodes: '', recent: 4, url: '', api_key: '' },
    sections: [{ key: 'counts', label: 'Library counts' }, { key: 'recent', label: 'Recently added' }],
    // Any sensor that lists what is playing in a `sessions` attribute — Emby's
    // activity sensor, or a template sensor in front of one.
    autofill: () => {
      const ids = [...states.keys()];
      const pick = (re) => ids.find((id) => re.test(id)) || '';
      return {
        sessions: ids.find((id) => Array.isArray(states.get(id)?.attributes?.sessions)) || '',
        movies: pick(/^sensor\.emby_movies$/i),
        series: pick(/^sensor\.emby_series$/i),
        episodes: pick(/^sensor\.emby_episodes$/i),
      };
    },
    fields: [
      { key: 'title', label: 'Title (blank = hidden)', type: 'text' },
      { key: 'sessions', label: 'Activity sensor', type: 'entity', domain: 'sensor', hint: 'A sensor whose `sessions` attribute lists what is playing: user, title, subtitle, state, progress, duration, offset, player and bandwidth.' },
      { key: 'movies', label: 'Films count (sensor)', type: 'entity', domain: 'sensor' },
      { key: 'series', label: 'Series count (sensor)', type: 'entity', domain: 'sensor' },
      { key: 'episodes', label: 'Episodes count (sensor)', type: 'entity', domain: 'sensor' },
      { key: 'recent', label: 'Recently added rows (0 = off)', type: 'number', hint: 'Needs the server URL and API key below. Nothing is fetched while either is blank.' },
      { key: 'url', label: 'Emby server URL', type: 'text', placeholder: 'https://emby.example.lan:8920', hint: 'The address the browser can reach, with its API port. The server must allow this page\'s origin (Emby allows every origin by default).' },
      { key: 'api_key', label: 'Emby API key', type: 'text', hint: 'Created in the Emby dashboard under API keys. It is stored in the dashboard settings like any other field, so anyone who can edit this dashboard can read it — use a key made for this panel.' },
    ],
  };
</script>

<script>
  // The house's media server at a glance: who is watching what right now, how
  // large the library is, and — only if a server URL and API key are set —
  // what was added recently. The streaming half comes from Home Assistant's own
  // sensor, so a card with the two network fields blank never touches the wire.
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  let { props, h = 300 } = $props();
  const show = (k) => !props.hide?.[k];

  const pad = (n) => String(Number(n) || 0).padStart(2, '0');
  const num = (v) => Number(v) || 0;

  const e = $derived(ent(props.sessions));
  const sessions = $derived((Array.isArray(e?.attributes?.sessions) ? e.attributes.sessions : []).map((s) => ({
    user: s.user || s.friendly_name || 'Someone',
    title: s.title || 'Unknown',
    subtitle: s.subtitle || (s.media_type === 'episode' ? '' : String(s.year || '')),
    media_type: s.media_type || 'movie',
    state: s.state || 'playing',
    progress: Math.max(0, Math.min(100, num(s.progress))),
    duration: num(s.duration),
    offset: num(s.offset),
    player: s.player || s.product || '',
    bandwidth: num(s.bandwidth),
  })));

  const mbit = $derived(sessions.reduce((a, s) => a + s.bandwidth, 0) / 1e6);
  const waiting = $derived(!props.sessions || !e || e.state === 'unavailable');

  const count = (id) => {
    const st = ent(id);
    const n = Number(st?.state);
    return st && st.state !== 'unavailable' && st.state !== 'unknown' && Number.isFinite(n) ? n.toLocaleString() : '';
  };
  const counts = $derived([
    { n: count(props.movies), label: 'films' },
    { n: count(props.series), label: 'series' },
    { n: count(props.episodes), label: 'episodes' },
  ].filter((c) => c.n));

  // ---- recently added (opt-in, network only when both fields are set) ----
  let recent = $state([]);
  let recentErr = $state('');
  const url = $derived(props.url ? String(t(props.url) || '').trim() : '');
  const key = $derived(props.api_key ? String(t(props.api_key) || '').trim() : '');
  const want = $derived(Math.max(0, Math.min(20, Number(props.recent) || 0)));

  function ago(iso) {
    const at = Date.parse(iso);
    if (!Number.isFinite(at)) return '';
    const days = Math.floor((Date.now() - at) / 864e5);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return days + ' days ago';
    const months = Math.round(days / 30);
    return months < 18 ? months + (months === 1 ? ' month ago' : ' months ago') : Math.round(days / 365) + ' years ago';
  }

  function normRecent(it) {
    const ep = it.Type === 'Episode';
    const title = ep ? (it.SeriesName || it.Name || 'Untitled') : (it.Name || 'Untitled');
    const sub = ep ? 'S' + pad(it.ParentIndexNumber) + 'E' + pad(it.IndexNumber) : (it.ProductionYear ? String(it.ProductionYear) : '');
    const kind = { Movie: 'Film', Episode: 'Episode', Series: 'Series', Audio: 'Album', MusicAlbum: 'Album', BoxSet: 'Collection' }[it.Type] || it.Type || '';
    return { title, sub, kind, added: ago(it.DateCreated) };
  }

  $effect(() => {
    // Depends on the settings alone, so blank fields mean no request is ever
    // made — the card simply does not draw the section.
    const base = url.replace(/\/+$/, '');
    const k = key;
    const n = want;
    if (!base || !k || !n) {
      recent = [];
      recentErr = '';
      return;
    }
    let live = true;
    const load = async () => {
      const q = '?Limit=' + n + '&Fields=' + encodeURIComponent('ProductionYear,DateCreated,Type,SeriesName,IndexNumber,ParentIndexNumber') + '&api_key=' + encodeURIComponent(k);
      try {
        const r = await fetch(base + '/Users/Me/Items/Latest' + q, { cache: 'no-store' });
        if (!r.ok) throw new Error('Emby answered ' + r.status);
        const j = await r.json();
        if (!live) return;
        recent = (Array.isArray(j) ? j : j?.Items || []).slice(0, n).map(normRecent);
        recentErr = '';
      } catch (err) {
        if (!live) return;
        recent = [];
        recentErr = /failed to fetch|networkerror|load failed/i.test(String(err?.message || err)) ? 'Can’t reach the Emby server' : String(err?.message || err);
      }
    };
    load();
    const iv = setInterval(load, 15 * 60e3);
    return () => {
      live = false;
      clearInterval(iv);
    };
  });

  // ---- fitting the card --------------------------------------------------
  // Rows have one fixed height and the lists are measured, so the slice follows
  // the cell instead of an estimate of the header.
  const ROW = 46;
  const ROW_GAP = 6;
  const RROW = 18;
  const RROW_GAP = 2;
  let cardH = $state(h);
  let headH = $state(20);
  let footH = $state(0);
  let rheadH = $state(0);
  let listH = $state(0);

  const fits = (room, row, gap) => Math.max(0, Math.floor((room + gap) / (row + gap)));
  const tight = $derived(cardH < 210);
  const recentOn = $derived(show('recent') && want > 0 && !!url && !!key);

  // Space the streaming block needs before recently added may use the rest.
  const streamNeed = $derived(sessions.length ? Math.min(sessions.length, 3) * (ROW + ROW_GAP) - ROW_GAP : 26);
  const spare = $derived(Math.max(0, cardH - headH - footH - rheadH - 16 - streamNeed));
  const wanted = $derived(recentOn ? Math.min(want, recent.length) : 0);
  const room = $derived(fits(spare, RROW, RROW_GAP));
  // Reserve one line for "+N more" when the card cannot hold every item.
  const recentRows = $derived(wanted > room ? Math.max(0, room - 1) : wanted);
  const recentMore = $derived(wanted - recentRows);
  const recentH = $derived(recentRows ? recentRows * (RROW + RROW_GAP) - RROW_GAP + (recentMore ? 16 + RROW_GAP : 0) : 0);
  const streamRows = $derived(fits(listH, ROW, ROW_GAP));
  const shown = $derived(streamRows ? sessions.slice(0, streamRows) : []);
  const more = $derived(Math.max(0, sessions.length - shown.length));

  const pct = (s) => s.progress;
  const left = (s) => {
    if (!s.duration) return '';
    const m = Math.max(0, Math.round((s.duration - s.offset) / 60));
    return m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min left' : m + ' min left';
  };
  const icon = (s) => (s.media_type === 'track' ? 'mdi:music' : s.media_type === 'episode' ? 'mdi:television-classic' : 'mdi:movie-open');
</script>

<div class="ms" class:tight bind:clientHeight={cardH}>
  {#if props.title && !tight}
    <div class="head">
      <span class="ttl">{t(props.title)}</span>
      {#if sessions.length}<span class="count">{sessions.length}</span>{/if}
      {#if mbit >= 0.05 && !tight}<span class="bw"><Icon icon="mdi:swap-horizontal" size="0.95em" />{mbit.toFixed(1)} Mbit/s</span>{/if}
    </div>
  {/if}

  {#if waiting}
    <div class="none"><Icon icon="mdi:server-off" size="1.6em" /><div>Pick the media server’s activity sensor.</div></div>
  {:else if !sessions.length}
    <div class="none"><Icon icon="mdi:television-off" size="1.6em" /><div>Nothing playing</div></div>
  {:else}
    <div class="rows" class:roomy={!more && shown.length * (ROW + ROW_GAP) < listH - 16} bind:clientHeight={listH}>
      {#each shown as s, i (i + s.user + s.title)}
        <div class="row" class:paused={s.state === 'paused'}>
          <div class="ic"><Icon icon={icon(s)} size="1.2em" /></div>
          <div class="main">
            <div class="l1">
              <span class="t">{s.title}</span>
              <span class="u">{s.user}</span>
            </div>
            <div class="l2">
              <span class="dev">{s.state === 'paused' ? 'Paused' : 'Playing'}{s.subtitle ? ' · ' + s.subtitle : ''}{#if s.player && !tight}<span class="pd"> · </span><span class="pl">{s.player}</span>{/if}</span>
              <span class="pc">{s.progress}%{#if s.duration && !tight}<span class="pleft">{left(s)}</span>{/if}</span>
            </div>
            <div class="bar"><div class="fill" style="width:{pct(s)}%"></div></div>
          </div>
        </div>
      {/each}
      {#if more}<div class="tail">and {more} more</div>{/if}
    </div>
  {/if}

  {#if recentOn && (recentRows || recentErr)}
    <div class="rsec">
      <div class="rhead" bind:clientHeight={rheadH}>
        <span>Recently added</span>
        {#if recentErr}<span class="err">{recentErr}</span>{/if}
      </div>
      <div class="rrows" style="height:{recentH}px">
        {#each recent.slice(0, recentRows) as r, i (i + r.title)}
          <div class="rrow">
            <span class="rt">{r.title}</span>
            <span class="rm">{[r.sub, r.kind, r.added].filter(Boolean).join(' · ')}</span>
          </div>
        {/each}
        {#if recentMore}<div class="rtail">+{recentMore} more</div>{/if}
      </div>
    </div>
  {/if}

  {#if show('counts') && counts.length && !tight}
    <div class="foot" bind:clientHeight={footH}>
      {#each counts as c (c.label)}<span class="cf">{c.n} {c.label}</span>{/each}
    </div>
  {/if}
</div>

<style>
  .ms { height: 100%; display: flex; flex-direction: column; gap: 6px; min-height: 0; overflow: hidden; container-type: size; }
  .head { display: flex; align-items: center; gap: 8px; flex: none; font-weight: 600; font-size: 1.02em; }
  .ttl { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .count { flex: none; background: rgba(255, 255, 255, 0.1); color: var(--muted); border-radius: 8px; padding: 0 7px; font-size: 0.78em; font-weight: 600; }
  .bw { margin-left: auto; flex: none; display: inline-flex; align-items: center; gap: 4px; color: var(--muted); font-size: 0.8em; font-weight: 500; }

  .rows { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; overflow: hidden; }
  .rows.roomy { justify-content: center; }
  .row { flex: none; display: flex; gap: 10px; align-items: center; height: 46px; min-width: 0; }
  .ic { flex: none; width: 2.1em; height: 2.1em; border-radius: 50%; display: grid; place-items: center; background: rgba(255, 255, 255, 0.08); color: var(--accent); }
  .paused .ic { color: var(--muted); }
  .main { flex: 1; min-width: 0; }
  .l1 { display: flex; align-items: baseline; gap: 8px; }
  .t { flex: 1; min-width: 0; font-weight: 600; font-size: 1em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .u { flex: none; color: var(--muted); font-size: 0.8em; white-space: nowrap; }
  .l2 { display: flex; align-items: baseline; gap: 8px; margin-top: 1px; color: var(--muted); font-size: 0.78em; }
  .dev { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pc { flex: none; display: inline-flex; gap: 5px; align-items: baseline; white-space: nowrap; }
  .bar { height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.12); margin-top: 5px; overflow: hidden; }
  .fill { height: 100%; background: var(--accent); border-radius: 2px; transition: width 0.4s; }
  .paused .fill { background: var(--muted); }
  .tail { flex: none; color: var(--muted); font-size: 0.76em; }

  .rsec { flex: none; display: flex; flex-direction: column; gap: 5px; padding-top: 4px; border-top: 1px solid rgba(255, 255, 255, 0.08); }
  .rhead { display: flex; align-items: baseline; gap: 8px; flex: none; color: var(--muted); font-size: 0.76em; text-transform: uppercase; letter-spacing: 0.06em; }
  .err { margin-left: auto; color: #ffc861; text-transform: none; letter-spacing: 0; }
  .rrows { display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
  .rrow { flex: none; display: flex; align-items: baseline; gap: 8px; height: 18px; }
  .rt { flex: 1; min-width: 0; font-size: 0.82em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rm { flex: none; color: var(--muted); font-size: 0.74em; white-space: nowrap; }
  .rtail { flex: none; height: 16px; color: var(--muted); font-size: 0.74em; }

  .foot { flex: none; display: flex; align-items: center; gap: 12px; color: var(--muted); font-size: 0.76em; white-space: nowrap; overflow: hidden; }
  .cf { white-space: nowrap; }
  .none { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--muted); font-size: 0.9em; text-align: center; }

  /* Narrow cards drop the least important words first: the player's name and
     the time left, never the person, the title or the percentage. */
  @container (max-width: 500px) {
    .pl, .pd { display: none; }
  }
  @container (max-width: 400px) {
    .pleft { display: none; }
  }
</style>
