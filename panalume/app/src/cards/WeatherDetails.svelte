<script module>
  import { states } from '../lib/ha.svelte.js';
  export const meta = {
    type: 'weather-details', name: 'Weather details', icon: 'mdi:weather-windy-variant', category: 'Info',
    size: { w: 460, h: 260 }, tap: 'more-info',
    defaults: { entity: '', extra: '', columns: 3 },
    autofill: () => {
      // The entity that carries the most of what this card shows.
      const ids = [...states.keys()].filter((id) => id.startsWith('weather.'));
      const score = (id) => Object.keys(states.get(id)?.attributes || {}).length;
      const best = ids.sort((a, b) => score(b) - score(a))[0] || '';
      return best ? { entity: best } : {};
    },
    sections: [{ key: 'feels', label: 'Feels like' }, { key: 'dew', label: 'Dew point' },
      { key: 'humidity', label: 'Humidity' }, { key: 'pressure', label: 'Pressure' },
      { key: 'wind', label: 'Wind' }, { key: 'gust', label: 'Gusts' },
      { key: 'visibility', label: 'Visibility' }, { key: 'clouds', label: 'Cloud cover' },
      { key: 'uv', label: 'UV index' }, { key: 'rain', label: 'Rain today' },
      { key: 'extra', label: 'Extra sensor' }],
    fields: [
      { key: 'entity', label: 'Weather', type: 'entity', domain: 'weather' },
      { key: 'name', label: 'Title', type: 'text' },
      { key: 'columns', label: 'Tiles across (0 = as many as fit)', type: 'number' },
      { key: 'extra', label: 'Extra sensor', type: 'entity', domain: 'sensor', hint: 'One more tile, anywhere: air quality, pollen, a rain gauge. Uses its own name, unit and icon. Blank hides it.' },
    ],
  };
</script>

<script>
  // Current conditions as tiles: everything the weather entity carries, in the units it
  // reports. Nothing is fetched beyond the entity itself, and today's rain comes from the
  // daily forecast, so the card works the same on OpenWeatherMap, Met.no or a local station.
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { name as entName } from '../lib/entity.js';
  import { subscribe } from '../lib/ha.svelte.js';

  let { props } = $props();
  const show = (k) => !props.hide?.[k];
  const e = $derived(ent(props.entity));
  const a = $derived(e?.attributes || {});

  const round = (v, d = 0) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    const m = 10 ** d;
    return Math.round(n * m) / m;
  };
  const deg = (v) => {
    const n = round(v);
    return n == null ? null : `${n}°`;
  };
  const nm = (v, unit) => {
    const n = round(v, 1);
    return n == null ? null : `${n}${unit ? ' ' + unit : ''}`;
  };
  const CARD = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const cardinal = (b) => (b == null ? '' : CARD[Math.round(((Number(b) % 360) + 360) % 360 / 22.5) % 16]);

  let daily = $state([]);
  $effect(() => {
    const id = e?.entity_id;
    if (!id || props.hide?.rain) return;
    return subscribe({ type: 'weather/subscribe_forecast', entity_id: id, forecast_type: 'daily' }, (ev) => (daily = ev.forecast || []));
  });
  const today = $derived.by(() => {
    const d = new Date().toDateString();
    return daily.find((f) => new Date(f.datetime).toDateString() === d) || daily[0] || null;
  });

  const tunit = $derived(a.temperature_unit || '°');
  const wunit = $derived(a.wind_speed_unit || '');
  const tiles = $derived.by(() => {
    const out = [];
    const push = (key, icon, label, value, tone = '', bearing = null) => {
      if (value != null && value !== '' && show(key)) out.push({ key, icon, label, value, tone, bearing });
    };
    push('feels', 'mdi:thermometer-lines', t('Feels like'), deg(a.apparent_temperature));
    push('dew', 'mdi:water-thermometer', t('Dew point'), deg(a.dew_point));
    push('humidity', 'mdi:water-percent', t('Humidity'), a.humidity == null ? null : `${Math.round(a.humidity)}%`);
    push('pressure', 'mdi:gauge', t('Pressure'), nm(a.pressure, a.pressure_unit));
    const bearing = a.wind_bearing == null ? null : Number(a.wind_bearing);
    push('wind', 'mdi:weather-windy', t('Wind'), a.wind_speed == null ? null : `${Math.round(a.wind_speed)} ${wunit}`.trim(), '', bearing);
    push('gust', 'mdi:weather-windy-variant', t('Gusts'), a.wind_gust_speed == null ? null : `${Math.round(a.wind_gust_speed)} ${(a.wind_gust_speed_unit || wunit)}`.trim());
    push('visibility', 'mdi:eye-outline', t('Visibility'), nm(a.visibility, a.visibility_unit));
    push('clouds', 'mdi:cloud-outline', t('Cloud cover'), a.cloud_coverage == null ? null : `${Math.round(a.cloud_coverage)}%`);
    const uv = round(a.uv_index, 1);
    push('uv', 'mdi:white-balance-sunny', t('UV index'), uv == null ? null : String(uv), uv >= 8 ? 'high' : uv >= 6 ? 'mid' : '');
    if (today) {
      const p = today.precipitation;
      const pop = today.precipitation_probability;
      const val = p != null ? nm(p, today.precipitation_unit || a.precipitation_unit) : pop != null ? `${Math.round(pop)}%` : null;
      push('rain', 'mdi:weather-pouring', t('Rain today'), val);
    }
    const x = ent(props.extra);
    if (x && show('extra')) {
      const v = x.state === 'unknown' || x.state === 'unavailable' ? null : `${x.state}${x.attributes?.unit_of_measurement ? ' ' + x.attributes.unit_of_measurement : ''}`;
      push('extra', x.attributes?.icon || 'mdi:information-outline', entName(x) || '', v);
    }
    return out;
  });

  // A tile needs roughly 7em; below that three across squeezes the value into the label.
  let cols = $derived(Number(props.columns) > 0 ? Number(props.columns) : null);
</script>

<div class="wrap">
  {#if props.name}<div class="title">{t(props.name)}</div>{/if}
  {#if tiles.length}
    <div class="grid" style:--cols={cols || `repeat(auto-fit, minmax(6.4em, 1fr))`}>
      {#each tiles as tile (tile.key)}
        <div class="tile {tile.tone || ''}">
          <div class="ico">
            {#if tile.bearing != null && tile.key === 'wind'}
              <span class="dir" style="transform:rotate({Number(tile.bearing)}deg)"><Icon icon="mdi:navigation" size="1em" /></span>
            {:else}
              <Icon icon={tile.icon} size="1em" />
            {/if}
            <span class="lbl">{tile.label}</span>
          </div>
          <div class="val">{tile.value}</div>
          {#if tile.key === 'wind' && tile.bearing != null}<div class="sub">{cardinal(tile.bearing)}</div>{/if}
        </div>
      {/each}
    </div>
  {:else}
    <div class="wait">{e ? t('No current conditions on this entity') : t('Pick a weather entity')}</div>
  {/if}
</div>

<style>
  .wrap { height: 100%; display: flex; flex-direction: column; gap: .5em; min-height: 0; }
  .title { font-size: .82em; font-weight: 600; color: var(--muted); letter-spacing: .02em; text-transform: uppercase; }
  .grid { flex: 1; min-height: 0; display: grid; gap: .45em; grid-template-columns: var(--cols); align-content: start; overflow: hidden; }
  .tile { background: rgba(255, 255, 255, .05); border-radius: .7em; padding: .42em .6em; display: flex; flex-direction: column; gap: .12em; min-width: 0; }
  .ico { display: flex; align-items: center; gap: .32em; color: var(--muted); font-size: .74em; min-width: 0; }
  .ico .lbl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dir { display: inline-flex; transform-origin: 50% 50%; }
  .val { font-size: 1.06em; font-weight: 600; line-height: 1.15; font-variant-numeric: tabular-nums; }
  .sub { font-size: .7em; color: var(--muted); }
  .mid .val { color: #f0b429; }
  .high .val { color: #e8590c; }
  .wait { margin: auto; color: var(--muted); font-size: .9em; text-align: center; }
</style>
