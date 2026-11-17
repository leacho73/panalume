<script>
  // Screensaver: after this device's "Screensaver after" minutes without a touch
  // (or ?saver=N in the address), the dashboard is covered by a dim clock, or a
  // photo slideshow from Home Assistant's media with the clock over it. The clock
  // drifts a little each minute so it doesn't burn into the screen. A tap brings
  // the dashboard back, and that tap doesn't reach the cards underneath.
  import PhotoFrame from '../cards/PhotoFrame.svelte';
  import { app } from '../lib/config.svelte.js';
  import { param } from '../lib/params.js';

  const saverParam = Number(param('saver'));
  const L = $derived(app.config?.layouts[app.device] || {});
  const mins = $derived(saverParam > 0 ? saverParam : Math.max(0, Number(L.saver_mins) || 0));
  let on = $state(false);
  let lastTouch = Date.now();
  let wokeAt = 0;
  for (const ev of ['pointerdown', 'keydown', 'wheel']) addEventListener(ev, () => (lastTouch = Date.now()), { capture: true, passive: true });
  $effect(() => {
    if (!mins || app.editing) { on = false; return; }
    const i = setInterval(() => { if (Date.now() - lastTouch >= mins * 60e3) on = true; }, 5e3);
    return () => clearInterval(i);
  });
  function wake(e) {
    e.preventDefault(); e.stopPropagation();
    on = false; wokeAt = performance.now(); lastTouch = Date.now();
  }
  // The click that follows the waking tap would otherwise land on a card.
  const swallow = (e) => { if (performance.now() - wokeAt < 600) { e.preventDefault(); e.stopPropagation(); } };

  let now = $state(new Date());
  let spot = $state({ x: 50, y: 50 });
  $effect(() => {
    if (!on) return;
    const tick = () => {
      now = new Date();
      spot = { x: 30 + Math.random() * 40, y: 30 + Math.random() * 40 };
    };
    tick();
    // On the minute, then every minute.
    let i;
    const first = setTimeout(() => { tick(); i = setInterval(tick, 60e3); }, 60e3 - (Date.now() % 60e3) + 50);
    return () => { clearTimeout(first); clearInterval(i); };
  });
  // The time in the viewer's own format, with AM / PM (if any) set smaller.
  const parts = $derived(new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).formatToParts(now));
  const time = $derived(parts.filter((x) => x.type !== 'dayPeriod').map((x) => x.value).join('').trim());
  const ampm = $derived(parts.find((x) => x.type === 'dayPeriod')?.value || '');
  const date = $derived(now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }));
</script>

<svelte:window onclickcapture={swallow} />

{#if on}
  <div class="saver" class:photos={!!L.saver_photos} role="presentation" onpointerdown={wake} onkeydown={wake}>
    {#if L.saver_photos}
      <div class="pf"><PhotoFrame props={{ folder: L.saver_photos, subfolders: true, interval: 20, order: 'shuffle', fit: 'cover', zoom: true }} /></div>
    {/if}
    {#if !L.saver_photos || !L.saver_no_clock}
      <div class="clk" style:left="{spot.x}%" style:top="{spot.y}%">
        <div class="time">{time}{#if ampm}<small>{ampm}</small>{/if}</div>
        <div class="date">{date}</div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .saver { position: fixed; inset: 0; z-index: 980; background: #000; color: rgba(255,255,255,.55); cursor: none; animation: fade 1.2s ease; touch-action: none; }
  .pf { position: absolute; inset: 0; }
  .clk { position: absolute; transform: translate(-50%, -50%); text-align: center; transition: left 2s ease, top 2s ease; pointer-events: none; }
  .photos .clk { left: auto !important; top: auto !important; right: 4vw; bottom: 5vh; transform: none; text-align: right; color: rgba(255,255,255,.9); text-shadow: 0 2px 12px rgba(0,0,0,.6); }
  .time { font-size: clamp(64px, 14vw, 200px); font-weight: 200; letter-spacing: -.03em; line-height: 1; font-variant-numeric: tabular-nums; }
  .time { white-space: nowrap; }
  .time small { font-size: .3em; font-weight: 300; margin-left: .25em; letter-spacing: 0; }
  .photos .time { font-size: clamp(44px, 7vw, 110px); }
  .date { font-size: clamp(16px, 2vw, 28px); margin-top: 8px; opacity: .8; }
  @keyframes fade { from { opacity: 0; } }
</style>
