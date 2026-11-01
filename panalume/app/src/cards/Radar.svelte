<script module>
  export const meta = {
    type: 'radar', name: 'Weather radar', icon: 'mdi:radar', category: 'Info',
    size: { w: 420, h: 300 }, tap: 'none',
    defaults: { source: 'tiles', image: '', zoom: 6, base: 'satellite', network: false, marker: true, color: '2', smooth: true, snow: true, credit: true },
    sections: [{ key: 'label', label: 'Title' }, { key: 'base', label: 'Base map' }, { key: 'time', label: 'Time' }, { key: 'marker', label: 'Home marker' }, { key: 'credit', label: 'Map credits' }],
    watch: () => ['zone.home'],
    fields: [
      { key: 'name', label: 'Title', type: 'text' },
      { key: 'source', label: 'Radar', type: 'select', options: [{ value: 'tiles', label: 'Tiles from RainViewer' }, { value: 'image', label: 'A radar image from a camera' }], hint: 'A camera that already carries the map and the loop — Environment Canada publishes one per weather station, with a nowcast up to 72 minutes ahead, at any radius. The settings below apply to the RainViewer choice only.' },
      { key: 'image', label: 'Radar camera', type: 'entity', domain: 'camera', hint: 'For example camera.beaverlodge_radar from the Environment Canada integration. The card draws what the camera publishes; nothing is fetched from outside Home Assistant and no key is needed.' },
      { key: 'network', label: 'Load radar tiles from RainViewer (this card stays empty until it is ticked)', type: 'bool', hint: 'Tiles and the frame list come from api.rainviewer.com. Nothing is fetched while this is off.' },
      { key: 'zoom', label: 'Zoom (5 = province, 7 = closest RainViewer allows)', type: 'number', hint: 'The public tile endpoint answers up to 7; anything higher returns its “zoom not supported” image, so the card holds at 7.' },
      { key: 'base', label: 'Base map under the radar', type: 'select', section: 'base', options: [{ value: 'satellite', label: 'Satellite (aerial)' }, { value: 'streets', label: 'Streets' }, { value: 'off', label: 'None (plain grid)' }], hint: 'Aerial tiles come from Esri World Imagery, streets from OpenStreetMap. Both load only while the network switch above is on.' },
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
  import { states, haImage } from '../lib/ha.svelte.js';
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
  // The frame pads the card, so the drawn box is smaller than the w/h props: measure it.
  let mw = $state(0);
  let mh = $state(0);
  const box = $derived({ w: mw || w, h: mh || h });
  const on = $derived(!!props.network);
  // Image mode: a camera that publishes the map and the radar loop already composed.
  // Its picture URL carries an access token that is only valid while the entity lives,
  // so read it from the entity and re-request when the image updates.
  const imgMode = $derived(props.source === 'image');
  const cam = $derived(props.image ? states.get(String(props.image)) : undefined);
  const shot = $derived.by(() => {
    const pic = cam?.attributes?.entity_picture;
    if (!pic) return '';
    const url = haImage(pic);
    const v = cam?.last_updated || '';
    return v ? `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(v)}` : url;
  });
  const shotAt = $derived(cam?.last_updated ? new Date(cam.last_updated).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');

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

  // The tile slots the card needs for its own pixel box, shared by both layers so the
  // base map and the radar line up to the tile.
  const slots = $derived.by(() => {
    if (!c || !box.w || !box.h) return [];
    const n = 2 ** z;
    const out = [];
    for (let x = Math.floor(c.x - box.w / 2 / TILE); x < c.x + box.w / 2 / TILE; x++) {
      for (let y = Math.floor(c.y - box.h / 2 / TILE); y < c.y + box.h / 2 / TILE; y++) {
        if (y < 0 || y >= n) continue;
        out.push({ x, y, tx: ((x % n) + n) % n, left: (x - c.x) * TILE + box.w / 2, top: (y - c.y) * TILE + box.h / 2 });
      }
    }
    return out;
  });

  // The ground under the weather: Esri's aerial imagery, OpenStreetMap's streets, or the
  // plain grid. Radar PNGs are transparent, so without this the card is clouds on nothing.
  const baseKind = $derived(['satellite', 'streets', 'off'].includes(String(props.base)) ? String(props.base) : 'satellite');
  const baseLayer = $derived.by(() => {
    if (baseKind === 'off' || !on) return [];
    const url = (x, y) =>
      baseKind === 'satellite'
        ? `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
        : `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    return slots.map((s) => ({ key: `${baseKind}/${z}/${s.tx}/${s.y}`, src: url(s.tx, s.y), left: s.left, top: s.top }));
  });

  const layer = $derived.by(() => {
    if (!map || !frame || !on) return [];
    const color = String(props.color || '2');
    const smooth = props.smooth === false ? 0 : 1;
    const snow = props.snow === false ? 0 : 1;
    return slots.map((s) => ({
      key: `${frame.path}/${z}/${s.x}/${s.y}`,
      src: `${map.host}${frame.path}/256/${z}/${s.tx}/${s.y}/${color}/${smooth}_${snow}.png`,
      left: s.left,
      top: s.top,
    }));
  });
  const stamp = $derived(frame ? new Date(frame.time * 1000) : null);
  const hhmm = $derived(stamp ? stamp.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');
</script>

<div class="radar" bind:clientWidth={mw} bind:clientHeight={mh}>
  {#if imgMode}
    {#if shot}
      <img class="shot" src={shot} alt="" />
      {#if show('time') && shotAt}
        <div class="when"><Icon icon="mdi:clock-outline" size=".9em" />{shotAt}</div>
      {/if}
      {#if props.credit !== false}
        <div class="credit pill"><a href="https://weather.gc.ca/" target="_blank" rel="noreferrer">Environment Canada</a></div>
      {/if}
    {:else}
      <div class="off">
        <Icon icon="mdi:camera-off-outline" size="1.7em" />
        <span>Pick a radar camera</span>
        <small>Choose a camera that publishes a radar image, such as the Environment Canada radar for your station.</small>
      </div>
    {/if}
  {:else if !on}
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
    {#if baseLayer.length}
      <div class="base">
        {#each baseLayer as b (b.key)}
          <img src={b.src} alt="" loading="lazy" decoding="async" style="left:{b.left}px;top:{b.top}px" />
        {/each}
      </div>
    {/if}
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
      <div class="credit">
        {#if baseKind === 'satellite'}
          <a href="https://www.esri.com/en-us/arcgis/products/arcgis-living-atlas/mapping" target="_blank" rel="noreferrer">Esri, Maxar</a><span>·</span>
        {:else if baseKind === 'streets'}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a><span>·</span>
        {/if}
        <a href="https://www.rainviewer.com/api.html" target="_blank" rel="noreferrer">RainViewer</a>
      </div>
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
  .base { position: absolute; inset: 0; }
  .base img { position: absolute; width: 256px; height: 256px; filter: saturate(.95) brightness(.95) contrast(1.03); }
  /* A wash over the aerial so the radar colours and the white marker still read on a bright photo. */
  .base::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(8,12,20,.24), rgba(8,12,20,0) 42%, rgba(8,12,20,.34)); }
  /* contain, not cover: the radar image carries its own labels and legend, and cropping a
     map cuts place names in half. A square card fits it exactly. */
  .shot { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #0b1220; }
  .pill { background: rgba(8,12,20,.62); padding: 2px 7px; border-radius: 7px; backdrop-filter: blur(4px); }
  .tiles { position: absolute; inset: 0; }
  .tiles img { position: absolute; width: 256px; height: 256px; opacity: .92; mix-blend-mode: screen; }
  /* The dot sits on the centre pixel; the label hangs off it so it cannot drag the mark off-centre. */
  .home { position: absolute; left: 50%; top: 50%; width: 9px; height: 9px; transform: translate(-50%, -50%); pointer-events: none; }
  .dot { display: block; width: 9px; height: 9px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 3px rgba(122,162,255,.85), 0 0 0 7px rgba(122,162,255,.25); }
  .lbl { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); white-space: nowrap; font-size: .72em; font-weight: 600; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.9); }
  .when { position: absolute; left: 10px; top: 8px; display: flex; align-items: center; gap: 4px; font-size: .72em; color: rgba(255,255,255,.75); background: rgba(8,12,20,.55); padding: 3px 7px; border-radius: 8px; backdrop-filter: blur(4px); }
  .credit { position: absolute; right: 8px; bottom: 6px; display: flex; align-items: center; gap: 4px; font-size: .62em; color: rgba(255,255,255,.5); letter-spacing: .02em; text-shadow: 0 1px 2px rgba(0,0,0,.8); }
  .credit a { color: inherit; text-decoration: none; }
  .credit a:hover { color: rgba(255,255,255,.85); }
  .off { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center; padding: 14px; color: var(--muted); }
  .off span { font-weight: 600; color: var(--text); }
  .off small { font-size: .76em; line-height: 1.35; max-width: 30ch; }
</style>
