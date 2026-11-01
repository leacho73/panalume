<script module>
  export const meta = {
    type: 'weather-daily', name: 'Weather: daily', icon: 'mdi:calendar-week', category: 'Info',
    size: { w: 540, h: 330 }, tap: 'more-info',
    defaults: { entity: '', days: 7, bar: true, precip: true, wind: false },
    sections: [{ key: 'icon', label: 'Conditions' }, { key: 'bar', label: 'Temperature range' },
      { key: 'precip', label: 'Chance of precipitation' }, { key: 'wind', label: 'Wind' },
      { key: 'uv', label: 'UV index' }],
    fields: [
      { key: 'entity', label: 'Weather', type: 'entity', domain: 'weather' },
      { key: 'name', label: 'Title', type: 'text' },
      { key: 'days', label: 'Days to show', type: 'number', hint: 'The forecast is whatever the service offers: eight days on OpenWeatherMap, six on Met.no.' },
    ],
  };
</script>

<script>
  // A week at a glance: each day's sky, its chance of precipitation, and its high and low drawn
  // as a bar against the whole week, so a warm day reads as warm without reading the numbers.
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { stateWord } from '../lib/i18n.svelte.js';
  import { subscribe } from '../lib/ha.svelte.js';
  import { WX } from './Weather.svelte';

  let { props, h } = $props();
  const show = (k) => !props.hide?.[k];
  const e = $derived(ent(props.entity));
  const a = $derived(e?.attributes || {});
  let forecast = $state([]);
  $effect(() => {
    const id = e?.entity_id;
    if (!id) return;
    return subscribe({ type: 'weather/subscribe_forecast', entity_id: id, forecast_type: 'daily' }, (ev) => (forecast = ev.forecast || []));
  });

  const days = $derived(forecast.slice(0, Number(props.days) || 7));
  // The bar is relative to the days on show, not to an absolute scale.
  const lo = $derived(Math.min(...days.map((d) => Number(d.templow ?? d.temperature ?? 0))));
  const hi = $derived(Math.max(...days.map((d) => Number(d.temperature ?? d.templow ?? 0))));
  const span = $derived(Math.max(1, hi - lo));
  const pos = (v) => Math.max(0, Math.min(100, ((Number(v) - lo) / span) * 100));

  const dayName = (f, i) => {
    const d = new Date(f.datetime);
    return i === 0 ? t('Today') : d.toLocaleDateString([], { weekday: 'short' });
  };
  const date = (f) => new Date(f.datetime).toLocaleDateString([], { month: 'short', day: 'numeric' });
</script>

<div class="wrap">
  {#if props.name}<div class="title">{t(props.name)}</div>{/if}
  {#if days.length}
    <div class="list">
      {#each days as f, i (f.datetime)}
        <div class="row" title={`${stateWord('weather', null, f.condition) || f.condition} · ${Math.round(f.temperature)}° / ${Math.round(f.templow ?? f.temperature)}°`}>
          <div class="day">
            <b>{dayName(f, i)}</b>
            <small>{date(f)}</small>
          </div>
          {#if show('icon')}<Icon icon={WX[f.condition] || 'mdi:weather-cloudy'} size="1.35em" />{/if}
          {#if show('precip') && f.precipitation_probability != null}
            <div class="pop {Number(f.precipitation_probability) >= 50 ? 'wet' : ''}">
              <Icon icon="mdi:water" size=".85em" />{Math.round(f.precipitation_probability)}%
            </div>
          {:else}<div class="pop"></div>{/if}
          <div class="temps">
            {#if show('bar')}
              <div class="bar">
                <span class="fill" style:left="{pos(f.templow ?? f.temperature)}%" style:right="{100 - pos(f.temperature)}%"></span>
              </div>
            {/if}
            <div class="nums">
              <b>{f.temperature == null ? '—' : Math.round(f.temperature) + '°'}</b>
              {#if f.templow != null}<span>{Math.round(f.templow)}°</span>{/if}
            </div>
          </div>
          {#if show('wind') && f.wind_speed != null}
            <div class="wind">
              {#if f.wind_bearing != null}
                <span class="dir" style="transform:rotate({Number(f.wind_bearing)}deg)"><Icon icon="mdi:navigation" size=".8em" /></span>
              {/if}
              {Math.round(f.wind_speed)} {a.wind_speed_unit || ''}
            </div>
          {/if}
          {#if show('uv') && f.uv_index != null}<div class="uv {Number(f.uv_index) >= 8 ? 'high' : Number(f.uv_index) >= 6 ? 'mid' : ''}">UV {Math.round(f.uv_index)}</div>{/if}
        </div>
      {/each}
    </div>
  {:else}
    <div class="wait">{e ? t('This weather service has no daily forecast') : t('Pick a weather entity')}</div>
  {/if}
</div>

<style>
  .wrap { height: 100%; display: flex; flex-direction: column; gap: .4em; min-height: 0; }
  .title { font-size: .8em; font-weight: 600; color: var(--muted); letter-spacing: .02em; text-transform: uppercase; }
  .list { flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }
  .row { display: flex; align-items: center; gap: .55em; min-height: 0; }
  .day { display: flex; flex-direction: column; min-width: 3.4em; line-height: 1.15; }
  .day b { font-size: .86em; font-weight: 600; }
  .day small { font-size: .68em; color: var(--muted); }
  .pop { display: flex; align-items: center; gap: .1em; font-size: .72em; color: var(--muted); min-width: 2.5em; font-variant-numeric: tabular-nums; }
  .pop.wet { color: #74c0fc; }
  .temps { flex: 1; display: flex; align-items: center; gap: .5em; min-width: 0; }
  .bar { position: relative; flex: 1; height: .42em; border-radius: .3em; background: rgba(255, 255, 255, .09); min-width: 2em; }
  .fill { position: absolute; top: 0; bottom: 0; border-radius: .3em; background: linear-gradient(90deg, #4dabf7, #ffd43b 55%, #ff922b); }
  .nums { display: flex; gap: .35em; align-items: baseline; font-variant-numeric: tabular-nums; min-width: 3.6em; justify-content: flex-end; }
  .nums b { font-size: .92em; font-weight: 600; }
  .nums span { font-size: .8em; color: var(--muted); }
  .wind { display: flex; align-items: center; gap: .15em; font-size: .72em; color: var(--muted); min-width: 3.6em; justify-content: flex-end; font-variant-numeric: tabular-nums; }
  .dir { display: inline-flex; transform-origin: 50% 50%; }
  .uv { font-size: .7em; color: var(--muted); }
  .uv.mid { color: #f0b429; }
  .uv.high { color: #e8590c; }
  .wait { margin: auto; color: var(--muted); font-size: .9em; text-align: center; }
</style>
