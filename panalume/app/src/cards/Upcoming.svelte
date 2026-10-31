<script module>
  import { states } from '../lib/ha.svelte.js';

  export const meta = {
    type: 'upcoming', name: 'Upcoming media', icon: 'mdi:movie-open-star', category: 'Media',
    size: { w: 520, h: 360 }, tap: 'none',
    defaults: { title: '', entities: [], layout: 'list', days: 30, max: 6, show_source: true, show_rating: true, release: true },
    // Sensors from the Upcoming Media integration: their items live in the data attribute.
    autofill: () => ({
      entities: [...states.keys()]
        .filter((id) => Array.isArray(states.get(id)?.attributes?.data) && /upcoming/.test(id))
        .sort()
        .slice(0, 2),
    }),
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'entities', label: 'Upcoming media sensors', type: 'entities', domain: 'sensor', hint: 'From the Upcoming Media integration: Sonarr, Radarr, Lidarr or Readarr. Add several to mix film and TV in one card.' },
      { key: 'layout', label: 'Layout', type: 'select', options: [{ value: 'list', label: 'List' }, { value: 'posters', label: 'Posters (pictures load from the internet, e.g. TMDB)' }] },
      { key: 'days', label: 'Days ahead', type: 'number' },
      { key: 'max', label: 'Most items shown', type: 'number' },
      { key: 'show_source', label: 'Where it comes from (Sonarr / Radarr)', type: 'bool' },
      { key: 'show_rating', label: 'Rating', type: 'bool' },
      { key: 'release', label: 'How it is released (in cinemas, online, on disc)', type: 'bool', hint: 'Uses the release text the integration publishes: “Available Online”, “In Cinemas”, or the air day and time.' },
    ],
  };
</script>

<script>
  // Upcoming films and episodes from the Upcoming Media integration, as posters
  // or a list. The sensors already carry the artwork, dates and links, so the
  // card only reads their data attribute; tapping an item opens it in Sonarr,
  // Radarr or whichever app the sensor came from.
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/tpl.js';
  import { haImage } from '../lib/ha.svelte.js';
  let { props, w = 520, h = 360 } = $props();

  const SOURCES = {
    sonarr: { name: 'Sonarr', color: '#35c5f0' },
    radarr: { name: 'Radarr', color: '#ffc230' },
    lidarr: { name: 'Lidarr', color: '#4fd1a5' },
    readarr: { name: 'Readarr', color: '#e8a33d' },
  };
  const ids = $derived((props.entities || []).map((id) => String(t(id) || '').trim()).filter(Boolean));
  const layout = $derived(props.layout === 'list' ? 'list' : 'posters');
  const tight = $derived(h < 230);

  function source(id, e) {
    const key = Object.keys(SOURCES).find((k) => id.toLowerCase().includes(k));
    if (key) return SOURCES[key];
    const friend = String(e?.attributes?.friendly_name || '').replace(/\bupcoming\b.*$/i, '').trim();
    return { name: friend || 'Upcoming', color: 'var(--accent)' };
  }

  // Films are listed at midnight UTC, so their day is the UTC day; episodes
  // carry a real time, and that one is local.
  function when(iso, dateOnly) {
    if (!iso) return null;
    if (dateOnly) {
      const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
      const x = new Date(y, m - 1, d);
      return isNaN(x) ? null : x;
    }
    const x = new Date(iso);
    return isNaN(x) ? null : x;
  }

  const items = $derived.by(() => {
    const out = [];
    for (const id of ids) {
      const e = states.get(id);
      const data = e?.attributes?.data;
      if (!Array.isArray(data)) continue;
      const src = source(id, e);
      for (const raw of data) {
        if (!raw || typeof raw !== 'object' || raw.title_default) continue;
        const title = String(raw.title || '').trim();
        if (!title) continue;
        const dateOnly = !raw.number;
        out.push({
          key: `${id}|${title}|${raw.airdate || ''}`,
          title,
          episode: String(raw.episode || ''),
          number: String(raw.number || ''),
          date: when(raw.airdate, dateOnly),
          release: String(raw.release || ''),
          poster: String(raw.poster || ''),
          rating: String(raw.rating || ''),
          runtime: Number(raw.runtime) || 0,
          genres: String(raw.genres || ''),
          summary: String(raw.summary || ''),
          link: String(raw.deep_link || ''),
          src,
        });
      }
    }
    const days = Math.min(365, Math.max(1, Number(props.days) || 30));
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const to = new Date(from); to.setDate(to.getDate() + days);
    out.sort((a, b) => (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity) || a.title.localeCompare(b.title));
    return out.filter((it) => !it.date || (it.date >= from && it.date < to)).slice(0, Math.max(1, Number(props.max) || 6));
  });
  const configured = $derived(ids.length > 0);

  const midnight = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  function dayLabel(d) {
    if (!d) return '';
    const today = midnight(new Date());
    const diff = Math.round((midnight(d) - today) / 864e5);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  const timeLabel = (d) => (d && (d.getHours() || d.getMinutes()) ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '');
  const whenLabel = (it) => [dayLabel(it.date), timeLabel(it.date)].filter(Boolean).join(' · ');
  // The integration publishes the release line as a template: "$day, $date" for
  // a film's release, "$day, $time" for an episode. Fill it in from the air date,
  // so the card says how it arrives as well as when.
  function releaseLine(it) {
    if (!it.release || !it.date) return '';
    // How it arrives is the words around the placeholders: a film's "Available
    // Online $day, $date" says something the date does not, an episode's plain
    // "$day, $time" says nothing, and that keeps the day-and-time label.
    if (!String(it.release).replace(/\$(day|date|time)\b/g, '').replace(/[^A-Za-z]/g, '')) return '';
    const day = it.date.toLocaleDateString(undefined, { weekday: 'short' });
    const date = it.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    const time = timeLabel(it.date);
    return String(it.release)
      .replace(/\$day\b/g, day)
      .replace(/\$date\b/g, date)
      .replace(/\$time\b/g, time)
      .replace(/\s+/g, ' ')
      .trim();
  }
  const dateLine = (it) => (props.release !== false ? releaseLine(it) || whenLabel(it) : whenLabel(it));
  const subLabel = (it) => [it.number, it.episode].filter(Boolean).join(' · ');
  const extraLabel = (it) =>
    [it.runtime ? `${it.runtime} min` : '', it.genres.split(',')[0], props.show_rating !== false ? it.rating : '']
      .filter(Boolean)
      .join(' · ');
  const tip = (it) => [it.title, it.number, it.episode, it.summary].filter(Boolean).join('\n');
</script>

<div class="up" class:tight>
  {#if props.title}<div class="head">{t(props.title)}</div>{/if}

  {#if !configured}
    <div class="none">
      <Icon icon="mdi:movie-open-off-outline" size="2em" />
      <div>Pick your Sonarr or Radarr upcoming media sensors.</div>
    </div>
  {:else if !items.length}
    <div class="none">
      <Icon icon="mdi:movie-open-check-outline" size="2em" />
      <div>Nothing coming up.</div>
    </div>
  {:else}
    <div class="grid {layout}">
      {#each items as it (it.key)}
        <a class="it" href={it.link || undefined} target={it.link ? '_blank' : undefined} rel="noopener"
           title={tip(it)} style="--src:{it.src.color}" aria-label={[it.title, whenLabel(it)].filter(Boolean).join(', ')}>
          <div class="art">
            <!-- Pictures from outside Home Assistant (e.g. TMDB) only with the Posters layout, which says so. -->
            {#if it.poster && (layout === 'posters' || it.poster.startsWith('/'))}
              <img src={haImage(it.poster)} alt="" loading="lazy" />
            {:else}
              <div class="blank"><Icon icon="mdi:movie-open-outline" size="1.6em" /></div>
            {/if}
            {#if props.show_source !== false}<span class="src">{it.src.name}</span>{/if}
            {#if props.show_rating !== false && it.rating}<span class="rate">{it.rating}</span>{/if}
          </div>
          <div class="txt">
            <div class="t">{it.title}</div>
            {#if subLabel(it)}<div class="s">{subLabel(it)}</div>{/if}
            {#if layout === 'list' || !tight}
              <div class="d">{dateLine(it)}{#if layout === 'list' && extraLabel(it)} · {extraLabel(it)}{/if}</div>
            {/if}
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>

<style>
  .up { height: 100%; display: flex; flex-direction: column; gap: 10px; min-height: 0; }
  .head { font-weight: 600; font-size: 1.1em; }
  .none { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--muted); text-align: center; font-size: .92em; }

  .grid { flex: 1; min-height: 0; display: grid; gap: 10px; overflow: hidden; }
  .grid.posters { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); grid-auto-rows: minmax(0, 1fr); }
  .grid.list { grid-template-columns: 1fr; grid-auto-rows: min-content; align-content: start; overflow: auto; }

  .it { min-width: 0; min-height: 0; display: flex; border-radius: 14px; overflow: hidden; color: inherit; text-decoration: none; -webkit-tap-highlight-color: transparent; }
  .it:active { opacity: .82; }

  /* Posters: artwork fills the tile, words sit on a scrim at the bottom. */
  .posters .it { position: relative; flex-direction: column; justify-content: flex-end; background: rgba(255,255,255,.05); }
  .posters .art { position: absolute; inset: 0; }
  .posters .art img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .posters .blank { width: 100%; height: 100%; display: grid; place-items: center; color: var(--muted); }
  .posters .txt { position: relative; padding: 26px 9px 8px; background: linear-gradient(180deg, transparent, rgba(6,8,14,.55) 34%, rgba(6,8,14,.92)); }
  .posters .t { font-weight: 600; font-size: .92em; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-shadow: 0 1px 2px rgba(0,0,0,.55); }
  .posters .s, .posters .d { color: rgba(255,255,255,.8); font-size: .78em; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* The release line ("Available Online Tue, Nov 17") is longer than a date, so
     in a poster tile it wraps to a second line instead of losing the point. */
  .posters .d { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .posters .d { opacity: .8; }

  /* List: a small poster on the left, one row per item. */
  .list .it { align-items: center; gap: 11px; padding: 6px; }
  .list .it:active { background: rgba(255,255,255,.06); }
  .list .art { position: relative; flex: none; width: 44px; height: 64px; border-radius: 9px; overflow: hidden; background: rgba(255,255,255,.06); }
  .list .art img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .list .blank { width: 100%; height: 100%; display: grid; place-items: center; color: var(--muted); }
  .list .txt { min-width: 0; flex: 1; }
  .list .t { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .list .s { color: var(--muted); font-size: .86em; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .list .d { color: var(--muted); font-size: .82em; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .src, .rate { position: absolute; top: 6px; font-size: .7em; font-weight: 600; padding: 2px 6px; border-radius: 7px; line-height: 1.5; }
  .src { left: 6px; background: var(--src); color: #071018; }
  .rate { right: 6px; background: rgba(6,8,14,.62); color: #fff; font-weight: 500; }
  .list .src, .list .rate { display: none; }
  .tight .none { font-size: .85em; }
</style>
