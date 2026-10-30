
<script module>
  export const meta = {
    type: 'map',
    name: 'Map',
    icon: 'mdi:map-marker-radius',
    category: 'Info',
    size: { w: 480, h: 320 },
    tap: 'none',

    defaults: {
      entities: [],
      zoom: 13,
      auto_fit: true,
      show_names: true,
      show_status: true,
      theme: 'app',
      tile_url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      tile_attribution: '© OpenStreetMap contributors',
    },

    fields: [
      {
        key: 'entities',
        label: 'People and devices',
        type: 'entities',
        domain: ['person', 'device_tracker'],
      },
      {
        key: 'label',
        label: 'Name (template; entity_id is each person)',
        type: 'text',
      },
      {
        key: 'status',
        label: 'Status (template; entity_id is each person)',
        type: 'text',
      },
      { key: 'zoom', label: 'Default zoom', type: 'number' },
      { key: 'auto_fit', label: 'Automatically fit markers', type: 'bool' },
      { key: 'show_names', label: 'Show names', type: 'bool' },
      { key: 'show_status', label: 'Show status', type: 'bool' },
      {
        key: 'theme',
        label: 'Map theme',
        type: 'select',
        options: [
          { value: 'app', label: 'Application default' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
          { value: 'dark-muted', label: 'Dark muted' },
          { value: 'muted', label: 'Muted' },
          { value: 'grayscale', label: 'Grayscale' },
        ],
      },
      { key: 'tile_url', label: 'Map tile URL', type: 'text', hint: 'The map pictures load from the internet (OpenStreetMap by default), so the map server sees which area you are looking at.' },
      { key: 'tile_attribution', label: 'Map tile attribution', type: 'text' },
    ],

    watch: () => ['zone.home'],
  };
</script>

<script>
  import { onMount } from 'svelte';
  import 'leaflet/dist/leaflet.css';

  import { states, haImage } from '../lib/ha.svelte.js';
  import { app } from '../lib/config.svelte.js';
  import { stateText } from '../lib/entity.js';
  import { t } from '../lib/tpl.js';

  let { props } = $props();

  let mapEl;
  let leaflet;
  let map;
  let tileLayer;
  let homeCircle;
  let resizeObserver;

  let mapReady = $state(false);
  let mapError = $state(false);

  const markers = new Map();

  let fittedEntityKey = '';
  let centeredOnHome = false;

  // --------------------------------------------------
  // ENTITY DATA
  // --------------------------------------------------

  const entities = $derived.by(() =>
    (props.entities || []).map((id) => {
      const e = states.get(id);
      const a = e?.attributes || {};

      const rawLat = a.latitude;
      const rawLon = a.longitude;

      const lat =
        rawLat == null || rawLat === ''
          ? NaN
          : Number(rawLat);

      const lon =
        rawLon == null || rawLon === ''
          ? NaN
          : Number(rawLon);

      const state = e?.state ?? 'unknown';

      const home = state === 'home';
      const away = state === 'not_home';

      const zone =
        !home &&
        !away &&
        !['unknown', 'unavailable'].includes(state);

      const customLabel = props.label
        ? t(props.label, { entity_id: id })
        : '';

      const customStatus = props.status
        ? t(props.status, { entity_id: id })
        : '';

      return {
        id,
        lat,
        lon,

        hasLocation:
          Number.isFinite(lat) &&
          lat >= -90 &&
          lat <= 90 &&
          Number.isFinite(lon) &&
          lon >= -180 &&
          lon <= 180,

        name: customLabel || a.friendly_name || id,

        status: customStatus || stateText(e),

        picture: a.entity_picture
          ? haImage(a.entity_picture)
          : '',

        home,
        away,
        zone,
      };
    })
  );

  // People in the same place (everyone at home, or within a few metres) sit side by
  // side rather than on top of each other, with one label for the group.
  const spot = (e) => (e.home ? 'home' : `${e.lat.toFixed(4)},${e.lon.toFixed(4)}`);
  const located = $derived.by(() => {
    const list = entities.filter((e) => e.hasLocation);
    const groups = new Map();
    for (const e of list) {
      if (!groups.has(spot(e))) groups.set(spot(e), []);
      groups.get(spot(e)).push(e);
    }
    return list.map((e) => {
      const g = groups.get(spot(e));
      const i = g.indexOf(e);
      return { ...e, dx: Math.round((i - (g.length - 1) / 2) * 40), lead: i === 0, group: g.length > 1 ? g.map((x) => x.name).join(', ') : '' };
    });
  });

  const withoutLocation = $derived(
    entities.filter((e) => !e.hasLocation)
  );

  const homeCount = $derived(
    entities.filter((e) => e.home).length
  );

  const awayCount = $derived(
    entities.filter((e) => e.away).length
  );

  const zoneCount = $derived(
    entities.filter((e) => e.zone).length
  );

  const homeZone = $derived(
    states.get('zone.home')
  );

  // --------------------------------------------------
  // MARKER ICONS
  // --------------------------------------------------

  function makeMarkerIcon(item) {
    const root = document.createElement('div');

    root.className =
      `pnl-map-avatar${item.home ? ' is-home' : ''}${item.zone ? ' is-zone' : ''}`;

    const face = document.createElement('div');
    face.className = 'pnl-map-avatar-face';

    if (item.picture) {
      const img = document.createElement('img');

      img.src = item.picture;
      img.alt = '';
      img.draggable = false;

      face.appendChild(img);
    } else {
      face.textContent =
        String(item.name || '?')
          .trim()
          .charAt(0)
          .toUpperCase() || '?';
    }

    root.appendChild(face);

    return leaflet.divIcon({
      html: root,
      className: 'pnl-map-div-icon',
      iconSize: [48, 48],
      iconAnchor: [24 - (item.dx || 0), 24],
    });
  }

  // --------------------------------------------------
  // MARKER TOOLTIP
  // --------------------------------------------------

  function makeTooltip(item) {
    const label = document.createElement('span');

    label.className = 'pnl-map-tooltip-content';

    const showName = props.show_names !== false;
    const showStatus = props.show_status !== false;

    label.textContent =
      showName && showStatus
        ? `${item.group || item.name} · ${item.status}`
        : showName
          ? item.group || item.name
          : showStatus
            ? item.status
            : '';

    return label;
  }

  // --------------------------------------------------
  // MAP INITIALISATION
  // --------------------------------------------------

  onMount(() => {
    let cancelled = false;

    (async () => {
      try {
        const module = await import('leaflet');

        if (cancelled) return;

        leaflet = module.default;

        // Start with a world view.
        // The entity effect below will position the map
        // once Home Assistant locations are available.

        map = leaflet.map(mapEl, {
          zoomControl: false,
          scrollWheelZoom: false,
          doubleClickZoom: true,
          attributionControl: true,
        }).setView([20, 0], 2);

        leaflet.control.zoom({ position: 'topright' }).addTo(map);

        leaflet.DomEvent.disableClickPropagation(mapEl);
        leaflet.DomEvent.disableScrollPropagation(mapEl);

        const tileUrl =
          t(props.tile_url) ||
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

        const attribution =
          t(props.tile_attribution) ||
          '© OpenStreetMap contributors';

        tileLayer = leaflet.tileLayer(tileUrl, {
          maxZoom: 19,
          attribution,
        }).addTo(map);

        resizeObserver = new ResizeObserver(() => {
          map?.invalidateSize({ pan: false });
        });

        resizeObserver.observe(mapEl);

        mapReady = true;

        requestAnimationFrame(() => {
          map?.invalidateSize({ pan: false });
        });

      } catch (err) {
        console.error(
          'Panalume map failed to initialise',
          err
        );

        mapError = true;
      }
    })();

    return () => {
      cancelled = true;

      resizeObserver?.disconnect();

      map?.remove();

      map = null;
      tileLayer = null;
      homeCircle = null;

      markers.clear();

      mapReady = false;
    };
  });

  // --------------------------------------------------
  // MAP UPDATES
  // --------------------------------------------------

  // Update Leaflet markers in place.
  // No additional Home Assistant websocket subscription.

  $effect(() => {
    const items = located;
    const ready = mapReady;

    const tileUrl =
      t(props.tile_url) ||
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

    const attribution =
      t(props.tile_attribution) ||
      '© OpenStreetMap contributors';

    const zone = homeZone;

    if (!ready || !map || !leaflet) return;

    // Update tile provider if configuration changes.

    if (tileLayer && tileLayer._url !== tileUrl) {
      map.removeLayer(tileLayer);

      tileLayer = leaflet.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution,
      }).addTo(map);
    }

    const activeIds = new Set();

    for (const item of items) {
      activeIds.add(item.id);

      let marker = markers.get(item.id);

      if (!marker) {
        marker = leaflet.marker(
          [item.lat, item.lon],
          {
            icon: makeMarkerIcon(item),
            keyboard: true,
            title: item.name,
          }
        ).addTo(map);

        marker.on('click', () => {
          app.popup = { entity: item.id };
        });

        markers.set(item.id, marker);

      } else {
        marker.setLatLng([item.lat, item.lon]);

        marker.setIcon(makeMarkerIcon(item));

        marker.options.title = item.name;
      }

      // Name and status labels.

      if (
        (props.show_names !== false ||
        props.show_status !== false) && item.lead
      ) {
        if (marker.getTooltip()) {
          marker.setTooltipContent(makeTooltip(item));
        } else {
          marker.bindTooltip(makeTooltip(item), {
            permanent: true,
            direction: 'bottom',
            offset: [0, 22],
            opacity: 1,
            className: 'pnl-map-label',
          });
        }

      } else if (marker.getTooltip()) {
        marker.unbindTooltip();
      }
    }

    // Remove markers for entities no longer selected
    // or entities that no longer have GPS coordinates.

    for (const [id, marker] of markers) {
      if (!activeIds.has(id)) {
        map.removeLayer(marker);
        markers.delete(id);
      }
    }

    // Draw Home Assistant's home-zone radius.

    const zoneLat = zone?.attributes?.latitude;
    const zoneLon = zone?.attributes?.longitude;

    if (
      zoneLat != null &&
      zoneLon != null &&
      Number.isFinite(Number(zoneLat)) &&
      Number.isFinite(Number(zoneLon))
    ) {
      const centre = [
        Number(zoneLat),
        Number(zoneLon),
      ];

      const radius = Math.max(
        1,
        Number(zone.attributes.radius) || 100
      );

      if (homeCircle) {
        homeCircle
          .setLatLng(centre)
          .setRadius(radius);

      } else {
        homeCircle = leaflet.circle(centre, {
          radius,
          color: '#65a8ff',
          weight: 1.5,
          opacity: 0.75,
          fillColor: '#65a8ff',
          fillOpacity: 0.08,
          interactive: false,
        }).addTo(map);
      }

      if (!items.length && !centeredOnHome) {
        map.setView(
          centre,
          Math.max(3, Number(props.zoom) || 13)
        );

        centeredOnHome = true;
      }

    } else if (homeCircle) {
      map.removeLayer(homeCircle);
      homeCircle = null;
    }

    // Only automatically fit when the selected set changes.
    // This prevents GPS updates from constantly moving the map.

    const entityKey = items
      .map((item) => item.id)
      .sort()
      .join('|');

    if (
      props.auto_fit !== false &&
      entityKey &&
      entityKey !== fittedEntityKey
    ) {
      const bounds = leaflet.latLngBounds(
        items.map((item) => [
          item.lat,
          item.lon,
        ])
      );

      map.fitBounds(bounds, {
        padding: [48, 48],
        maxZoom: Math.max(
          3,
          Number(props.zoom) || 13
        ),
      });

      fittedEntityKey = entityKey;
      centeredOnHome = true;

    } else if (props.auto_fit === false) {
      fittedEntityKey = '';
    }

    if (!entityKey) {
      fittedEntityKey = '';
    }
  });
</script>

<div
  class="map-wrap theme-{props.theme || 'app'}"
  data-stop
  bind:this={mapEl}
>
  {#if mapError}
    <div class="map-message">
      Map couldn't be loaded. Check the map tile URL and network access.
    </div>
  {:else if !mapReady}
    <div class="map-message">
      Loading map…
    </div>
  {/if}

  {#if mapReady}
    <div class="map-summary">
      <span class="summary-total">
        {located.length} located
      </span>

      {#if homeCount}
        <span class="summary-home">
          {homeCount} home
        </span>
      {/if}

      {#if awayCount}
        <span>
          {awayCount} away
        </span>
      {/if}

      {#if zoneCount}
        <span class="summary-zone">
          {zoneCount} elsewhere
        </span>
      {/if}
    </div>

    {#if withoutLocation.length}
      <div
        class="map-unlocated"
        title={withoutLocation.map((e) => e.name).join(', ')}
      >
        {withoutLocation.length} without GPS
      </div>
    {/if}
  {/if}
</div>

<style>
  .map-wrap {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 160px;
    overflow: hidden;
    border-radius: inherit;
    background: #111824;
  }

  .map-message {
    position: absolute;
    inset: 0;
    z-index: 500;
    display: grid;
    place-items: center;
    padding: 20px;
    color: rgba(255,255,255,.72);
    font-size: .85em;
    text-align: center;
    pointer-events: none;
  }

  .map-summary {
    position: absolute;
    z-index: 500;
    top: 10px;
    left: 10px;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
    max-width: calc(100% - 20px);
    padding: 6px 9px;
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 10px;
    background: rgba(13,18,28,.82);
    color: rgba(255,255,255,.78);
    box-shadow: 0 2px 12px rgba(0,0,0,.2);
    backdrop-filter: blur(10px);
    font-size: 11px;
    line-height: 1.2;
    pointer-events: none;
  }

  .map-summary span + span::before {
    content: '·';
    margin-right: 5px;
    color: rgba(255,255,255,.35);
  }

  .summary-total {
    color: #fff;
    font-weight: 650;
  }

  .summary-home {
    color: #70e0a0;
  }

  .summary-zone {
    color: #8fc0ff;
  }

  .map-unlocated {
    position: absolute;
    z-index: 500;
    right: 10px;
    bottom: 10px;
    max-width: calc(100% - 20px);
    padding: 5px 8px;
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 8px;
    background: rgba(13,18,28,.82);
    color: rgba(255,255,255,.72);
    font-size: 10px;
    backdrop-filter: blur(10px);
    pointer-events: none;
  }

  :global(.leaflet-container) {
    width: 100%;
    height: 100%;
    background: #111824;
    color: #18202b;
    font: inherit;
  }

  /* --------------------------------------------------
     MAP THEMES

     Filters apply only to OSM map tiles.
     Markers, labels and controls are unaffected.
  -------------------------------------------------- */

  :global(.map-wrap.theme-app .leaflet-tile-pane) {
    filter: none;
  }

  :global(.map-wrap.theme-light .leaflet-tile-pane) {
    filter:
      brightness(1.12)
      saturate(0.65)
      contrast(0.92);
  }

  :global(.map-wrap.theme-dark .leaflet-tile-pane) {
    filter:
      invert(1)
      hue-rotate(180deg)
      brightness(0.85)
      contrast(0.9);
  }

  :global(.map-wrap.theme-muted .leaflet-tile-pane) {
    filter:
      saturate(0.55)
      brightness(1.04)
      contrast(0.9);
  }

  :global(.map-wrap.theme-grayscale .leaflet-tile-pane) {
    filter:
      grayscale(1)
      contrast(1.05);
  }

  :global(.map-wrap.theme-dark-muted .leaflet-tile-pane) {
    filter: invert(1) hue-rotate(180deg) saturate(0.45) brightness(0.72) contrast(0.9);
  }

  /* --------------------------------------------------
     PERSON / DEVICE MARKERS
  -------------------------------------------------- */

  :global(.pnl-map-div-icon) {
    background: transparent;
    border: 0;
  }

  :global(.pnl-map-avatar) {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border: 3px solid rgba(255,255,255,.72);
    border-radius: 50%;
    background: rgba(100,110,125,.85);
    box-shadow: 0 2px 10px rgba(0,0,0,.45);
    filter: grayscale(1);
    opacity: .78;
    transition:
      border-color .2s,
      opacity .2s,
      filter .2s;
  }

  :global(.pnl-map-avatar.is-home) {
    border-color: #5bd88f;
    filter: none;
    opacity: 1;
  }

  :global(.pnl-map-avatar.is-zone) {
    border-color: #72b4ff;
    filter: none;
    opacity: 1;
  }

  :global(.pnl-map-avatar-face) {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: 50%;
    color: #fff;
    font-size: 17px;
    font-weight: 700;
    line-height: 1;
  }

  :global(.pnl-map-avatar-face img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* --------------------------------------------------
     TOOLTIPS
  -------------------------------------------------- */

  /* Hide the hairline gaps some screens show between map tiles. */
  .map-wrap :global(img.leaflet-tile) {
    outline: 1px solid transparent;
  }

  :global(.leaflet-tooltip.pnl-map-label) {
    padding: 4px 7px;
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 7px;
    background: rgba(13,18,28,.9);
    color: #fff;
    box-shadow: 0 2px 8px rgba(0,0,0,.3);
    font-family: inherit;
    font-size: 10px;
    font-weight: 600;
    line-height: 1.25;
    white-space: nowrap;
  }

  :global(.leaflet-tooltip.pnl-map-label::before) {
    display: none;
  }

  /* --------------------------------------------------
     MAP CONTROLS
  -------------------------------------------------- */

  :global(.leaflet-control-attribution) {
    background: rgba(13,18,28,.65) !important;
    color: rgba(255,255,255,.65) !important;
    font-size: 9px !important;
  }

  :global(.leaflet-control-attribution a) {
    color: #a9caff !important;
  }

  :global(.leaflet-bar a) {
    background: rgba(20,27,39,.9) !important;
    color: #fff !important;
    border-color: rgba(255,255,255,.12) !important;
  }
</style>
