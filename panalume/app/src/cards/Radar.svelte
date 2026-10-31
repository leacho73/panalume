<script module>
  export const meta = {
    type: 'radar', name: 'Weather radar', icon: 'mdi:radar', category: 'Info',
    size: { w: 420, h: 300 }, tap: 'none',
    defaults: { zoom: 6, network: false, marker: true, color: '2', smooth: true, snow: true, credit: true },
    sections: [{ key: 'label', label: 'Title' }, { key: 'time', label: 'Time' }, { key: 'marker', label: 'Home marker' }, { key: 'credit', label: 'RainViewer credit' }],
    watch: () => ['zone.home'],
    fields: [
      { key: 'name', label: 'Title', type: 'text' },
      { key: 'network', label: 'Load radar tiles from RainViewer (this card stays empty until it is ticked)', type: 'bool', hint: 'Tiles and the frame list come from api.rainviewer.com. Nothing is fetched while this is off.' },
      { key: 'zoom', label: 'Zoom (5 = province, 7 = closest RainViewer allows)', type: 'number', hint: 'The public tile endpoint answers up to 7; anything higher returns its “zoom not supported” image, so the card holds at 7.' },
      { key: 'center', label: 'Centre: latitude, longitude (blank = home)', type: 'text', placeholder: 'e.g. 55.15, -119.13' },
      { key: 'marker', label: 'Home marker', type: 'bool', section: 'marker' },
      { key: 'label', label: 'Marker label (blank = Home)', type: 'text', section: 'marker' },
      { key: 'color', label: 'Colour scheme', type: 'select', options: [{ value: '2', label: 'Universal blue' }, { value: '4', label: 'The Weather Channel' }, { value: '6', label: 'NEXRAD' }, { value: '8', label: 'Dark Sky' }, { value: '0', label: 'Black and white' }] },
      { key: 'smooth', label: 'Smooth the radar', type: 'bool' },
      { key: 'snow', label: 'Show snow', type: 'bool' },
      { key: 'credit', label: 'RainViewer credit', type: 'bool', section: 'credit' },
    ],
  };
</script>

<script>
  // Live radar over the house, drawn from RainViewer's tiles. Nothing touches the
  // network until the setting is ticked: a dashboard in an offline house still paints.
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/tpl.js';
  import { states } from '../lib/ha.svelte.js';
  let { props, w = 420, h = 300 } = $props();
  const show = (k) => !props.hide?.[k];
  const TILE = 256;

  // One frame list for every radar card on the dashboard, refreshed with the frames.
  let cache = { at: 0, data: null, promise: null };
  function frames() {
    if (cache.data && Date.now() - cache.at < 5 * 60e3) return Promise.resolve(cache.data);
    if (!cache.promise) {
      cache.promise = fetch('https://api.rainviewer.com/public/weather-maps.json', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d) => {
          cache = { at: Date.now(), data: d, promise: null };
          return d;
        })
        .catch((e) => {
          cache = { at: 0, data: null, promise: null };
          throw e;
        });
    }
    return cache.promise;
  }

  let map = $state(null);
  let failed = $state(false);
  const on = $derived(!!props.network);

  $effect(() => {
    if (!on) {
      map = null;
      failed = false;
      return;
    }
    let alive = true;
    const load = () =>
      frames()
        .then((d) => alive && (map = d, failed = false))
        .catch(() => alive && (failed = true));
    load();
    const id = setInterval(load, 5 * 60e3);
    return () => {
      alive = false;
      clearInterval(id);
    };
  });

  const home = $derived(states.get('zone.home')?.attributes || {});
  const centre = $derived.by(() => {
    const l = String(t(props.center) ?? '').trim();
    const m = l.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (m) return { lat: Number(m[1]), lon: Number(m[2]) };
    return home.latitude != null ? { lat: home.latitude, lon: home.longitude } : null;
  });
  const z = $derived(Math.max(2, Math.min(7, Number(props.zoom) || 6)));

  // Web Mercator in tile units: whole number = a tile corner, fraction = inside it.
  function project(lat, lon) {
    const n = 2 ** z;
    const rad = (lat * Math.PI) / 180;
    return {
      x: ((lon + 180) / 360) * n,
      y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
    };
  }
  const c = $derived(centre ? project(centre.lat, centre.lon) : null);
  const frame = $derived(map?.radar?.past?.length ? map.radar.past[map.radar.past.length - 1] : null);
  const layer = $derived.by(() => {
    if (!map || !frame || !c || !w || !h) return [];
    const n = 2 ** z;
    const left = c.x - w / 2 / TILE;
    const right = c.x + w / 2 / TILE;
    const top = c.y - h / 2 / TILE;
    const bottom = c.y + h / 2 / TILE;
    const color = String(props.color || '2');
    const smooth = props.smooth === false ? 0 : 1;
    const snow = props.snow === false ? 0 : 1;
    const out = [];
    for (let x = Math.floor(left); x < right; x++) {
      for (let y = Math.floor(top); y < bottom; y++) {
        if (y < 0 || y >= n) continue;
        const tx = ((x % n) + n) % n;
        out.push({
          key: `${frame.path}/${z}/${x}/${y}`,
          src: `${map.host}${frame.path}/256/${z}/${tx}/${y}/${color}/${smooth}_${snow}.png`,
          left: (x - c.x) * TILE + w / 2,
          top: (y - c.y) * TILE + h / 2,
        });
      }
    }
    return out;
  });
  const stamp = $derived(frame ? new Date(frame.time * 1000) : null);
  const hhmm = $derived(stamp ? stamp.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');
</script>

<div class="radar">
  {#if !on}
    <div class="off">
      <Icon icon="mdi:radar" size="1.7em" />
      <span>Radar is off</span>
      <small>Turn on “Load radar tiles” in this card's settings to fetch the last frame from RainViewer.</small>
    </div>
  {:else if failed}
    <div class="off"><Icon icon="mdi:cloud-off-outline" size="1.7em" /><span>No radar reachable</span><small>RainViewer did not answer. The card will try again in five minutes.</small></div>
  {:else if !map || !centre}
    <div class="off"><Icon icon="mdi:progress-clock" size="1.7em" /><span>Loading radar…</span></div>
  {:else}
    <div class="tiles">
      {#each layer as l (l.key)}
        <img src={l.src} alt="" loading="lazy" decoding="async" style="left:{l.left}px;top:{l.top}px" />
      {/each}
    </div>
    {#if props.marker !== false}
      <div class="home"><span class="dot"></span>{#if t(props.label) || !props.center}<span class="lbl">{t(props.label) || 'Home'}</span>{/if}</div>
    {/if}
    {#if show('time') && stamp}
      <div class="when"><Icon icon="mdi:clock-outline" size=".9em" />{hhmm}</div>
    {/if}
    {#if props.credit !== false}
      <a class="credit" href="https://www.rainviewer.com/api.html" target="_blank" rel="noreferrer">RainViewer</a>
    {/if}
  {/if}
</div>

<style>
  /* A dark map-ish backdrop under the tiles: the radar is drawn on transparent PNGs. */
  .radar { position: relative; height: 100%; overflow: hidden; border-radius: 12px;
    background:
      radial-gradient(circle at 50% 50%, rgba(122,162,255,.10), transparent 62%),
      repeating-linear-gradient(0deg, rgba(255,255,255,.045) 0 1px, transparent 1px 64px),
      repeating-linear-gradient(90deg, rgba(255,255,255,.045) 0 1px, transparent 1px 64px),
      #0e1524;
    container-type: size;
  }
  .tiles { position: absolute; inset: 0; }
  .tiles img { position: absolute; width: 256px; height: 256px; opacity: .92; mix-blend-mode: screen; }
  /* The dot sits on the centre pixel; the label hangs off it so it cannot drag the mark off-centre. */
  .home { position: absolute; left: 50%; top: 50%; width: 9px; height: 9px; transform: translate(-50%, -50%); pointer-events: none; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 3px rgba(122,162,255,.85), 0 0 0 7px rgba(122,162,255,.25); }
  .lbl { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); white-space: nowrap; font-size: .72em; font-weight: 600; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.9); }
  .when { position: absolute; left: 10px; top: 8px; display: flex; align-items: center; gap: 4px; font-size: .72em; color: rgba(255,255,255,.75); background: rgba(8,12,20,.55); padding: 3px 7px; border-radius: 8px; backdrop-filter: blur(4px); }
  .credit { position: absolute; right: 8px; bottom: 6px; font-size: .62em; color: rgba(255,255,255,.45); text-decoration: none; letter-spacing: .02em; }
  .credit:hover { color: rgba(255,255,255,.8); }
  .off { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center; padding: 14px; color: var(--muted); }
  .off span { font-weight: 600; color: var(--text); }
  .off small { font-size: .76em; line-height: 1.35; max-width: 30ch; }
</style>
