<script module>
  import { states } from '../lib/ha.svelte.js';
  // A sensor that carries a price list in its attributes, e.g. a REST sensor on
  // Tibber's API with `today` / `tomorrow` ([{ total, startsAt }]).
  const hasList = (id) => { const a = states.get(id)?.attributes; return !!a && (Array.isArray(a.today) || Array.isArray(a.raw_today)); };
  export const meta = {
    type: 'tibber-rates', name: 'Tibber prices', icon: 'mdi:chart-bar', category: 'Energy',
    size: { w: 620, h: 280 }, tap: 'none',
    defaults: { source: 'service', window: 'next24', hourly: false, cheapest_hours: 2, colors: 'auto', cheap: 25, peak: 35 },
    autofill: () => {
      const ids = [...states.keys()];
      return {
        home: ids.find((id) => /^sensor\.electricity_price_/.test(id)) || '',
        prices: ids.find((id) => id.startsWith('sensor.') && id.includes('tibber') && hasList(id)) || '',
      };
    },
    sections: [{ key: 'now', label: 'Current price' }, { key: 'stats', label: 'Min / avg / max' }, { key: 'cheapest', label: 'Cheapest window' }, { key: 'chart', label: 'Chart' }, { key: 'legend', label: 'Legend' }],
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'source', label: 'Prices from', type: 'select', options: [{ value: 'service', label: 'Tibber integration (tibber.get_prices)' }, { value: 'sensor', label: 'Sensor with a price list (today / tomorrow)' }],
        hint: 'The Tibber integration gives 15-minute prices for today and, from about 13:00, tomorrow. Use a sensor if you already have one with the prices in its attributes.' },
      { key: 'home', label: 'Tibber price sensor (for the home)', type: 'entity', domain: 'sensor', hint: 'sensor.electricity_price_… from the Tibber integration; picks the home if you have several.' },
      { key: 'prices', label: 'Sensor with price list', type: 'entity', domain: 'sensor' },
      { key: 'window', label: 'Window', type: 'select', options: [{ value: 'next24', label: 'Now → +24h' }, { value: 'today', label: 'Today' }, { value: 'both', label: 'Today + tomorrow' }] },
      { key: 'hourly', label: 'Hourly bars (average the 15-minute prices)', type: 'bool' },
      { key: 'cheapest_hours', label: 'Cheapest window length (hours)', type: 'number' },
      { key: 'colors', label: 'Colours', type: 'select', options: [{ value: 'auto', label: 'Relative to the day (cheap / mid / expensive thirds)' }, { value: 'fixed', label: 'Fixed thresholds' }] },
      { key: 'cheap', label: 'Cheap below (ct)', type: 'number' },
      { key: 'peak', label: 'Expensive from (ct)', type: 'number' },
    ],
  };
</script>

<script>
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/tpl.js';
  import { clock } from '../lib/clock.svelte.js';
  import { send, conn } from '../lib/ha.svelte.js';
  import { fmtRate, money } from '../lib/money.svelte.js';
  let { props } = $props();
  const show = (k) => !props.hide?.[k];

  // The card's words follow Home Assistant's language (Settings → System → General).
  const L = {
    en: { now: 'Electricity now', from: 'from', min: 'Min', avg: 'Avg', max: 'Max', cheapest: (h) => `Cheapest ${h}h`, cheapestShort: (h) => `cheapest ${h}h`,
      mid: 'mid', today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday', later: 'Tomorrow\u2019s prices from about 13:00',
      noPrices: 'Tibber returned no prices', failed: 'Could not read Tibber prices' },
    de: { now: 'Strompreis aktuell', from: 'ab', min: 'Min', avg: 'Ø', max: 'Max', cheapest: (h) => `Günstigste ${h} h`, cheapestShort: (h) => `günstigste ${h} h`,
      mid: 'mittel', today: 'Heute', tomorrow: 'Morgen', yesterday: 'Gestern', later: 'Preise für morgen ab ca. 13 Uhr',
      noPrices: 'Tibber hat keine Preise geliefert', failed: 'Tibber-Preise konnten nicht gelesen werden' },
  };
  const lang = $derived(/^de\b/i.test(money.locale || '') ? 'de' : 'en');
  const T = $derived(L[lang]);
  const loc = $derived(money.locale || (lang === 'de' ? 'de-DE' : undefined));
  const hm = (tm) => new Date(tm).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hour12: false });
  const day = (tm, ref) => {
    const diff = Math.round((new Date(new Date(tm).toDateString()) - new Date(new Date(ref).toDateString())) / 864e5);
    return diff === 0 ? T.today : diff === 1 ? T.tomorrow : diff === -1 ? T.yesterday : new Date(tm).toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' });
  };
  const until = (tm, ref) => {
    const m = Math.round((tm - ref) / 60000);
    if (Math.abs(m) < 60) return lang === 'de' ? `in ${m} Min.` : `${m}m`;
    const hh = Math.floor(Math.abs(m) / 60), r = Math.abs(m) % 60;
    return lang === 'de' ? `in ${hh} Std.${r ? ' ' + r + ' Min.' : ''}` : `${hh}h${r ? ' ' + r + 'm' : ''}`;
  };
  let w = $state(500), h = $state(150);

  const ts = (v) => (v ? Date.parse(v) : NaN);
  /** [{start, value}] → [{start, end, value}], each slot ending where the next starts. */
  function slotsOf(list) {
    const s = list.filter((r) => Number.isFinite(r.start) && Number.isFinite(r.value)).sort((a, b) => a.start - b.start);
    const step = s.length > 1 ? Math.min(...s.slice(1).map((r, i) => r.start - s[i].start).filter((d) => d > 0)) : 36e5;
    const seen = new Set();
    return s.filter((r) => (seen.has(r.start) ? false : seen.add(r.start))).map((r, i, a) => ({ ...r, end: Math.min(r.start + step, a[i + 1]?.start ?? Infinity) }));
  }

  // --- Source 1: the Tibber integration's tibber.get_prices action -----------
  let fetched = $state([]), error = $state('');
  async function load() {
    if (props.source === 'sensor' || !conn.connected) return;
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const start = new Date(+d - 864e5), end = new Date(+d + 2 * 864e5);
    try {
      const r = await send({ type: 'call_service', domain: 'tibber', service: 'get_prices', service_data: { start: start.toISOString(), end: end.toISOString() }, return_response: true });
      const homes = r?.response?.prices || {};
      const keys = Object.keys(homes);
      // Homes are keyed by their app nickname ("null" when there's none).
      const nick = states.get(props.home)?.attributes.app_nickname;
      const key = keys.find((k) => k === String(nick ?? null)) ?? keys[0];
      fetched = (homes[key] || []).map((p) => ({ start: ts(p.start_time), value: Number(p.price) }));
      error = keys.length ? '' : 'noPrices';
    } catch (e) {
      error = 'failed'; console.warn('tibber.get_prices', e);
    }
  }
  $effect(() => {
    props.source; props.home; conn.connected;
    load();
    // New prices come once a day (tomorrow's around 13:00); 15 minutes is plenty.
    const i = setInterval(load, 15 * 60e3);
    return () => clearInterval(i);
  });

  // --- Source 2: a sensor with the list in its attributes --------------------
  const fromSensor = $derived.by(() => {
    if (props.source !== 'sensor' || !props.prices) return [];
    const e = states.get(props.prices);
    const a = e?.attributes || {};
    const div = /^(ct|cents?|p|øre|öre)\/kwh$/i.test(a.unit_of_measurement || '') ? 100 : 1;
    const list = [...(a.yesterday || []), ...(a.today || a.raw_today || []), ...(a.tomorrow || a.raw_tomorrow || [])];
    return list.map((p) => ({ start: ts(p.startsAt ?? p.start ?? p.start_time ?? p.from), value: Number(p.total ?? p.price ?? p.value) / div }));
  });

  const base = $derived(slotsOf(props.source === 'sensor' ? fromSensor : fetched));
  // Optional: average 15-minute prices into hours for a calmer chart.
  const all = $derived.by(() => {
    if (!props.hourly) return base;
    const by = new Map();
    for (const r of base) {
      const k = Math.floor(r.start / 36e5) * 36e5;
      const b = by.get(k) || { start: k, end: k + 36e5, sum: 0, ms: 0 };
      const ms = r.end - r.start;
      b.sum += r.value * ms; b.ms += ms;
      by.set(k, b);
    }
    return [...by.values()].map((b) => ({ start: b.start, end: b.end, value: b.sum / b.ms }));
  });

  const now = $derived(clock.now);
  const range = $derived.by(() => {
    const d = new Date(now); d.setHours(0, 0, 0, 0);
    const mid = d.getTime();
    if (props.window === 'today') return [mid, mid + 864e5];
    if (props.window === 'both') return [mid, mid + 2 * 864e5];
    const s = Math.floor(now / 9e5) * 9e5 - 2 * 36e5;
    return [s, s + 24 * 36e5];
  });
  const slots = $derived(all.filter((r) => r.end > range[0] && r.start < range[1]));
  // Current price: from the list (the exact 15-minute slot), else the sensor's state.
  const curSlot = $derived(base.find((r) => r.start <= now && now < r.end));
  const cur = $derived(curSlot?.value ?? (Number.isFinite(Number(states.get(props.home)?.state)) ? Number(states.get(props.home).state) : null));
  // Next noticeable change (≥ 0.5 ct), so 15-minute wobble doesn't count.
  const nextChange = $derived(curSlot ? base.find((r) => r.start >= curSlot.end && Math.abs(r.value - curSlot.value) >= 0.005) : null);
  const vals = $derived(slots.map((s) => s.value));
  const lo = $derived(vals.length ? Math.min(...vals) : null);
  const hi = $derived(vals.length ? Math.max(...vals) : null);
  const avg = $derived(slots.length ? slots.reduce((a, s) => a + s.value * (s.end - s.start), 0) / slots.reduce((a, s) => a + (s.end - s.start), 0) : null);

  // Colours: by thirds of today's spread (useful when every price is "high"),
  // or by fixed thresholds in ct.
  const dayVals = $derived.by(() => {
    const d = new Date(now); d.setHours(0, 0, 0, 0);
    const v = base.filter((r) => r.start >= +d && r.start < +d + 864e5).map((r) => r.value);
    return v.length ? v : vals;
  });
  const th = $derived.by(() => {
    if (props.colors === 'fixed') return { cheap: (Number(props.cheap) || 25) / 100, peak: (Number(props.peak) || 35) / 100 };
    const a = Math.min(...dayVals), b = Math.max(...dayVals), third = (b - a) / 3;
    return { cheap: a + third, peak: b - third };
  });
  const color = (v) => (v <= 0 ? '#4fd1d9' : v <= th.cheap ? '#5bd88f' : v >= th.peak ? '#ff7a90' : '#ffc861');

  // Cheapest upcoming window of N hours, from the full-resolution prices.
  const winH = $derived(Math.max(0.25, Number(props.cheapest_hours) || 2));
  const winLabel = $derived(new Intl.NumberFormat(loc, { maximumFractionDigits: 2 }).format(winH));
  const cheapest = $derived.by(() => {
    const len = winH * 36e5;
    const fut = base.filter((r) => r.start >= Math.floor(now / 9e5) * 9e5);
    let best = null;
    for (let i = 0; i < fut.length; i++) {
      let ms = 0, sum = 0, j = i;
      while (j < fut.length && ms < len) {
        if (j > i && fut[j].start !== fut[j - 1].end) break; // a gap in the data
        const take = Math.min(fut[j].end - fut[j].start, len - ms);
        sum += fut[j].value * take; ms += take; j++;
      }
      if (ms < len) { if (j >= fut.length) break; continue; }
      const v = sum / ms;
      if (!best || v < best.v) best = { v, start: fut[i].start, end: fut[i].start + len };
    }
    return best;
  });
  const hasTomorrow = $derived.by(() => { const d = new Date(now); d.setHours(24, 0, 0, 0); return base.some((r) => r.start >= +d); });

  const PAD = 18;
  // Prices here rarely go near zero, so the bars start a little below the lowest
  // price (the differences are what matter); at or below zero they start at 0.
  const max = $derived(vals.length ? hi + Math.max(0.005, (hi - lo) * 0.08) : 0.4);
  const min = $derived(!vals.length ? 0 : lo > 0 ? Math.max(0, lo - Math.max(0.01, (hi - lo) * 0.6)) : lo);
  const zero = $derived(Math.max(min, 0));
  const X = (tm) => ((tm - range[0]) / (range[1] - range[0])) * w;
  const Y = (v) => PAD + (1 - (v - min) / (max - min || 1)) * (h - PAD - 16);
  const ticks = $derived.by(() => {
    const out = [];
    const step = range[1] - range[0] > 864e5 ? 6 * 36e5 : 3 * 36e5;
    // Line up with local midnight (not UTC), so labels read 00:00, 03:00, …
    const d = new Date(range[0]); d.setHours(0, 0, 0, 0);
    for (let tm = +d; tm < range[1]; tm += step) if (tm > range[0]) out.push(tm);
    return out;
  });
  const gap = $derived(slots.length > 48 ? 0.5 : 1.5);
</script>

<div class="rates">
  <div class="head">
    {#if show('now')}<div class="now">
      <div class="lbl">{t(props.title) || T.now}</div>
      <div class="big" style="color:{cur != null ? color(cur) : 'inherit'}">{fmtRate(cur)}<small>/kWh</small></div>
      {#if nextChange}<div class="sub">{fmtRate(nextChange.value)} {T.from} {hm(nextChange.start)} <span class="dim">({until(nextChange.start, now)})</span></div>{/if}
      {#if error}<div class="err"><Icon icon="mdi:alert-circle-outline" size="1em" /> {T[error] || error}</div>{/if}
    </div>{:else}<div></div>{/if}
    <div class="stats">
      {#if show('stats')}
      <div><span class="dim">{T.min}</span> {fmtRate(lo)}</div>
      <div><span class="dim">{T.avg}</span> {fmtRate(avg)}</div>
      <div><span class="dim">{T.max}</span> {fmtRate(hi)}</div>
      {/if}
      {#if cheapest && show('cheapest')}<div class="cheap"><Icon icon="mdi:timer-sand" size="1em" /> {T.cheapest(winLabel)}: {day(cheapest.start, now) === T.today ? '' : day(cheapest.start, now) + ' '}{hm(cheapest.start)}–{hm(cheapest.end)}{' · '}{fmtRate(cheapest.v)}</div>{/if}
      {#if show('cheapest') && !hasTomorrow && new Date(now).getHours() < 14}<div class="dim small">{T.later}</div>{/if}
    </div>
  </div>
  {#if show('chart')}<div class="chart" bind:clientWidth={w} bind:clientHeight={h}>
    <svg width={w} height={h}>
      {#if cheapest && show('cheapest') && cheapest.end > range[0] && cheapest.start < range[1]}
        <rect x={X(cheapest.start)} y="0" width={Math.max(2, X(cheapest.end) - X(cheapest.start))} height={h - 16} fill="#5bd88f" opacity=".1" />
        <rect x={X(cheapest.start)} y="0" width={Math.max(2, X(cheapest.end) - X(cheapest.start))} height="4" rx="2" fill="#5bd88f" />
      {/if}
      {#each slots as s}
        {@const x = X(Math.max(s.start, range[0]))}
        {@const bw = Math.max(1, X(Math.min(s.end, range[1])) - x - gap)}
        <rect {x} y={Math.min(Y(s.value), Y(zero))} width={bw} height={Math.max(1.5, Math.abs(Y(zero) - Y(s.value)))} rx={bw > 4 ? 2 : 1} fill={color(s.value)} opacity={s.end <= now ? 0.35 : 0.9} />
      {/each}
      {#if avg != null}<line x1="0" x2={w} y1={Y(avg)} y2={Y(avg)} stroke="currentColor" stroke-width="1" stroke-dasharray="2 4" opacity=".35" />{/if}
      {#if now > range[0] && now < range[1]}<line x1={X(now)} x2={X(now)} y1="0" y2={h - 14} stroke="#fff" stroke-width="1.5" stroke-dasharray="3 3" />{/if}
      {#each ticks as tm}<text x={X(tm)} y={h - 2} font-size="10" fill="currentColor" opacity=".55" text-anchor="middle">{new Date(tm).getHours().toString().padStart(2, '0')}:00</text>{/each}
    </svg>
  </div>{/if}
  {#if show('legend')}<div class="legend">
    <span><i style="background:#5bd88f"></i>&lt;{fmtRate(th.cheap)}</span><span><i style="background:#ffc861"></i>{T.mid}</span><span><i style="background:#ff7a90"></i>≥{fmtRate(th.peak)}</span>
    {#if cheapest && show('cheapest')}<span><i style="background:#5bd88f;opacity:.5"></i>{T.cheapestShort(winLabel)}</span>{/if}
  </div>{/if}
</div>

<style>
  .rates { height: 100%; display: flex; flex-direction: column; gap: 8px; }
  .head { display: flex; justify-content: space-between; gap: 12px; }
  .lbl { color: var(--muted); font-size: .85em; }
  .big { font-size: 2.2em; font-weight: 600; line-height: 1.1; letter-spacing: -.02em; white-space: nowrap; }
  .big small { font-size: .4em; color: var(--muted); font-weight: 400; margin-left: 3px; white-space: nowrap; }
  .sub { font-size: .9em; }
  .err { font-size: .8em; color: #ff7a90; display: flex; align-items: center; gap: 4px; margin-top: 2px; }
  .dim { color: var(--muted); }
  .small { font-size: .9em; }
  .stats { text-align: right; font-size: .85em; display: flex; flex-direction: column; gap: 2px; }
  .cheap { color: #5bd88f; display: flex; align-items: center; gap: 4px; justify-content: flex-end; margin-top: 4px; }
  .chart { flex: 1; min-height: 60px; position: relative; }
  svg { position: absolute; inset: 0; overflow: visible; }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: .75em; color: var(--muted); }
  .legend span { display: flex; align-items: center; gap: 5px; }
  .legend i { width: 9px; height: 9px; border-radius: 3px; }
</style>
