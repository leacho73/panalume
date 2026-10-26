<script>
  // Lightweight SVG line/area chart. series: [{ points: [[t, v]], color, curve? }]
  // curve: 'smooth' | 'straight' | 'step' (each series can differ; default from `smooth`).
  let { series = [], hours = 24, fill = true, smooth = true, showAxis = false, strokeWidth = 2.5, min: fixedMin, max: fixedMax } = $props();
  let w = $state(300), h = $state(100);
  const uid = Math.random().toString(36).slice(2, 8);
  const end = $derived(series.length >= 0 ? Date.now() : 0);
  const start = $derived(end - hours * 3600e3);
  const range = $derived.by(() => {
    let lo = Infinity, hi = -Infinity;
    for (const s of series) for (const [, v] of s.points) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (fixedMin !== undefined && fixedMin !== '') lo = Number(fixedMin);
    if (fixedMax !== undefined && fixedMax !== '') hi = Number(fixedMax);
    if (!isFinite(lo)) return [0, 1];
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.08;
    return [lo - pad, hi + pad];
  });
  const X = (t) => ((t - start) / (end - start)) * w;
  const Y = (v) => h - ((v - range[0]) / (range[1] - range[0])) * h;

  function path(points, curve) {
    // Step-hold then (optionally) smooth; downsample to ~1 point per 2px.
    const pts = [];
    let lastX = -Infinity;
    for (const [t, v] of points) {
      if (t < start) { pts[0] = [0, Y(v)]; continue; }
      const x = X(t);
      if (x - lastX < 2 && pts.length) pts[pts.length - 1] = [x, Y(v)];
      else pts.push([x, Y(v)]);
      lastX = x;
    }
    if (pts.length === 1) pts.push([w, pts[0][1]]);
    if (!pts.length) return '';
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = pts[i];
      const [px, py] = pts[i - 1];
      if (curve === 'step') d += `L${x.toFixed(1)},${py.toFixed(1)}L${x.toFixed(1)},${y.toFixed(1)}`;
      else if (curve === 'smooth') {
        const cx = (px + x) / 2;
        d += `C${cx.toFixed(1)},${py.toFixed(1)} ${cx.toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
      } else d += `L${x.toFixed(1)},${y.toFixed(1)}`;
    }
    return d;
  }
</script>

<div class="chart" bind:clientWidth={w} bind:clientHeight={h}>
  <svg width={w} height={h} viewBox="0 0 {w} {h}" preserveAspectRatio="none">
    <defs>
      {#each series as s, i}
        <linearGradient id="g{uid}{i}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" style="stop-color:{s.color};stop-opacity:.35" />
          <stop offset="1" style="stop-color:{s.color};stop-opacity:0" />
        </linearGradient>
      {/each}
    </defs>
    {#each series as s, i}
      {@const d = path(s.points, s.curve || (smooth ? 'smooth' : 'straight'))}
      {#if d}
        {#if fill}<path d="{d}L{w},{h}L0,{h}Z" fill="url(#g{uid}{i})" />{/if}
        <path {d} fill="none" style="stroke:{s.color}" stroke-width={strokeWidth} stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
      {/if}
    {/each}
  </svg>
  {#if showAxis}
    <span class="ax top">{range[1].toFixed(range[1] - range[0] < 10 ? 1 : 0)}</span>
    <span class="ax bot">{range[0].toFixed(range[1] - range[0] < 10 ? 1 : 0)}</span>
  {/if}
</div>

<style>
  .chart { position: relative; width: 100%; height: 100%; min-height: 20px; }
  svg { position: absolute; inset: 0; overflow: visible; }
  .ax { position: absolute; right: 0; font-size: 10px; color: var(--muted); }
  .top { top: 0; } .bot { bottom: 0; }
</style>
