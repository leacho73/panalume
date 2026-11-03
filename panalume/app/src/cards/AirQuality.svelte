<script module>
  import { states } from '../lib/ha.svelte.js';
  export const meta = {
    type: 'air-quality', name: 'Air quality', icon: 'mdi:air-filter', category: 'Info',
    size: { w: 380, h: 220 }, tap: 'more-info',
    defaults: { entity: '', extra: '', extra2: '', scale: 'aqhi', show_band: true },
    autofill: () => {
      // A sensor that says it is an air quality index, else one that is named like one.
      const ids = [...states.keys()].filter((id) => id.startsWith('sensor.'));
      const pick = ids.find((id) => states.get(id)?.attributes?.device_class === 'aqi')
        || ids.find((id) => /aqhi|air_quality|air_quality_index/i.test(id)) || '';
      const pm = ids.find((id) => /pm2_?5|pm_2_5/i.test(id)) || '';
      return pick ? { entity: pick, extra: pm } : {};
    },
    sections: [{ key: 'band', label: 'Risk band' }, { key: 'extra', label: 'Second reading' },
      { key: 'extra2', label: 'Third reading' }],
    fields: [
      { key: 'entity', label: 'Index sensor', type: 'entity', domain: 'sensor', hint: 'Any air quality index sensor: Environment Canada’s AQHI, OpenWeatherMap’s index, a PurpleAir sensor.' },
      { key: 'scale', label: 'Scale', type: 'select', options: [{ value: 'aqhi', label: 'AQHI (Canada, 1–10+)' }, { value: 'us', label: 'US AQI (0–500)' }], hint: 'Decides the words and the colours. AQHI is what Environment Canada and The Weather Network show in Canada.' },
      { key: 'extra', label: 'Another reading', type: 'entity', domain: 'sensor', hint: 'Optional, e.g. PM2.5. Shown as a small tile with its own unit.' },
      { key: 'extra2', label: 'One more reading', type: 'entity', domain: 'sensor', hint: 'Optional, e.g. ozone or PM10.' },
    ],
  };
</script>

<script>
  // An air quality index with the words that go with it. The bands are the published
  // ones: AQHI 1-3 low, 4-6 moderate, 7-10 high, above 10 very high, and the US AQI
  // breakpoints when that scale is chosen.
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { name as entName } from '../lib/entity.js';

  let { props } = $props();
  const show = (k) => !props.hide?.[k];
  const e = $derived(ent(props.entity));
  const v = $derived.by(() => {
    const n = Number(e?.state);
    return e && Number.isFinite(n) ? n : null;
  });

  const AQHI = [
    { max: 3, key: 'low', label: 'Low risk', color: '#2f9e44', note: 'Ideal air quality for outdoor activities.' },
    { max: 6, key: 'moderate', label: 'Moderate risk', color: '#f08c00', note: 'Consider reducing strenuous activity outdoors.' },
    { max: 10, key: 'high', label: 'High risk', color: '#e8590c', note: 'Reduce or reschedule strenuous activities outdoors.' },
    { max: Infinity, key: 'veryhigh', label: 'Very high risk', color: '#c92a2a', note: 'Avoid strenuous activity outdoors.' },
  ];
  const US = [
    { max: 50, key: 'low', label: 'Good', color: '#2f9e44', note: 'Air quality is satisfactory.' },
    { max: 100, key: 'moderate', label: 'Moderate', color: '#f08c00', note: 'Unusually sensitive people should consider limiting exertion.' },
    { max: 150, key: 'sensitive', label: 'Unhealthy for sensitive groups', color: '#e8590c', note: 'Sensitive groups should reduce prolonged exertion.' },
    { max: 200, key: 'unhealthy', label: 'Unhealthy', color: '#c92a2a', note: 'Everyone should reduce prolonged exertion.' },
    { max: 300, key: 'veryhigh', label: 'Very unhealthy', color: '#862e9c', note: 'Avoid prolonged exertion outdoors.' },
    { max: Infinity, key: 'hazard', label: 'Hazardous', color: '#5c0011', note: 'Stay indoors.' },
  ];
  const bands = $derived(props.scale === 'us' ? US : AQHI);
  const band = $derived(v == null ? null : bands.find((b) => v <= b.max));
  // Position on the band scale, for the marker.
  const top = $derived(props.scale === 'us' ? 300 : 10);
  const pct = $derived(v == null ? 0 : Math.max(2, Math.min(100, (v / top) * 100)));

  const extra = (id) => {
    const x = ent(id);
    if (!x || ['unknown', 'unavailable'].includes(x.state)) return null;
    const unit = x.attributes?.unit_of_measurement || '';
    return { key: id, label: entName(x) || '', value: `${x.state}${unit ? ' ' + unit : ''}` };
  };
  const extras = $derived([show('extra') ? extra(props.extra) : null, show('extra2') ? extra(props.extra2) : null].filter(Boolean));
  const updated = $derived(e?.attributes?.observation_time || e?.last_changed || '');
</script>

<div class="wrap" style:--tone={band?.color || 'var(--muted)'}>
  {#if v == null}
    <div class="wait">{e ? t('This sensor has no reading') : t('Pick an air quality sensor')}</div>
  {:else}
    <div class="top">
      <div class="idx">
        <b>{v % 1 === 0 ? v : v.toFixed(1)}</b>
        <small>{props.scale === 'us' ? 'AQI' : 'AQHI'}</small>
      </div>
      <div class="band">
        <span class="nam">{band?.label || ''}</span>
        <span class="note">{band?.note || ''}</span>
      </div>
    </div>
    {#if show('band')}
      <div class="track"><span class="mark" style:left="{pct}%"></span></div>
    {/if}
    {#if extras.length}
      <div class="more">
        {#each extras as x (x.key)}
          <div class="tile"><span>{x.label}</span><b>{x.value}</b></div>
        {/each}
      </div>
    {:else}
      <div class="src">
        <Icon icon="mdi:map-marker-outline" size=".9em" />
        <span>{e.attributes?.location || entName(e) || ''}</span>
        {#if updated}<span class="dot">·</span><span>{new Date(updated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>{/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .wrap { height: 100%; display: flex; flex-direction: column; gap: .45em; min-height: 0; container-type: size; }
  .top { display: flex; align-items: center; gap: .7em; min-width: 0; }
  .idx { display: flex; align-items: baseline; gap: .2em; flex: none; }
  .idx b { font-size: 2.4em; font-weight: 650; line-height: 1; color: var(--tone); font-variant-numeric: tabular-nums; }
  .idx small { font-size: .7em; color: var(--muted); letter-spacing: .04em; }
  .band { display: flex; flex-direction: column; gap: .1em; min-width: 0; }
  .nam { font-size: .95em; font-weight: 600; color: var(--tone); }
  .note { font-size: .72em; color: var(--muted); line-height: 1.25; }
  .track { position: relative; height: .5em; border-radius: .3em; background: linear-gradient(90deg, #2f9e44 0 30%, #f08c00 30% 55%, #e8590c 55% 78%, #c92a2a 78% 100%); opacity: .85; flex: none; }
  .mark { position: absolute; top: -.28em; width: .22em; height: 1.05em; border-radius: .2em; background: #fff; box-shadow: 0 0 0 1.5px rgba(0, 0, 0, .55); transform: translateX(-50%); }
  .more { display: flex; gap: .4em; margin-top: auto; }
  .tile { flex: 1; min-width: 0; background: rgba(255, 255, 255, .05); border-radius: .55em; padding: .3em .5em; display: flex; flex-direction: column; gap: .05em; }
  .tile span { font-size: .68em; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tile b { font-size: .92em; font-weight: 600; font-variant-numeric: tabular-nums; }
  .src { display: flex; align-items: center; gap: .3em; color: var(--muted); font-size: .74em; margin-top: auto; }
  .wait { margin: auto; color: var(--muted); font-size: .9em; text-align: center; }
  @container (max-height: 160px) { .note, .src { display: none; } .idx b { font-size: 1.9em; } }
</style>
