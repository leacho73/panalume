<script>
  // Washing machine / tumble dryer / dishwasher: a porthole (or rack) that
  // animates while running, ringed by programme progress; time left and the
  // clock time it'll finish, programme and phase, settings, alerts and controls.
  import Icon from './Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { callService } from '../lib/ha.svelte.js';
  import { clock } from '../lib/clock.svelte.js';
  import { hm, day } from '../lib/octopus.js';
  import { KINDS } from '../lib/appliance.js';
  let { kind, props, w = 420, h = 220 } = $props();
  const K = KINDS[kind];
  const show = (k) => !props.hide?.[k];
  const now = $derived(clock.now);

  const se = $derived(ent(props.state));
  const raw = $derived(String(se?.state ?? '').toLowerCase());
  const phaseRaw = $derived(String(ent(props.phase)?.state ?? '').toLowerCase());
  const paused = $derived(raw === 'pause' || raw === 'paused' || ent(props.paused)?.state === 'on' && raw !== 'off');
  const delayed = $derived(/delay/.test(raw) || phaseRaw === 'delay_wash');
  const finished = $derived(/finish|end|done|complete/.test(raw) || phaseRaw === 'finish');
  const error = $derived(/error|fault|actionrequired/.test(raw));
  // A smart plug's own draw (or a machine left on) isn't running: with "Running only above",
  // the power has to be over it too, and with no status entity the power alone decides.
  const watts = $derived(Number(ent(props.power)?.state));
  const minW = $derived(Number(props.running_above) || 0);
  const overMin = $derived(!minW || !Number.isFinite(watts) || watts > minW);
  const running = $derived(!paused && !finished && !error && !delayed && (se ? /^(on|run|running|active|true|wash|rinse|spin|drying|dry|cooling|aborting)$/.test(raw) && overMin : !!minW && Number.isFinite(watts) && watts > minW));
  const active = $derived(running || paused || delayed);

  const ms = (v) => (v == null ? NaN : typeof v === 'number' ? v * 1000 : Date.parse(v));
  const finishAt = $derived.by(() => {
    const rem = Number(ent(props.remaining)?.state);
    if (active && Number.isFinite(rem) && rem > 0) return now + rem * 60e3;
    const f = ms(ent(props.finish)?.state);
    return Number.isFinite(f) ? f : NaN;
  });
  const startedAt = $derived(ms(se?.last_changed));
  const progress = $derived.by(() => {
    if (finished) return 100;
    const p = Number(ent(props.progress)?.state);
    if (active && Number.isFinite(p)) return Math.max(0, Math.min(100, p));
    if (running && Number.isFinite(finishAt) && Number.isFinite(startedAt) && finishAt > startedAt) return Math.max(2, Math.min(99, ((now - startedAt) / (finishAt - startedAt)) * 100));
    return 0;
  });
  const left = $derived.by(() => {
    if (!active || !Number.isFinite(finishAt)) return null;
    const m = Math.max(0, Math.round((finishAt - now) / 60e3));
    return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m} min`;
  });

  const PHASES = { weight_sensing: 'Weighing', pre_wash: 'Pre-wash', ai_wash: 'Washing', wash: 'Washing', ai_rinse: 'Rinsing', rinse: 'Rinsing', ai_spin: 'Spinning', spin: 'Spinning', drying: 'Drying', cooling: 'Cooling', wrinkle_prevent: 'Anti-crease', air_wash: 'Air wash', freeze_protection: 'Frost protection', delay_wash: 'Delayed start' };
  const phase = $derived(PHASES[phaseRaw] || (phaseRaw && !/^(none|unknown|unavailable|finish|\d+)$/.test(phaseRaw) ? phaseRaw.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : ''));
  const spinning = $derived(running && /spin/.test(phaseRaw));
  const program = $derived.by(() => {
    const s = ent(props.program)?.state;
    if (!s || /^(unknown|unavailable|none|no program)$/i.test(s)) return '';
    return s.replace(/^.*program(me)?_/i, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  });
  const status = $derived(error ? 'Needs attention' : paused ? 'Paused' : delayed ? 'Delayed start' : running ? (phase || 'Running') : finished ? 'Finished' : /ready/.test(raw) ? 'Ready' : raw === 'off' || raw === 'inactive' || raw === 'stop' ? 'Off' : se || minW ? 'Idle' : '—');

  const devName = $derived(t(props.name) || K.name);
  const label = (id) => {
    const f = ent(id)?.attributes.friendly_name || id;
    const n = (t(props.name) || '').trim();
    return (n && f.startsWith(n) ? f.slice(n.length) : f).replace(/^[\s:-]+/, '').trim() || f;
  };
  const optVal = (id) => {
    const e = ent(id);
    const v = String(e?.state ?? '');
    if (/^(none|unknown|unavailable)$/i.test(v)) return '';
    const u = e?.attributes.unit_of_measurement;
    return v.replace(/_/g, ' ') + (u ? ' ' + u : '');
  };
  const isOn = (s) => /^(on|true|present|confirmed|open|detected|problem|low)$/i.test(String(s ?? ''));
  const doorOpen = $derived(/^(on|open)$/i.test(String(ent(props.door)?.state ?? '')));
  const alerts = $derived([
    ...(active && doorOpen ? [['Door open', 'mdi:door-open']] : []),
    ...(props.alerts || []).filter((id) => isOn(ent(id)?.state)).map((id) => [label(id).replace(/\s*nearly empty$/i, ' low'), 'mdi:alert-circle-outline']),
  ]);
  const leaking = $derived(ent(props.leak)?.state === 'on');

  // Controls: a select with run / pause / stop options (SmartThings), or a stop button (Home Connect).
  const ctl = $derived(ent(props.control));
  const ctlOpts = $derived((ctl?.attributes.options || []).map((o) => String(o)));
  const pick = (o) => callService(props.control.split('.')[0], 'select_option', { option: o }, { entity_id: props.control });
  const find = (re) => ctlOpts.find((o) => re.test(o));

  // The drum turns by adding up its angle each frame rather than with a CSS
  // animation, so it never jumps back to the start and eases between speeds
  // (once round in 3 s, or every half second on spin).
  let drum = $state();
  let angle = 0;
  $effect(() => {
    if (!drum || !running) return;
    let speed = 0, last = performance.now(), raf;
    const tick = (t) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      speed += ((spinning ? 720 : 120) - speed) * Math.min(1, dt * 2.5);
      angle = (angle + speed * dt) % 360;
      drum.setAttribute('transform', `rotate(${angle.toFixed(1)} 60 60)`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  // Ring
  const R = 46, C = 2 * Math.PI * R;
  const uid = Math.random().toString(36).slice(2, 8);
  const size = $derived(Math.max(80, Math.min(h - 40, w * 0.4, 170)));
</script>

<div class="ap {kind}" class:running class:active style="--k:{K.color}">
  {#if show('picture')}
    <div class="pic" style="width:{size}px;height:{size}px">
      <svg viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={R} class="track" />
        <circle cx="60" cy="60" r={R} class="arc" style="stroke-dasharray:{C};stroke-dashoffset:{C * (1 - progress / 100)}" />
        {#if kind === 'dishwasher'}
          <g class="rack">
            <rect x="32" y="34" width="56" height="52" rx="8" class="body" />
            {#each [44, 54, 64, 74] as x}<ellipse cx={x} cy="66" rx="4" ry="13" class="plate" />{/each}
            {#if running}{#each [[40, 0], [52, .3], [64, .6], [76, .15], [46, .45], [70, .75]] as [x, d]}<circle cx={x} cy="46" r="1.8" class="drop" style="animation-delay:{d}s" />{/each}{/if}
          </g>
        {:else}
          <circle cx="60" cy="60" r="34" class="door" />
          <clipPath id="clip{uid}"><circle cx="60" cy="60" r="32" /></clipPath>
          <g clip-path="url(#clip{uid})">{#if kind === 'washer' && active}<path d="M20 66 Q32 60 44 66 T68 66 T92 66 T116 66 L116 100 L20 100Z" class="water" class:wave={running} />{/if}<g class="drum" bind:this={drum}>
            <circle cx="48" cy="70" r="7" class="cloth c1" /><circle cx="66" cy="74" r="8" class="cloth c2" /><circle cx="58" cy="48" r="6" class="cloth c3" />
          </g></g>
          <circle cx="60" cy="60" r="34" class="glass" />
        {/if}
        {#if finished}<circle cx="60" cy="60" r="14" class="done" /><path d="M53 60 l5 5 l9 -10" class="tick" />{/if}
      </svg>
    </div>
  {/if}

  <div class="info">
    <div class="top">
      <span class="name"><Icon icon={K.icon} size="1.1em" />{devName}</span>
      <span class="chip" class:on={running} class:warn={paused || delayed} class:bad={error} class:ok={finished}>{status}</span>
    </div>
    {#if show('program') && (program || (phase && !running))}<div class="prog">{program}{program && phase && !running ? ' · ' : ''}{!running ? phase : ''}</div>{/if}

    {#if show('time')}
      {#if left}
        <div class="left"><b>{left}</b><span>left · done {day(finishAt, now) === 'Today' ? '' : day(finishAt, now) + ' '}{hm(finishAt)}</span></div>
      {:else if finished && Number.isFinite(finishAt)}
        <div class="left dim"><span>Finished {day(finishAt, now) === 'Today' ? '' : day(finishAt, now) + ' '}{hm(finishAt)}</span></div>
      {:else if !active && Number.isFinite(finishAt) && finishAt < now && now - finishAt < 7 * 864e5}
        <div class="left dim"><span>Last finished {day(finishAt, now) === 'Today' ? 'today' : day(finishAt, now)} {hm(finishAt)}</span></div>
      {/if}
      {#if active && Number.isFinite(Number(ent(props.progress)?.state))}<div class="bar"><i style="width:{progress}%"></i></div>{/if}
    {/if}

    {#if show('options') || show('power')}
      <div class="chips">
        {#if show('options')}{#each (props.options || []).filter((id) => optVal(id)) as id}<span><small>{label(id)}</small>{optVal(id)}</span>{/each}{/if}
        {#if show('power') && running && Number.isFinite(watts) && watts > 0}<span><Icon icon="mdi:flash" size="1em" />{watts >= 1000 ? (watts / 1000).toFixed(1) + ' kW' : Math.round(watts) + ' W'}</span>{/if}
      </div>
    {/if}

    {#if show('alerts') && (leaking || alerts.length)}
      <div class="alerts">
        {#if leaking}<span class="leak"><Icon icon="mdi:water-alert" size="1em" />Leak detected</span>{/if}
        {#each alerts as [txt, icon]}<span><Icon {icon} size="1em" />{txt}</span>{/each}
      </div>
    {/if}

    {#if show('controls') && active && ((ctl && ctlOpts.length) || props.stop)}
      <div class="ctl" data-stop>
        {#if ctl}
          {#if running && find(/^pause$/i)}<button onclick={() => pick(find(/^pause$/i))}><Icon icon="mdi:pause" size="1.1em" />Pause</button>{/if}
          {#if paused && find(/^(run|start|resume)$/i)}<button class="go" onclick={() => pick(find(/^(run|start|resume)$/i))}><Icon icon="mdi:play" size="1.1em" />Resume</button>{/if}
          {#if active && find(/^stop$/i)}<button class="stop" onclick={() => confirm(`Stop the ${K.name.toLowerCase()}?`) && pick(find(/^stop$/i))}><Icon icon="mdi:stop" size="1.1em" />Stop</button>{/if}
        {:else if props.stop && active}
          <button class="stop" onclick={() => confirm(`Stop the ${K.name.toLowerCase()}?`) && callService('button', 'press', {}, { entity_id: props.stop })}><Icon icon="mdi:stop" size="1.1em" />Stop</button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .ap { height: 100%; display: flex; gap: 16px; align-items: center; }
  .pic { flex: none; }
  .pic svg { width: 100%; height: 100%; display: block; }
  .track { fill: none; stroke: rgba(255,255,255,.08); stroke-width: 7; }
  .arc { fill: none; stroke: var(--k); stroke-width: 7; stroke-linecap: round; transform: rotate(-90deg); transform-origin: 60px 60px; transition: stroke-dashoffset 1s; filter: drop-shadow(0 0 4px color-mix(in srgb, var(--k) 60%, transparent)); }
  .door { fill: #1d2230; stroke: #4a5263; stroke-width: 3; }
  .glass { fill: rgba(255,255,255,.06); stroke: rgba(255,255,255,.15); stroke-width: 1; pointer-events: none; }
  .water { fill: rgba(79,180,255,.45); }
  .water.wave { animation: wave 2.4s ease-in-out infinite alternate; }
  @keyframes wave { to { transform: translateX(-24px); } }
  .cloth { opacity: .85; }
  .c1 { fill: #ff7a90; } .c2 { fill: #ffc861; } .c3 { fill: #b48cff; }
  .dryer .door { fill: #2a1f1c; }
  .dryer.running .door { fill: #3a2418; }
  .body { fill: #1d2230; stroke: #4a5263; stroke-width: 2; }
  .plate { fill: rgba(255,255,255,.75); }
  .drop { fill: #7fd8ff; animation: drop 1s ease-in infinite; }
  @keyframes drop { from { transform: translateY(0); opacity: 1; } to { transform: translateY(26px); opacity: 0; } }
  .done { fill: var(--k); }
  .tick { fill: none; stroke: #0b0f16; stroke-width: 3.5; stroke-linecap: round; stroke-linejoin: round; }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .top { display: flex; align-items: center; gap: 8px; }
  .name { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .name :global(svg) { color: var(--k); flex: none; }
  .chip { flex: none; font-size: .75em; font-weight: 600; padding: 3px 9px; border-radius: 10px; background: rgba(255,255,255,.07); color: var(--muted); }
  .chip.on { background: color-mix(in srgb, var(--k) 20%, transparent); color: var(--k); }
  .chip.warn { background: rgba(255,200,97,.16); color: #ffc861; }
  .chip.bad { background: rgba(255,122,144,.18); color: #ff7a90; }
  .chip.ok { background: rgba(91,216,143,.16); color: #5bd88f; }
  .prog { color: var(--muted); font-size: .85em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .left { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .left b { font-size: 1.45em; font-weight: 600; letter-spacing: -.02em; line-height: 1.05; }
  .left span { color: var(--muted); font-size: .85em; }
  .left.dim span { font-size: .85em; }
  .bar { height: 5px; border-radius: 3px; background: rgba(255,255,255,.08); overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--k); border-radius: 3px; transition: width 1s; }
  .chips, .alerts { display: flex; flex-wrap: wrap; gap: 5px; margin-left: -8px; } /* chip text lines up with the text above */
  .chips span { display: inline-flex; align-items: center; gap: 4px; font-size: .75em; padding: 3px 8px; border-radius: 9px; background: rgba(255,255,255,.06); }
  .chips small { color: var(--muted); font-size: 1em; }
  .alerts span { display: inline-flex; align-items: center; gap: 4px; font-size: .75em; font-weight: 600; padding: 3px 8px; border-radius: 9px; background: rgba(255,200,97,.14); color: #ffc861; }
  .alerts .leak { background: rgba(255,90,110,.22); color: #ff7a90; animation: pulse 1.4s infinite; }
  @keyframes pulse { 50% { opacity: .55; } }
  .ctl { display: flex; gap: 6px; margin-top: auto; }
  .ctl button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px; padding: 7px 8px; border-radius: 10px; border: 0; background: rgba(255,255,255,.07); color: var(--text); font: inherit; font-size: .85em; font-weight: 500; }
  .ctl .go :global(svg) { color: #5bd88f; }
  .ctl .stop :global(svg) { color: #ff7a90; }
</style>
