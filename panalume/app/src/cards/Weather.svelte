<script module>
  export const meta = {
    type: 'weather', name: 'Weather', icon: 'mdi:weather-partly-cloudy', category: 'Info',
    size: { w: 420, h: 220 }, tap: 'more-info',
    defaults: { entity: '', forecast: 'daily', days: 5 },
    sections: [{ key: 'icon', label: 'Icon' }, { key: 'temp', label: 'Temperature' }, { key: 'cond', label: 'Condition' },
      { key: 'feels', label: 'Feels like' }, { key: 'humidity', label: 'Humidity' }, { key: 'wind', label: 'Wind' },
      { key: 'gust', label: 'Gusts' }, { key: 'uv', label: 'UV index' }, { key: 'rain', label: 'Rain today' },
      { key: 'forecast', label: 'Forecast', section: 'forecast' }, { key: 'low', label: 'Forecast lows' }],
    fields: [
      { key: 'entity', label: 'Weather', type: 'entity', domain: 'weather' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'forecast', label: 'Forecast', type: 'select', options: ['daily', 'hourly', 'none'] },
      { key: 'days', label: 'Forecast items', type: 'number' },
      { key: 'hilo', label: "Show today's high and low", type: 'bool' },
    ],
  };
  export const WX = { 'clear-night': 'mdi:weather-night', cloudy: 'mdi:weather-cloudy', exceptional: 'mdi:alert-circle-outline', fog: 'mdi:weather-fog', hail: 'mdi:weather-hail', lightning: 'mdi:weather-lightning', 'lightning-rainy': 'mdi:weather-lightning-rainy', partlycloudy: 'mdi:weather-partly-cloudy', pouring: 'mdi:weather-pouring', rainy: 'mdi:weather-rainy', snowy: 'mdi:weather-snowy', 'snowy-rainy': 'mdi:weather-snowy-rainy', sunny: 'mdi:weather-sunny', windy: 'mdi:weather-windy', 'windy-variant': 'mdi:weather-windy-variant' };
</script>

<script>
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { stateWord } from '../lib/i18n.svelte.js';
  import { subscribe } from '../lib/ha.svelte.js';
  let { props, w } = $props();
  const show = (k) => !props.hide?.[k];
  const e = $derived(ent(props.entity));
  const a = $derived(e?.attributes || {});
  let forecast = $state([]);
  $effect(() => {
    const id = e?.entity_id;
    const type = props.forecast;
    if (!id || type === 'none') return;
    return subscribe({ type: 'weather/subscribe_forecast', entity_id: id, forecast_type: type }, (ev) => (forecast = ev.forecast || []));
  });
  // The daily forecast feeds today's high and low, and today's rain, whatever
  // the card itself shows.
  let daily = $state([]);
  $effect(() => {
    const id = e?.entity_id;
    if (!id || props.forecast === 'daily') return;
    if (!props.hilo && props.hide?.rain) return;
    return subscribe({ type: 'weather/subscribe_forecast', entity_id: id, forecast_type: 'daily' }, (ev) => (daily = ev.forecast || []));
  });
  const day0 = $derived.by(() => {
    const list = props.forecast === 'daily' ? forecast : daily;
    const d = new Date().toDateString();
    return list.find((f) => new Date(f.datetime).toDateString() === d) || null;
  });
  const today = $derived(props.hilo ? day0 : null);
  const COND = { partlycloudy: 'Partly cloudy', 'clear-night': 'Clear', 'lightning-rainy': 'Thunderstorms', 'snowy-rainy': 'Sleet', 'windy-variant': 'Windy', exceptional: 'Severe weather' };
  const items = $derived(forecast.slice(0, Number(props.days) || 5));
  const label = (f) => props.forecast === 'hourly' ? new Date(f.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : new Date(f.datetime).toLocaleDateString([], { weekday: 'short' });

  // Conditions under the temperature. Only what this weather entity carries, and
  // only the rows left switched on, so the card degrades instead of showing blanks.
  const bearing = $derived(a.wind_bearing == null ? null : Number(a.wind_bearing));
  const details = $derived.by(() => {
    const out = [];
    if (a.apparent_temperature != null && show('feels')) out.push({ key: 'feels', icon: 'mdi:thermometer', text: `Feels ${Math.round(a.apparent_temperature)}°` });
    if (a.humidity != null && show('humidity')) out.push({ key: 'humidity', icon: 'mdi:water-percent', text: `${Math.round(a.humidity)}%` });
    if (a.wind_speed != null && show('wind')) out.push({ key: 'wind', icon: 'mdi:weather-windy', text: `${Math.round(a.wind_speed)} ${a.wind_speed_unit || ''}`.trim(), bearing });
    if (a.wind_gust_speed != null && show('gust')) out.push({ key: 'gust', icon: 'mdi:weather-windy-variant', text: `Gusts ${Math.round(a.wind_gust_speed)} ${a.wind_gust_speed_unit || a.wind_speed_unit || ''}`.trim() });
    if (a.uv_index != null && show('uv')) out.push({ key: 'uv', icon: 'mdi:white-balance-sunny', text: `UV ${Math.round(a.uv_index)}`, tone: a.uv_index >= 8 ? 'high' : a.uv_index >= 6 ? 'mid' : '' });
    if (day0 && show('rain')) {
      if (day0.precipitation != null) out.push({ key: 'rain', icon: 'mdi:weather-rainy', text: `Rain ${day0.precipitation} ${day0.precipitation_unit || a.precipitation_unit || ''}`.trim() });
      else if (day0.precipitation_probability != null) out.push({ key: 'rain', icon: 'mdi:weather-rainy', text: `Rain ${day0.precipitation_probability}%` });
    }
    return out;
  });
</script>

<div class="wx">
  <div class="now">
    {#if show('icon')}<Icon icon={WX[e?.state] || 'mdi:weather-cloudy'} size="3.2em" />{/if}
    <div>
      <div class="trow">
        {#if show('temp')}<div class="temp">{a.temperature != null ? Math.round(a.temperature) + '°' : '—'}</div>{/if}
        {#if today}<div class="hl"><span>↑ {Math.round(today.temperature)}°</span>{#if today.templow != null}<span class="lo">↓ {Math.round(today.templow)}°</span>{/if}</div>{/if}
      </div>
      {#if show('cond')}<div class="cond">{t(props.name) || stateWord('weather', null, e?.state) || COND[e?.state] || (e?.state || '').replace(/-/g, ' ')}</div>{/if}
    </div>
  </div>
  {#if details.length}
    <div class="details">
      {#each details as d (d.key)}
        <span class="stat {d.tone || ''}">
          {#if d.bearing != null}
            <span class="dir" style="transform:rotate({d.bearing}deg)"><Icon icon="mdi:navigation" size="0.95em" /></span>
          {:else}
            <Icon icon={d.icon} size="0.95em" />
          {/if}
          {d.text}
        </span>
      {/each}
    </div>
  {/if}
  {#if items.length && show('forecast')}
    <div class="fc">
      {#each items as f}
        <div class="day">
          <div class="d">{label(f)}</div>
          <Icon icon={WX[f.condition] || 'mdi:weather-cloudy'} size="1.6em" />
          <div class="hi">{Math.round(f.temperature)}°</div>
          {#if f.templow != null && show('low')}<div class="lo">{Math.round(f.templow)}°</div>{/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .wx { height: 100%; display: flex; flex-direction: column; justify-content: space-between; gap: 8px; }
  .now { display: flex; align-items: center; gap: 14px; }
  .temp { font-size: 2.2em; font-weight: 600; line-height: 1; }
  /* Today's high / low sit beside the temperature, so they take no extra height. */
  .trow { display: flex; align-items: center; gap: 8px; }
  .hl { display: flex; flex-direction: column; font-size: .78em; font-weight: 600; line-height: 1.2; }
  .cond { color: var(--muted); text-transform: capitalize; font-size: .9em; }
  /* One row of conditions; it wraps only when the card is too narrow for them. */
  .details { display: flex; flex-wrap: wrap; gap: 3px 12px; color: var(--muted); font-size: .8em; }
  .stat { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
  .stat.mid { color: #ffc861; }
  .stat.high { color: #ff8f6b; }
  .dir { display: inline-flex; }
  .fc { display: flex; justify-content: space-between; gap: 4px; }
  .day { display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: .85em; flex: 1; }
  .d { color: var(--muted); }
  .hi { font-weight: 600; }
  .lo { color: var(--muted); }
</style>
