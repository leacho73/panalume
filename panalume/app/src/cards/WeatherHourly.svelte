<script module>
  import { states } from '../lib/ha.svelte.js';
  export const meta = {
    type: 'weather-hourly', name: 'Weather: hourly', icon: 'mdi:clock-outline', category: 'Info',
    size: { w: 700, h: 300 }, tap: 'more-info',
    defaults: { entity: '', hours: 24, feels: false, wind: true, precip: true },
    autofill: () => {
      // Hourly forecast is feature bit 2.
      const ids = [...states.keys()].filter((id) => id.startsWith('weather.'));
      const hourly = ids.find((id) => (Number(states.get(id)?.attributes?.supported_features || 0) & 2)) || ids[0] || '';
      return hourly ? { entity: hourly } : {};
    },
    sections: [{ key: 'icon', label: 'Conditions' }, { key: 'feels', label: 'Feels like' },
      { key: 'precip', label: 'Chance of precipitation' }, { key: 'wind', label: 'Wind' }],
    fields: [
      { key: 'entity', label: 'Weather', type: 'entity', domain: 'weather' },
      { key: 'name', label: 'Title', type: 'text' },
      { key: 'hours', label: 'Hours to show', type: 'number', hint: 'The forecast itself is whatever the weather service offers, up to 48 hours on OpenWeatherMap. Columns that do not fit are dropped, not squeezed.' },
    ],
  };
</script>

<script>
  // One column per hour: the time, the sky, the temperature, and whatever else the service
  // publishes for that hour. A column that will not fit disappears rather than wrapping.
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { stateWord } from '../lib/i18n.svelte.js';
  import { subscribe } from '../lib/ha.svelte.js';
  import { WX } from './Weather.svelte';

  let { props, w, h } = $props();
  const show = (k) => !props.hide?.[k];
  const e = $derived(ent(props.entity));
  const a = $derived(e?.attributes || {});
  let forecast = $state([]);
  $effect(() => {
    const id = e?.entity_id;
    if (!id) return;
    return subscribe({ type: 'weather/subscribe_forecast', entity_id: id, forecast_type: 'hourly' }, (ev) => (forecast = ev.forecast || []));
  });

  // Column width is set in em and the card measures itself, so a narrow card shows fewer
  // hours instead of unreadable ones.
  // A column carrying "feels like" needs about 4.5em; without it, 3em is comfortable.
  const COL = $derived(show('feels') ? 4.5 : 3.05);
  let cols = $derived(Math.max(1, Math.floor((Number(w) || 700) / (COL * 16))));
  const items = $derived(forecast.slice(0, Math.min(Number(props.hours) || 24, cols)));

  const time = (f) => new Date(f.datetime).toLocaleTimeString([], { hour: 'numeric', hour12: false }).replace(':00', '') + 'h';
  const tall = $derived((Number(h) || 300) > 240);
</script>

<div class="wrap">
  {#if props.name}<div class="title">{t(props.name)}</div>{/if}
  {#if items.length}
    <div class="row">
      {#each items as f}
        <div class="col" title={`${new Date(f.datetime).toLocaleString()} · ${stateWord('weather', null, f.condition) || f.condition}`}>
          <div class="t">{time(f)}</div>
          {#if show('icon')}<Icon icon={WX[f.condition] || 'mdi:weather-cloudy'} size="1.5em" />{/if}
          <div class="temp">{f.temperature == null ? '—' : Math.round(f.temperature) + '°'}</div>
          {#if show('feels') && f.apparent_temperature != null}
            <div class="small">{t('feels')} {Math.round(f.apparent_temperature)}°</div>
          {/if}
          {#if show('precip') && f.precipitation_probability != null}
            <div class="small pop {Number(f.precipitation_probability) >= 50 ? 'wet' : ''}">
              <Icon icon="mdi:water" size=".85em" />{Math.round(f.precipitation_probability)}%
            </div>
          {/if}
          {#if show('wind') && f.wind_speed != null && tall}
            <div class="small wind">
              {#if f.wind_bearing != null}
                <span class="dir" style="transform:rotate({Number(f.wind_bearing)}deg)"><Icon icon="mdi:navigation" size=".85em" /></span>
              {/if}
              {Math.round(f.wind_speed)}{cols <= 7 ? ' ' + (a.wind_speed_unit || '') : ''}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <div class="wait">{e ? t('This weather service has no hourly forecast') : t('Pick a weather entity')}</div>
  {/if}
</div>

<style>
  .wrap { height: 100%; display: flex; flex-direction: column; gap: .45em; min-height: 0; }
  .title { font-size: .8em; font-weight: 600; color: var(--muted); letter-spacing: .02em; text-transform: uppercase; }
  .row { flex: 1; min-height: 0; display: flex; gap: .15em; overflow: hidden; }
  .col { flex: 1 1 0; min-width: 2.6em; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: .18em; padding: .3em .1em; border-radius: .55em; background: rgba(255, 255, 255, .04); overflow: hidden; }
  .col:first-child { background: rgba(255, 255, 255, .09); }
  .t { font-size: .74em; color: var(--muted); font-variant-numeric: tabular-nums; }
  .temp { font-size: 1em; font-weight: 600; font-variant-numeric: tabular-nums; }
  .small { font-size: .68em; color: var(--muted); display: flex; align-items: center; gap: .12em; white-space: nowrap; }
  .pop.wet { color: #74c0fc; }
  .wind { font-variant-numeric: tabular-nums; }
  .dir { display: inline-flex; transform-origin: 50% 50%; }
  .wait { margin: auto; color: var(--muted); font-size: .9em; text-align: center; }
</style>
