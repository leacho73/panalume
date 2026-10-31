<script module>
  // Circuits found in Home Assistant's Energy settings. The dashboard watches the entities its
  // cards report through meta.watch, and those states only arrive once this list is known, so the
  // list is held here and handed back from watch() — the effect re-runs when it fills.
  let found = $state([]);
  export const meta = {
    type: 'circuit-energy', name: 'Circuit energy', icon: 'mdi:home-lightning-bolt', category: 'Energy',
    size: { w: 640, h: 400 }, tap: 'none',
    defaults: { period: 'day' },
    // Everything comes from Home Assistant's own Energy settings: the house total from the
    // grid source, the circuits from the "Individual devices" list, the tariff from the grid
    // price. Any of the three can be pointed at an entity instead.
    watch: (props) => (props.entities?.length ? props.entities : found),
    sections: [{ key: 'total', label: 'Totals' }, { key: 'rows', label: 'Circuits' }, { key: 'tariff', label: 'Tariff' }],
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'period', label: 'Opens on', type: 'select', options: [{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }] },
      { key: 'house', label: 'Whole-house energy (blank = from Energy settings)', type: 'entity', domain: 'sensor', section: 'total' },
      { key: 'entities', label: 'Circuits (blank = from Energy settings)', type: 'entities', section: 'rows' },
      { key: 'price', label: 'Price per kWh sensor (blank = from Energy settings)', type: 'entity', domain: 'sensor', section: 'tariff' },
    ],
  };
</script>

<script>
  // Circuit breakdown of where the house's energy went, for a day, a week or the month so
  // far, priced at the tariff Home Assistant's Energy settings already hold. Reads HA's
  // daily long-term statistics, then tops the current day up from the meters themselves
  // because statistics are a few minutes behind.
  import { send, conn } from '../lib/ha.svelte.js';
  import { t, ent } from '../lib/tpl.js';
  import { fmtMoney, fmtRate, fmtNum } from '../lib/money.svelte.js';
  import { name } from '../lib/entity.js';
  let { props } = $props();
  const show = (k) => !props.hide?.[k];
  const C = ['#488fc2', '#ff9800', '#4db6ac', '#8353d1', '#f06292', '#7cb342', '#ffd24a', '#26c6da', '#ba68c8', '#90a4ae', '#ef5350'];

  let period = $state(props.period || 'day');
  let prefs = $state(null);
  let stats = $state({});
  let error = $state('');
  let now = $state(Date.now());
  let listH = $state(0);

  // The editor's "opens on" only sets the starting view; the chips switch it in place, so the
  // effect must not read `period` — it would overwrite every chip tap with the setting again.
  let opensOn = props.period;
  $effect(() => {
    if (props.period !== opensOn) { opensOn = props.period; if (props.period) period = props.period; }
  });

  const start = $derived.by(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    if (period === 'week') return d.getTime() - 6 * 864e5;
    if (period === 'month') { const m = new Date(d); m.setDate(1); return m.getTime(); }
    return d.getTime();
  });

  const grid = $derived((prefs?.energy_sources || []).find((x) => x.type === 'grid'));
  const houseId = $derived((props.house ? String(t(props.house)).trim() : '') || grid?.stat_energy_from || '');
  const circuits = $derived.by(() => {
    const own = (props.entities || []).filter((x) => x && typeof x === 'string').map((x) => String(t(x)).trim()).filter(Boolean);
    const list = own.length ? own : (prefs?.device_consumption || [])
      .map((d) => (typeof d === 'string' ? d : d.stat_consumption)).filter(Boolean);
    return [...new Set(list)];
  });

  // Hand the discovered list to meta.watch, so the dashboard subscribes to those entities.
  $effect(() => { if (!props.entities?.length && circuits.length) found = circuits; });

  // kWh for one entity over the selected window. Only increases are summed: a meter that
  // was reset or re-added writes one negative step into its own history.
  function valueOf(id) {
    let v = (stats[id] || []).reduce((a, r) => a + Math.max(0, r.change || 0), 0);
    if (period === 'day') {
      const e = ent(id), live = Number(e?.state);
      // A daily meter (state_class "total") is exact to the minute; statistics lag ~5 min.
      if (Number.isFinite(live) && e?.attributes?.state_class === 'total' && live > v) v = live;
    }
    return v;
  }

  async function load() {
    if (!conn.connected) return;
    try {
      prefs ??= await send({ type: 'energy/get_prefs' });
      const ids = [houseId, ...circuits].filter(Boolean);
      if (!circuits.length) { stats = {}; return void (error = 'No circuits yet: add them in Settings → Dashboards → Energy, or pick entities here.'); }
      stats = (await send({
        type: 'recorder/statistics_during_period',
        start_time: new Date(start).toISOString(), end_time: new Date().toISOString(),
        period: 'day', statistic_ids: ids, types: ['change'], units: { energy: 'kWh' },
      })) || {};
      error = '';
    } catch (e) {
      error = e?.message || 'Could not read energy statistics';
    }
  }
  $effect(() => {
    period; start; houseId; circuits.join(); conn.connected;
    load();
    const a = setInterval(load, 60e3);
    const b = setInterval(() => (now = Date.now()), 30e3);
    return () => { clearInterval(a); clearInterval(b); };
  });

  // Price per kWh in HA's currency (a sensor reporting p/ct/øre is divided down).
  const priceOf = (id) => {
    const e = ent(id);
    const v = Number(e?.state);
    if (!Number.isFinite(v)) return null;
    return /^(p|pence|ct|cents?|¢|øre|öre|rp\.?)\/kwh$/i.test(e?.attributes?.unit_of_measurement || '') ? v / 100 : v;
  };
  const tariff = $derived.by(() => {
    if (props.price) return priceOf(props.price);
    if (grid?.entity_energy_price) return priceOf(grid.entity_energy_price);
    const n = Number(grid?.number_energy_price);
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  const money = (kwh) => (tariff == null ? null : kwh * tariff);

  // "Washing Machine Energy Today" inside a card that is entirely energy → "Washing Machine".
  const METER = /\s+(?:energy\s+)?(?:this\s+(?:month|year|week)|today|yesterday|total|usage)$/i;
  const labelOf = (id) => {
    const full = name(ent(id));
    const short = full.replace(METER, '').trim();
    return short || full || id.split('.').slice(1).join(' ');
  };
  const rows = $derived.by(() => circuits
    .map((id) => ({ id, label: labelOf(id), kwh: valueOf(id) }))
    .sort((a, b) => b.kwh - a.kwh));
  const metered = $derived(rows.reduce((a, r) => a + r.kwh, 0));
  const house = $derived(houseId ? valueOf(houseId) : 0);
  const top = $derived(Math.max(0.001, ...rows.map((r) => r.kwh)));

  // Fit the list to what the cell can actually hold; reserve one row for the tail.
  const ROW = 30, GAP = 6;
  const fit = $derived.by(() => {
    const n = Math.max(0, Math.floor((listH + GAP) / (ROW + GAP)));
    return Math.max(1, rows.length > n ? n - 1 : n);
  });
  const shownRows = $derived(rows.slice(0, fit));
  const hidden = $derived(rows.length - shownRows.length);
  // Only reserve the tail line when a second row's worth of height exists; in a 200 px cell
  // the row alone is the whole list.
  const showMore = $derived(hidden > 0 && listH >= ROW + 14);

  const label = $derived(period === 'week' ? 'Last 7 days' : period === 'month'
    ? new Date(start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' – now'
    : new Date(start).toLocaleDateString(undefined, { weekday: 'long' }));
  const f1 = (v) => fmtNum(v, v >= 100 ? 0 : 1);
</script>

<div class="ce">
  <div class="head">
    <div class="title">{t(props.title) || 'Circuit energy'}</div>
    <div class="segs">
      {#each [['day', 'Day'], ['week', 'Week'], ['month', 'Month']] as [k, l]}
        <button class="seg" class:on={period === k} data-stop onclick={() => (period = k)}>{l}</button>
      {/each}
    </div>
  </div>

  {#if error}<div class="err">{error}</div>{/if}

  {#if show('total')}
    <div class="tots">
      <div class="t">
        <b>{f1(metered)}<small>kWh</small></b>
        <span>{rows.length} circuits · {label}</span>
      </div>
      <div class="t">
        <b>{house ? f1(house) : '—'}<small>{house ? 'kWh' : ''}</small></b>
        <span>whole house{#if house > 0 && metered > 0}<i class="pc">{' · '}{Math.round((metered / house) * 100)}% metered</i>{/if}</span>
      </div>
      {#if show('tariff') && money(house || metered) != null}
        <div class="t money">
          <b>{fmtMoney(money(house || metered))}</b>
          <span>at {fmtRate(tariff)}/kWh</span>
        </div>
      {/if}
    </div>
  {/if}

  {#if show('rows')}
    <div class="list" bind:clientHeight={listH}>
      {#each shownRows as r, i (r.id)}
        <div class="row" style="--c:{C[i % C.length]}">
          <span class="dot"></span>
          <span class="nm">{r.label}</span>
          <span class="bar"><i style="width:{Math.max(2, (r.kwh / top) * 100)}%"></i></span>
          <span class="kwh">{fmtNum(r.kwh, r.kwh >= 100 ? 0 : r.kwh >= 10 ? 1 : 2)}<small>kWh</small></span>
          {#if show('tariff')}<span class="cost">{money(r.kwh) == null ? '' : fmtMoney(money(r.kwh))}</span>{/if}
        </div>
      {/each}
      {#if showMore}<div class="more">and {hidden} more</div>{/if}
    </div>
  {/if}

  {#if show('tariff') && tariff != null}
    <div class="foot">{label} · priced at {fmtRate(tariff)}/kWh from your Energy settings; delivery and fixed charges are extra</div>
  {/if}
</div>

<style>
  .ce { height: 100%; display: flex; flex-direction: column; gap: 8px; container-type: size; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; flex: none; }
  .title { font-weight: 600; }
  .segs { display: flex; background: rgba(255,255,255,.06); border-radius: 999px; padding: 2px; flex: none; }
  .seg { font: inherit; font-size: .78em; color: var(--muted); background: none; border: 0; padding: 3px 10px; border-radius: 999px; cursor: pointer; }
  .seg.on { background: var(--on, #488fc2); color: #fff; font-weight: 600; }
  .err { flex: none; font-size: .8em; color: #ff7a90; }
  .tots { display: flex; gap: 8px; flex-wrap: wrap; flex: none; }
  .tots .t { flex: 1; min-width: 88px; background: rgba(255,255,255,.05); border-radius: 12px; padding: 6px 10px; display: flex; flex-direction: column; }
  .tots b { font-size: min(1.35em, 9cqh); font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .tots b small { font-size: .55em; font-weight: 500; color: var(--muted); margin-left: .2em; }
  .pc { font-style: normal; }
  .tots span { font-size: .72em; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tots .money b { color: var(--on, #ffd24a); }
  .list { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; overflow: hidden; }
  .row { flex: none; height: 30px; display: flex; align-items: center; gap: 8px; }
  .dot { width: 8px; height: 8px; border-radius: 3px; background: var(--c); flex: none; }
  .nm { flex: 1 1 auto; min-width: 0; font-size: .82em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar { flex: 0 1 30%; width: 30%; height: 6px; border-radius: 3px; background: rgba(255,255,255,.07); overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--c); border-radius: 3px; }
  .kwh { flex: none; font-size: .82em; font-variant-numeric: tabular-nums; text-align: right; min-width: 4.6em; }
  .kwh small { font-size: .8em; color: var(--muted); margin-left: .15em; }
  .cost { flex: none; width: 4.4em; text-align: right; font-size: .82em; font-variant-numeric: tabular-nums; color: var(--muted); }
  .more { flex: none; font-size: .74em; color: var(--muted); padding-left: 16px; }
  .foot { flex: none; font-size: .68em; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  @container (max-width: 380px) {
    .nm { font-size: .78em; }
    .bar { display: none; }
    .cost { width: 3.6em; }
    .kwh { min-width: 3.9em; }
    .foot { display: none; }
    .pc { display: none; }
    .tots .t { min-width: 0; padding: 5px 7px; }
    .tots b { font-size: min(1.05em, 8cqh); }
    .tots span { font-size: .66em; }
    .seg { padding: 3px 7px; }
  }
  @container (max-height: 220px) { .foot { display: none; } .tots span { display: none; } }
</style>
