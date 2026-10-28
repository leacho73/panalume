<script module>
  import { states } from '../lib/ha.svelte.js';
  const autofill = () => ({ entity: [...states.keys()].filter((id) => id.startsWith('humidifier.')).sort()[0] || '' });
  export const meta = {
    type: 'humidifier', name: 'Humidifier', icon: 'mdi:air-humidifier', category: 'Controls',
    size: { w: 300, h: 340 }, tap: 'none', hold: 'more-info',
    defaults: { entity: '' },
    autofill,
    sections: [{ key: 'dial', label: 'Dial' }, { key: 'current', label: 'Current humidity' }, { key: 'action', label: 'Status' }, { key: 'modes', label: 'Modes' }],
    fields: [
      { key: 'entity', label: 'Humidifier / dehumidifier', type: 'entity', domain: 'humidifier' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'icon', label: 'Icon', type: 'icon' },
    ],
  };
</script>

<script>
  // Humidifier or dehumidifier: drag the dial (or −/+) to set the target
  // humidity, the power button turns it on and off, and the modes (auto, sleep,
  // low / high…) are whatever the device offers. Same look as the thermostat.
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { stateWord, attrWord } from '../lib/i18n.svelte.js';
  import { name } from '../lib/entity.js';
  import { callService } from '../lib/ha.svelte.js';
  let { props, w = 300, h = 340 } = $props();
  const show = (k) => !props.hide?.[k];
  const e = $derived(ent(props.entity));
  const a = $derived(e?.attributes || {});
  const dry = $derived(a.device_class === 'dehumidifier');
  const min = $derived(a.min_humidity ?? 0);
  const max = $derived(a.max_humidity ?? 100);
  const target = $derived(a.humidity);
  const cur = $derived(a.current_humidity);
  const off = $derived(!e || e.state !== 'on');
  const action = $derived(a.action || (off ? 'off' : 'idle'));
  const modes = $derived(Array.isArray(a.available_modes) ? a.available_modes : []);
  const color = $derived(off ? '#8a94a8' : dry ? '#ffc861' : '#4fb4ff');
  const ACTION = { humidifying: ['mdi:water-plus', 'Humidifying'], drying: ['mdi:water-minus', 'Drying'], idle: ['mdi:pause-circle-outline', 'Idle'], off: ['mdi:power', 'Off'] };
  const MODE = { auto: 'mdi:refresh-auto', sleep: 'mdi:power-sleep', eco: 'mdi:leaf', boost: 'mdi:rocket-launch', comfort: 'mdi:sofa', home: 'mdi:home', away: 'mdi:account-arrow-right', baby: 'mdi:baby-carriage', normal: 'mdi:water-percent', low: 'mdi:fan-speed-1', medium: 'mdi:fan-speed-2', mid: 'mdi:fan-speed-2', high: 'mdi:fan-speed-3' };
  const modeLabel = (m) => attrWord('humidifier', 'mode', m) || String(m).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const actLabel = $derived(attrWord('humidifier', 'action', action) || ACTION[action]?.[1] || stateWord('humidifier', null, e?.state) || action);

  let pending = $state(null);
  let timer;
  const shown = $derived(pending ?? target);
  const clamp = (v) => Math.min(max, Math.max(min, Math.round(v)));
  function setTarget(v, now = false) {
    pending = clamp(v);
    clearTimeout(timer);
    timer = setTimeout(send, now ? 0 : 900);
  }
  function send() {
    if (pending == null || !e) return;
    callService('humidifier', 'set_humidity', { humidity: pending }, { entity_id: e.entity_id }).finally(() => setTimeout(() => (pending = null), 1500));
  }
  const power = () => e && callService('humidifier', off ? 'turn_on' : 'turn_off', {}, { entity_id: e.entity_id });
  const setMode = (m) => callService('humidifier', 'set_mode', { mode: m }, { entity_id: e.entity_id });

  // Dial geometry, as on the thermostat: 270° arc, gap at the bottom.
  const R = 80, CX = 100, CY = 100, START = 135, SWEEP = 270;
  const frac = (v) => Math.min(1, Math.max(0, (v - min) / (max - min || 1)));
  const pt = (f) => { const ang = ((START + SWEEP * f) * Math.PI) / 180; return [CX + R * Math.cos(ang), CY + R * Math.sin(ang)]; };
  const arc = (f0, f1) => {
    const [x0, y0] = pt(f0), [x1, y1] = pt(f1);
    return `M${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 ${SWEEP * (f1 - f0) > 180 ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
  };
  let svg;
  let dragging = $state(false);
  function valueAt(ev) {
    const r = svg.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * 200 - CX, y = ((ev.clientY - r.top) / r.height) * 200 - CY;
    let rel = ((Math.atan2(y, x) * 180) / Math.PI - START + 360) % 360;
    if (rel > SWEEP) rel = rel > SWEEP + (360 - SWEEP) / 2 ? 0 : SWEEP;
    return min + (rel / SWEEP) * (max - min);
  }
  function down(ev) {
    if (off || shown == null) return;
    ev.stopPropagation();
    svg.setPointerCapture(ev.pointerId);
    dragging = true;
    pending = clamp(valueAt(ev));
    clearTimeout(timer);
  }
  const move = (ev) => dragging && (pending = clamp(valueAt(ev)));
  function up() { if (!dragging) return; dragging = false; setTarget(pending, true); }

  const wide = $derived(w > h * 1.35);
  const dialSpace = $derived(wide ? h - 74 : h - 74 - (!off && target != null ? 50 : 0) - (show('modes') && modes.length ? 54 : 0));
  const useDial = $derived(show('dial') && dialSpace >= 130 && w >= 150);
</script>

<div class="hum" class:off class:wide style="--c:{color}">
  <div class="glow"></div>
  <div class="head">
    <span class="ic"><Icon icon={t(props.icon) || (dry ? 'mdi:water-minus-outline' : 'mdi:air-humidifier')} size="1.2em" /></span>
    <span class="name">{t(props.name) || name(e)}</span>
    {#if e}<button class="pw" class:on={!off} onclick={power} aria-label={off ? 'Turn on' : 'Turn off'} data-stop><Icon icon="mdi:power" size="1.1em" /></button>{/if}
  </div>

  <div class="body">
    {#if !e}
      <div class="msg">{props.entity ? 'Humidifier not found' : 'Pick a humidifier in the card\'s settings.'}</div>
    {:else if useDial}
      <div class="dial" data-stop>
        <svg bind:this={svg} viewBox="0 0 200 200" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} role="slider" aria-valuenow={shown} aria-valuemin={min} aria-valuemax={max} tabindex="-1">
          <path d={arc(0, 1)} class="track" />
          {#if shown != null && !off}
            <path d={arc(0, frac(shown))} class="fill" />
            {@const [kx, ky] = pt(frac(shown))}
            <circle cx={kx} cy={ky} r={dragging ? 11 : 9} class="knob" />
          {/if}
          {#if cur != null}
            {@const [mx, my] = pt(frac(cur))}
            <circle cx={mx} cy={my} r="3.5" class="cur" />
          {/if}
        </svg>
        <div class="centre">
          {#if show('action')}<div class="act" class:pulse={action === 'humidifying' || action === 'drying'}><Icon icon={ACTION[action]?.[0] || 'mdi:water-percent'} size="1em" /> {actLabel}</div>{/if}
          <div class="tgt" class:pending={pending != null}>{off ? 'Off' : shown != null ? Math.round(shown) : '—'}{#if !off && shown != null}<small>%</small>{/if}</div>
          {#if show('current') && cur != null}<div class="now">Now {Math.round(cur)}%</div>{/if}
        </div>
      </div>
    {:else}
      <div class="row" data-stop>
        {#if !off && shown != null}<button class="rb" onclick={() => setTarget((pending ?? target) - 1)} aria-label="Lower"><Icon icon="mdi:minus" size="1.3em" /></button>{/if}
        <div class="rc">
          {#if show('action')}<div class="act" class:pulse={action === 'humidifying' || action === 'drying'}><Icon icon={ACTION[action]?.[0] || 'mdi:water-percent'} size="1em" /> {actLabel}</div>{/if}
          <div class="tgt" class:pending={pending != null}>{off ? 'Off' : shown != null ? Math.round(shown) : cur != null ? Math.round(cur) : '—'}{#if !off && (shown ?? cur) != null}<small>%</small>{/if}</div>
          {#if show('current') && cur != null && shown != null}<div class="now">Now {Math.round(cur)}%</div>{/if}
        </div>
        {#if !off && shown != null}<button class="rb" onclick={() => setTarget((pending ?? target) + 1)} aria-label="Raise"><Icon icon="mdi:plus" size="1.3em" /></button>{/if}
      </div>
    {/if}

    {#if e}
      <div class="side">
        {#if useDial && !off && shown != null}
          <div class="pm" data-stop>
            <button onclick={() => setTarget((pending ?? target) - 1)} aria-label="Lower"><Icon icon="mdi:minus" size="1.3em" /></button>
            <button onclick={() => setTarget((pending ?? target) + 1)} aria-label="Raise"><Icon icon="mdi:plus" size="1.3em" /></button>
          </div>
        {/if}
        {#if show('modes') && modes.length}
          {#if modes.length <= 5}
            <div class="modes" data-stop>
              {#each modes as m}
                <button class:sel={m === a.mode} onclick={() => setMode(m)} title={modeLabel(m)}>
                  <Icon icon={MODE[String(m).toLowerCase()] || 'mdi:circle-medium'} size="1.15em" />{#if (wide ? w / 2 : w) / modes.length >= 62}<span>{modeLabel(m)}</span>{/if}
                </button>
              {/each}
            </div>
          {:else}
            <select class="msel" value={a.mode} onchange={(ev) => setMode(ev.currentTarget.value)} data-stop>
              {#each modes as m}<option value={m}>{modeLabel(m)}</option>{/each}
            </select>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .hum { position: relative; height: 100%; display: flex; flex-direction: column; gap: 6px; isolation: isolate; }
  .glow { position: absolute; inset: calc(var(--pad) * -1); z-index: -1; background: radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--c) 22%, transparent), transparent 70%); transition: background .6s; pointer-events: none; }
  .off .glow { opacity: .3; }
  .head { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .ic { width: 2em; height: 2em; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--c) 22%, transparent); color: var(--c); flex: none; }
  .name { font-weight: 600; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pw { width: 2.1em; height: 2.1em; flex: none; border-radius: 50%; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.06); color: var(--muted); display: grid; place-items: center; }
  .pw.on { background: color-mix(in srgb, var(--c) 30%, transparent); color: var(--text); }
  .body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
  .wide .body { flex-direction: row; align-items: center; }
  .msg { flex: 1; display: grid; place-items: center; text-align: center; color: var(--muted); font-size: .85em; }
  .dial { position: relative; flex: 1; min-height: 0; aspect-ratio: 1; max-width: 100%; margin: 0 auto; touch-action: none; }
  .wide .dial { height: 100%; flex: none; }
  .dial svg { width: 100%; height: 100%; display: block; cursor: grab; }
  .track { fill: none; stroke: rgba(255,255,255,.08); stroke-width: 14; stroke-linecap: round; }
  .fill { fill: none; stroke: var(--c); stroke-width: 14; stroke-linecap: round; filter: drop-shadow(0 0 6px color-mix(in srgb, var(--c) 60%, transparent)); transition: stroke .4s; }
  .knob { fill: #fff; stroke: var(--c); stroke-width: 4; filter: drop-shadow(0 2px 4px rgba(0,0,0,.4)); transition: r .15s; }
  .cur { fill: var(--text); opacity: .9; }
  .centre { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; }
  .act { display: flex; align-items: center; gap: 4px; font-size: .78em; color: var(--c); font-weight: 600; text-transform: uppercase; letter-spacing: .06em; }
  .pulse :global(svg) { animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .35; transform: scale(.85); } }
  .tgt { font-size: 2.6em; font-weight: 600; letter-spacing: -.03em; line-height: 1.05; }
  .tgt.pending { color: var(--c); }
  .tgt small { font-size: .38em; color: var(--muted); font-weight: 500; vertical-align: top; margin-left: 2px; }
  .now { font-size: .8em; color: var(--muted); }
  .row { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .rc { flex: 1; display: flex; flex-direction: column; align-items: center; min-width: 0; }
  .rb, .pm button { width: 2.6em; height: 2.6em; flex: none; border-radius: 50%; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.06); color: inherit; display: grid; place-items: center; }
  .rb:active, .pm button:active { background: color-mix(in srgb, var(--c) 45%, transparent); }
  .side { display: flex; flex-direction: column; gap: 8px; }
  .wide .side { flex: 1; min-width: 0; }
  .pm { display: flex; justify-content: center; gap: 12px; }
  .wide .pm { justify-content: flex-start; }
  .modes { display: flex; gap: 4px; }
  .wide .modes { flex-wrap: wrap; }
  .modes button { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 2px; border-radius: 12px; border: 0; background: rgba(255,255,255,.05); color: var(--muted); font-size: .72em; }
  .modes button span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .modes .sel { background: color-mix(in srgb, var(--c) 26%, transparent); color: var(--text); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 55%, transparent); }
  .modes .sel :global(svg) { color: var(--c); }
  .msel { font-size: .8em; padding: 6px 8px; border-radius: 10px; background: rgba(255,255,255,.06); }
</style>
