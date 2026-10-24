<script module>
  import { states } from '../lib/ha.svelte.js';
  import { SIZES } from '../lib/propane.js';
  // Finds a Mopeka tank (Mopeka Enhanced integration): its "Tank fill" % sensor
  // and the sensors next to it, named after the device (sensor.<device>_tank_fill,
  // _tank_preset, _tank_volume_remaining, _battery, _temperature, _reading_quality).
  // Prefers one whose medium is propane.
  function autofill() {
    const fills = [...states.keys()].filter((id) => /^sensor\.[a-z0-9_]+_tank_fill$/.test(id)).sort();
    const p = (id) => id.replace(/_tank_fill$/, '');
    const pick = fills.find((id) => states.get(`${p(id)}_medium_type`)?.state === 'propane') || fills[0];
    if (!pick) return {};
    const has = (s) => (states.has(`${p(pick)}_${s}`) ? `${p(pick)}_${s}` : '');
    return {
      entity: pick, preset: has('tank_preset'), volume: has('tank_volume_remaining'),
      battery: has('battery'), temperature: has('temperature'), quality: has('reading_quality'),
    };
  }
  export const meta = {
    type: 'propane', name: 'Propane tank', icon: 'mdi:propane-tank', category: 'Info',
    size: { w: 320, h: 220 }, tap: 'more-info', hold: 'more-info',
    defaults: { size: 'auto', green: 50, red: 25 },
    autofill,
    sections: [
      { key: 'picture', label: 'Tank' }, { key: 'amount', label: 'Amount left' }, { key: 'battery', label: 'Battery', section: 'battery' },
      { key: 'temperature', label: 'Temperature', section: 'temperature' }, { key: 'quality', label: 'Reading quality', section: 'quality' },
    ],
    fields: [
      { key: 'entity', label: 'Tank fill (%)', type: 'entity', domain: 'sensor' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'size', label: 'Tank size', type: 'select', options: SIZES },
      { key: 'preset', label: 'Tank preset sensor (used when the size is "From the tank preset sensor")', type: 'entity', domain: 'sensor' },
      { key: 'green', label: 'Green at or above (%)', type: 'number' },
      { key: 'red', label: 'Red below (%), yellow in between', type: 'number' },
      { key: 'volume', label: 'Volume remaining (optional, otherwise worked out from the size)', type: 'entity', domain: 'sensor', section: 'amount' },
      { key: 'battery', label: 'Battery (optional)', type: 'entity', domain: 'sensor', section: 'battery' },
      { key: 'temperature', label: 'Temperature (optional)', type: 'entity', domain: 'sensor', section: 'temperature' },
      { key: 'quality', label: 'Reading quality (optional)', type: 'entity', domain: 'sensor', section: 'quality' },
    ],
  };
</script>

<script>
  // Propane tank: a picture of the tank (upright cylinder, horizontal tank or RV
  // ASME tank, shaped for its size) filled to the level, green / yellow / red at
  // the card's thresholds, with the % and what's left in lb, kg or gallons.
  // Works with any fill % sensor; made for Mopeka sensors (lib/propane.js).
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { pickTank, band, liquidHeight, amountLeft, fmtAmount, stars } from '../lib/propane.js';
  let { props, w = 320, h = 220 } = $props();
  const show = (k) => !props.hide?.[k];
  const COLORS = { high: '#5bd88f', mid: '#ffc861', low: '#ff6b6b' };
  const WORDS = { high: 'High', mid: 'Medium', low: 'Low' };

  const fe = $derived(ent(props.entity));
  const offline = $derived(!!fe && /^(unavailable|unknown)$/.test(String(fe.state)));
  const q = $derived(stars(ent(props.quality)?.state));
  // Mopeka Enhanced reads the tank as empty while the reading is 0–1 stars, so don't show that 0% as a level.
  const weak = $derived(q != null && q <= 1);
  const pct = $derived.by(() => { const v = Number(fe?.state); return Number.isFinite(v) && !offline && !weak ? Math.min(100, Math.max(0, v)) : NaN; });
  const known = $derived(Number.isFinite(pct));
  const tank = $derived(pickTank(props.size, ent(props.preset)?.state));
  const lvl = $derived(band(pct, props.green, props.red));
  const color = $derived(lvl ? COLORS[lvl] : '#4a5263');

  // Amounts: the cylinder's lb / kg (or the tank's gallons), plus the volume sensor's reading if there is one.
  const num = (id) => { const v = Number(ent(id)?.state); return Number.isFinite(v) ? v : null; };
  const left = $derived(amountLeft(pct, tank));
  const volume = $derived.by(() => {
    const v = num(props.volume);
    if (v == null) return null;
    const u = String(ent(props.volume)?.attributes.unit_of_measurement || 'gal').replace(/^L$/, 'l');
    return { value: v, unit: u };
  });
  const amountLine = $derived.by(() => {
    if (!known) return '';
    const parts = [];
    if (left && tank.amount) parts.push(`${fmtAmount(left.value, left.unit)} of ${fmtAmount(tank.amount.value, tank.amount.unit)}`);
    if (volume && !(left && left.unit === volume.unit)) parts.push(fmtAmount(volume.value, volume.unit));
    if (!parts.length && tank.gal) parts.push(fmtAmount((pct / 100) * tank.gal, 'gal'));
    return parts.join(' · ');
  });

  const battery = $derived(num(props.battery));
  const temp = $derived(num(props.temperature));
  const tempUnit = $derived(ent(props.temperature)?.attributes.unit_of_measurement || '');
  const status = $derived(!props.entity ? 'No sensor' : !fe || offline ? 'Offline' : weak ? 'Weak reading' : pct <= 0 ? 'Empty' : WORDS[lvl] || '—');

  // ---- picture ----
  const uid = Math.random().toString(36).slice(2, 8);
  const lying = $derived(tank.shape !== 'v');
  // Upright: 100 wide; collar (22) + body + foot ring (8). Lying: 100 high (+ dome and legs), length by aspect.
  const geo = $derived.by(() => {
    if (!lying) {
      const BH = 80 * tank.aspect, CH = 22, FH = 8;
      return { vw: 100, vh: CH + BH + FH, x: 10, y: CH, bw: 80, bh: BH, rx: 40, ry: Math.min(24, BH * 0.2), CH, FH };
    }
    const L = 100 * tank.aspect, top = tank.shape === 'h' ? 14 : 6, legs = tank.shape === 'h' ? 16 : 6;
    return { vw: L + 8, vh: top + 100 + legs, x: 4, y: top, bw: L, bh: 100, rx: 34, ry: 50, legs };
  });
  const inset = 3;
  const inner = $derived({ x: geo.x + inset, y: geo.y + inset, w: geo.bw - 2 * inset, h: geo.bh - 2 * inset, rx: Math.max(0, geo.rx - inset), ry: Math.max(0, geo.ry - inset) });
  // Fraction of the inner height the liquid stands at: linear upright, circular segment lying down.
  const fill = $derived(known ? (lying ? liquidHeight(pct / 100) : pct / 100) : 0);
  const ticks = $derived([0.25, 0.5, 0.75].map((f) => inner.y + (1 - (lying ? liquidHeight(f) : f)) * inner.h));

  // Picture size: as tall as the card allows, without taking more than ~45% of the width.
  const pad = 20;
  const box = $derived.by(() => {
    const r = geo.vh / geo.vw;
    let bw = Math.min(w * (lying ? 0.46 : 0.42), (h - pad) / r);
    return { w: Math.max(36, bw), h: Math.max(36, bw) * r };
  });
  const short = $derived(h < 150);
  // Narrow cards (phones, two per row): the colour already says high / medium / low, so the chip only shows for problems.
  const narrow = $derived(w < 230);
</script>

<div class="pt" class:short class:narrow style="--lc:{color}">
  {#if show('picture')}
    <div class="pic" style="width:{box.w}px;height:{box.h}px">
      <svg viewBox="0 0 {geo.vw} {geo.vh}" role="img" aria-label="{t(props.name) || 'Propane'} {known ? Math.round(pct) + '%' : weak ? 'no clear reading' : 'unknown'}">
        <defs>
          <clipPath id="in{uid}"><rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} rx={inner.rx} ry={inner.ry} /></clipPath>
          <linearGradient id="sh{uid}" x1="0" y1="0" x2={lying ? 0 : 1} y2={lying ? 1 : 0}>
            <stop offset="0" stop-color="#fff" stop-opacity=".16" /><stop offset=".35" stop-color="#fff" stop-opacity=".04" />
            <stop offset=".7" stop-color="#000" stop-opacity="0" /><stop offset="1" stop-color="#000" stop-opacity=".28" />
          </linearGradient>
        </defs>

        {#if !lying}
          <!-- collar with hand holes and the valve, foot ring -->
          <rect x="22" y="2" width="56" height={geo.CH + 8} rx="9" class="metal" />
          <ellipse cx="36" cy="11" rx="7" ry="4" class="hole" /><ellipse cx="64" cy="11" rx="7" ry="4" class="hole" />
          <rect x="45" y="6" width="10" height={geo.CH - 2} rx="2" class="valve" /><circle cx="50" cy="8" r="5" class="valve" />
          <rect x="18" y={geo.y + geo.bh - 6} width="64" height={geo.FH + 6} rx="3" class="metal" />
        {:else if tank.shape === 'h'}
          <!-- dome over the valves, two saddle legs -->
          <path d="M{geo.x + geo.bw / 2 - 16} {geo.y + 4} a16 14 0 0 1 32 0 z" class="metal" />
          {#each [0.24, 0.76] as f}<path d="M{geo.x + geo.bw * f - 10} {geo.y + geo.bh - 8} h20 l5 {geo.legs + 6} h-30 z" class="metal" />{/each}
        {:else}
          <!-- RV ASME tank: valve at one end, mounting straps -->
          <rect x={geo.x + geo.bw - 26} y="1" width="12" height="10" rx="2" class="valve" />
        {/if}

        <rect x={geo.x} y={geo.y} width={geo.bw} height={geo.bh} rx={geo.rx} ry={geo.ry} class="body" />
        <g clip-path="url(#in{uid})">
          <g class="liq" class:low={lvl === 'low'} style="transform:translateY({(1 - fill) * inner.h}px)">
            <rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} class="lq" />
            <rect x={inner.x} y={inner.y - 1.5} width={inner.w} height="3" class="surf" />
          </g>
          {#each ticks as y, i}<line x1={inner.x + inner.w * (lying ? 0.8 : 0.72)} x2={inner.x + inner.w * (lying ? 0.87 : 0.9)} y1={y} y2={y} class="tk" class:mid={i === 1} />{/each}
          <rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} fill="url(#sh{uid})" />
        </g>
        {#if tank.shape === 'asme'}{#each [0.2, 0.8] as f}<rect x={geo.x + geo.bw * f - 3} y={geo.y - 2} width="6" height={geo.bh + 4} rx="1.5" class="strap" />{/each}{/if}
      </svg>
    </div>
  {/if}

  <div class="info">
    <div class="top">
      <span class="name"><Icon icon={meta.icon} size="1.1em" />{t(props.name) || 'Propane'}</span>
      {#if !narrow || !known}<span class="chip" class:high={known && !weak && lvl === 'high'} class:mid={known && !weak && lvl === 'mid'} class:low={known && !weak && lvl === 'low'} class:warn={weak} class:off={!known && !weak}>{status}</span>{/if}
    </div>

    {#if !props.entity}
      <div class="hint">Pick the tank's fill % sensor in the card's settings.</div>
    {:else}
      <div class="lvl"><b>{known ? Math.round(pct) + '%' : '—'}</b>{#if show('amount') && amountLine && !short}<span>{amountLine} left</span>{/if}</div>
      {#if show('amount') && amountLine && short}<div class="sub">{amountLine} left</div>{/if}
      {#if weak}<div class="sub">No clear reading from the sensor yet</div>{/if}
      <div class="chips">
        {#if show('battery') && battery != null}<span><Icon icon={battery > 60 ? 'mdi:battery-high' : battery > 25 ? 'mdi:battery-medium' : 'mdi:battery-low'} size="1em" />{Math.round(battery)}%</span>{/if}
        {#if show('temperature') && temp != null}<span><Icon icon="mdi:thermometer" size="1em" />{Math.round(temp)}{tempUnit}</span>{/if}
        {#if show('quality') && q != null}<span class:warn={weak} title={weak ? 'The sensor can’t get a clear echo, so the integration reads the tank as empty until it does' : 'Reading quality'}>
          <Icon icon="mdi:signal" size="1em" />{#each [1, 2, 3] as s}<i class:on={q >= s}>★</i>{/each}</span>{/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .pt { height: 100%; display: flex; gap: 16px; align-items: center; }
  .pic { flex: none; display: grid; place-items: center; }
  .pic svg { width: 100%; height: 100%; display: block; overflow: visible; }
  .body { fill: #1d2230; stroke: #4a5263; stroke-width: 2.5; }
  .metal { fill: #2a3140; stroke: #4a5263; stroke-width: 2; }
  .hole { fill: #10141d; }
  .valve { fill: #3a4254; stroke: #586174; stroke-width: 1.5; }
  .strap { fill: #2a3140; stroke: #586174; stroke-width: 1.2; }
  .liq { transition: transform .8s ease; }
  .lq { fill: var(--lc); opacity: .9; transition: fill .4s; }
  .surf { fill: #fff; opacity: .28; }
  .liq.low { animation: pulse 2.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .65; } }
  @media (prefers-reduced-motion: reduce) { .liq { transition: none; } .liq.low { animation: none; } }
  .tk { stroke: rgba(255,255,255,.22); stroke-width: 1.5; }
  .tk.mid { stroke: rgba(255,255,255,.32); }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .top { display: flex; align-items: center; gap: 8px; }
  .name { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .name :global(svg) { color: var(--lc); flex: none; }
  .chip { flex: none; font-size: .75em; font-weight: 600; padding: 3px 9px; border-radius: 10px; background: rgba(255,255,255,.07); color: var(--muted); }
  .chip.high { background: rgba(91,216,143,.16); color: #5bd88f; }
  .chip.mid { background: rgba(255,200,97,.16); color: #ffc861; }
  .chip.low { background: rgba(255,107,107,.18); color: #ff6b6b; }
  .chip.warn { background: rgba(255,200,97,.16); color: #ffc861; }
  .chip.off { background: rgba(255,255,255,.07); color: var(--muted); }
  .lvl { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .lvl b { font-size: 2em; font-weight: 600; letter-spacing: -.02em; line-height: 1; color: var(--lc); font-variant-numeric: tabular-nums; }
  .lvl span, .sub { color: var(--muted); font-size: .85em; }
  .hint { color: var(--muted); font-size: .85em; }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; margin-left: -8px; } /* chip text lines up with the text above */
  .chips span { display: inline-flex; align-items: center; gap: 4px; font-size: .75em; padding: 3px 8px; border-radius: 9px; background: rgba(255,255,255,.06); }
  .chips span.warn { background: rgba(255,200,97,.14); color: #ffc861; }
  .chips i { font-style: normal; color: rgba(255,255,255,.2); margin-left: -2px; }
  .chips i.on { color: #ffc861; }
  .narrow { gap: 10px; }
  .narrow .name :global(svg) { display: none; }
  .short { gap: 12px; }
  .short .info { gap: 3px; }
  .short .lvl b { font-size: 1.5em; }
  .short .chips { max-height: calc(.9em + 8px); overflow: hidden; }
</style>
