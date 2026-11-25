<script module>
  import { find } from '../lib/octopus.js';
  export const meta = {
    type: 'energy-today', name: 'Energy cost today', icon: 'mdi:currency-gbp', category: 'Energy',
    size: { w: 460, h: 300 }, tap: 'none',
    defaults: { period: 'current' },
    autofill: () => ({
      cost: find(/^sensor\.octopus_energy_electricity_.+_\d+_current_accumulative_cost$/),
      consumption: find(/^sensor\.octopus_energy_electricity_.+_\d+_current_accumulative_consumption$/),
      peak_kwh: find(/^sensor\.octopus_energy_electricity_.+_\d+_current_accumulative_consumption_peak$/),
      offpeak_kwh: find(/^sensor\.octopus_energy_electricity_.+_\d+_current_accumulative_consumption_off_peak$/),
      prev_cost: find(/^sensor\.octopus_energy_electricity_.+_\d+_previous_accumulative_cost$/),
      export_kwh: find(/^sensor\.myenergi_hub_.+_grid_export_today/),
      export_rate: find(/^sensor\.octopus_energy_electricity_.+_export_current_rate$/),
      export_prev: find(/^sensor\.octopus_energy_electricity_.+_export_previous_accumulative_cost$/),
      solar_kwh: find(/^sensor\.myenergi_hub_.+_generated_today/),
    }),
    sections: [{ key: 'cost', label: 'Cost', section: 'cost' }, { key: 'kwh', label: 'kWh' }, { key: 'avg', label: 'Avg rate' }, { key: 'export', label: 'Export' }, { key: 'solar', label: 'Solar' }, { key: 'yesterday', label: 'Yesterday' }, { key: 'split', label: 'Peak / off-peak bar' }, { key: 'chart', label: 'Half-hourly chart' }],
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'cost', label: 'Accumulative cost (today)', type: 'entity', domain: 'sensor' },
      { key: 'consumption', label: 'Accumulative consumption (today)', type: 'entity', domain: 'sensor', section: 'kwh' },
      { key: 'peak_kwh', label: 'Peak consumption', type: 'entity', domain: 'sensor', section: 'split' },
      { key: 'offpeak_kwh', label: 'Off-peak consumption', type: 'entity', domain: 'sensor', section: 'split' },
      { key: 'prev_cost', label: 'Previous day cost', type: 'entity', domain: 'sensor', section: 'yesterday' },
      { key: 'export_kwh', label: 'Export today (kWh)', type: 'entity', domain: 'sensor', section: 'export' },
      { key: 'export_rate', label: 'Export rate', type: 'entity', domain: 'sensor' },
      { key: 'export_prev', label: 'Previous day export earnings', type: 'entity', domain: 'sensor' },
      { key: 'solar_kwh', label: 'Solar generated today', type: 'entity', domain: 'sensor', section: 'solar' },
    ],
  };
</script>

<script>
  import { t, ent } from '../lib/tpl.js';
  import { rateColor, ts, hm } from '../lib/octopus.js';
  // Home Assistant's own currency and number format (£1.27 / 18.2p, 1,27 kr / 18,2 öre).
  import { fmtMoney as money, fmtRate as pence, fmtNum } from '../lib/money.svelte.js';
  let { props } = $props();
  const show = (k) => !props.hide?.[k];
  let w = $state(400), h = $state(80);
  const n = (id) => { const v = Number(ent(id)?.state); return isNaN(v) ? null : v; };
  const costE = $derived(ent(props.cost));
  const charges = $derived((costE?.attributes.charges || []).map((c) => ({ start: ts(c.start), end: ts(c.end), kwh: c.consumption, cost: c.cost, rate: c.rate })));
  const maxKwh = $derived(Math.max(0.5, ...charges.map((c) => c.kwh)));
  const exportKwh = $derived(n(props.export_kwh));
  const exportEarn = $derived(exportKwh != null && n(props.export_rate) != null ? exportKwh * n(props.export_rate) : null);
  const cost = $derived(n(props.cost));
  const kwh = $derived(n(props.consumption));
  const avgRate = $derived(cost != null && kwh ? (costE.attributes.total_without_standing_charge ?? cost) / kwh : null);
  const peak = $derived(n(props.peak_kwh)), off = $derived(n(props.offpeak_kwh));
  const day0 = $derived(charges.length ? new Date(new Date(charges[0].start).toDateString()).getTime() : 0);
  const X = (tm) => ((tm - day0) / 864e5) * w;
  const latest = $derived(charges.length ? charges[charges.length - 1].end : null);
</script>

<div class="et">
  <div class="title">{t(props.title) || 'Electricity today'}{#if latest}<span class="dim">{' · '}to {hm(latest)}</span>{/if}</div>
  <div class="kpis">
    {#if show('cost')}<div><b>{money(cost)}</b><span>cost{#if costE?.attributes.standing_charge != null}{' ('}incl. {money(costE.attributes.standing_charge)} standing){/if}</span></div>{/if}
    {#if show('kwh')}<div><b>{fmtNum(kwh)}</b><span>kWh imported</span></div>{/if}
    {#if show('avg')}<div><b>{avgRate != null ? pence(avgRate) : '—'}</b><span>avg / kWh</span></div>{/if}
    {#if exportKwh != null && show('export')}<div class="exp"><b>{fmtNum(exportKwh)}</b><span>kWh exported{#if exportEarn != null}{' · '}{money(exportEarn)}{/if}</span></div>{/if}
    {#if props.solar_kwh && show('solar')}<div class="sol"><b>{fmtNum(n(props.solar_kwh))}</b><span>kWh solar</span></div>{/if}
    {#if props.prev_cost && show('yesterday')}<div><b>{money(n(props.prev_cost))}</b><span>yesterday{#if props.export_prev}{' · '}export {money(n(props.export_prev))}{/if}</span></div>{/if}
  </div>
  {#if peak != null && off != null && peak + off > 0 && show('split')}
    <div class="split"><div class="off" style="flex:{off}">{fmtNum(off)} off-peak</div><div class="pk" style="flex:{Math.max(peak, (peak + off) * 0.12)}">{fmtNum(peak)} peak</div></div>
  {/if}
  {#if show('chart')}<div class="chart" bind:clientWidth={w} bind:clientHeight={h}>
    <svg width={w} height={h}>
      {#each charges as c}
        <rect x={X(c.start)} y={h - 12 - (c.kwh / maxKwh) * (h - 14)} width={Math.max(1, X(c.end) - X(c.start) - 1.5)} height={(c.kwh / maxKwh) * (h - 14)} rx="2" fill={rateColor(c.rate)}><title>{hm(c.start)} {c.kwh} kWh · {pence(c.rate)}{' · '}{money(c.cost)}</title></rect>
      {/each}
      {#each [0, 6, 12, 18] as hr}<text x={X(day0 + hr * 36e5)} y={h} font-size="10" fill="currentColor" opacity=".5">{String(hr).padStart(2, '0')}</text>{/each}
    </svg>
  </div>{/if}
</div>

<style>
  .et { height: 100%; display: flex; flex-direction: column; gap: 10px; }
  .title { font-weight: 600; }
  .dim { color: var(--muted); font-weight: 400; font-size: .85em; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 6px; }
  .kpis div { background: rgba(255,255,255,.05); border-radius: 12px; padding: 8px 10px; display: flex; flex-direction: column; }
  .kpis b { font-size: 1.35em; }
  .kpis span { font-size: .72em; color: var(--muted); }
  .exp b { color: #4fd1d9; } .sol b { color: #ffc861; }
  .split { display: flex; height: 22px; border-radius: 8px; overflow: hidden; font-size: .72em; font-weight: 600; color: #000; }
  .split div { display: flex; align-items: center; padding: 0 8px; white-space: nowrap; overflow: hidden; }
  .off { background: #5bd88f; } .pk { background: #ff7a90; justify-content: flex-end; }
  .chart { flex: 1; min-height: 40px; position: relative; }
  svg { position: absolute; inset: 0; }
</style>
