<script module>
  import { renderTemplate } from '../lib/ha.svelte.js';
  // Every timer in the house, found live, so a new one shows up without editing the card.
  const TIMERS = "{{ states.timer | map(attribute='entity_id') | join(',') }}";
  const allTimers = () => String(renderTemplate(TIMERS) || '').split(',').map((s) => s.trim()).filter(Boolean);

  export const meta = {
    type: 'timers', name: 'Timers', icon: 'mdi:timer-outline', category: 'Info',
    size: { w: 320, h: 220 }, tap: 'none', hold: 'none',
    defaults: { entities: [], finish: [], name: '', controls: true },
    sections: [{ key: 'head', label: 'Title' }, { key: 'bar', label: 'Progress bar' }],
    watch: (p) => [...(p.entities?.length ? p.entities : allTimers()), ...(p.finish || [])],
    fields: [
      { key: 'name', label: 'Name (blank = Timers)', type: 'text', section: 'head' },
      { key: 'entities', label: 'Timers (blank = every timer in the house)', type: 'entities', domain: 'timer' },
      { key: 'finish', label: 'Finish times too (optional)', type: 'entities', domain: 'sensor', hint: 'Sensors that say when something will be done, e.g. a washing machine\'s or dishwasher\'s finish or completion time. Shown while that time is still ahead.' },
      { key: 'controls', label: 'Pause and cancel buttons', type: 'bool' },
    ],
  };
</script>

<script>
  // Running timers: a live countdown and a progress bar for each Home Assistant timer
  // that's running or paused, and optionally finish-time sensors (a washer's "done at").
  // Idle timers aren't shown; with nothing running the card says so.
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/tpl.js';
  import { name } from '../lib/entity.js';
  import { states, callService } from '../lib/ha.svelte.js';
  let { props, h = 220 } = $props();
  const show = (k) => !props.hide?.[k];

  // "0:10:00" or "1 day, 0:10:00" → seconds.
  function secs(v) {
    const m = String(v ?? '').match(/(?:(\d+) days?, )?(\d+):(\d{2}):(\d{2})/);
    return m ? (Number(m[1] || 0) * 86400 + Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4])) : null;
  }
  const fmt = (s) => {
    s = Math.max(0, Math.round(s));
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    return hh ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
  };
  const longFmt = (s) => { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`; };

  let now = $state(Date.now());
  const ids = $derived(props.entities?.length ? props.entities : String(renderTemplate(TIMERS) || '').split(',').map((s) => s.trim()).filter(Boolean));
  const rows = $derived.by(() => {
    const out = [];
    for (const id of ids) {
      const e = states.get(id);
      if (!e || !['active', 'paused'].includes(e.state)) continue;
      const total = secs(e.attributes.duration);
      const left = e.state === 'active' && e.attributes.finishes_at ? (Date.parse(e.attributes.finishes_at) - now) / 1000 : secs(e.attributes.remaining);
      if (left == null) continue;
      out.push({ id, e, kind: 'timer', paused: e.state === 'paused', left, total, label: fmt(left) });
    }
    for (const id of props.finish || []) {
      const e = states.get(id);
      const at = Date.parse(e?.state);
      if (!e || !Number.isFinite(at) || at <= now) continue;
      const left = (at - now) / 1000;
      out.push({ id, e, kind: 'finish', left, total: null, label: `${longFmt(left)} · done ${new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` });
    }
    return out.sort((a, b) => a.left - b.left);
  });
  // Tick every second while anything is counting down.
  const ticking = $derived(rows.some((r) => !r.paused));
  $effect(() => {
    if (!ticking) return;
    const i = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(i);
  });
  const timer = (s, id) => callService('timer', s, {}, { entity_id: id });
</script>

<div class="tm">
  {#if show('head')}<div class="title"><Icon icon="mdi:timer-outline" size="1.1em" /><span>{t(props.name) || 'Timers'}</span></div>{/if}
  {#if !rows.length}
    <div class="none">No timers running</div>
  {:else}
    <div class="list">
      {#each rows as r (r.id)}
        <div class="row" class:paused={r.paused}>
          <div class="line">
            <span class="nm">{name(r.e)}</span>
            <span class="left">{r.paused ? 'Paused · ' : ''}{r.label}</span>
            {#if r.kind === 'timer' && props.controls !== false}
              <span class="ctl" data-stop>
                <button onclick={() => timer(r.paused ? 'start' : 'pause', r.id)} aria-label={r.paused ? 'Resume' : 'Pause'}><Icon icon={r.paused ? 'mdi:play' : 'mdi:pause'} size="1em" /></button>
                <button onclick={() => timer('cancel', r.id)} aria-label="Cancel"><Icon icon="mdi:close" size="1em" /></button>
              </span>
            {/if}
          </div>
          {#if show('bar') && r.total}<div class="bar"><i style="width:{Math.min(100, Math.max(0, (1 - r.left / r.total) * 100))}%"></i></div>{/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tm { height: 100%; display: flex; flex-direction: column; gap: 10px; min-height: 0; }
  .title { display: flex; align-items: center; gap: 8px; font-weight: 600; }
  .none { flex: 1; display: grid; place-items: center; color: var(--muted); font-size: .9em; }
  .list { display: flex; flex-direction: column; gap: 10px; overflow: auto; min-height: 0; }
  .row { display: flex; flex-direction: column; gap: 5px; }
  .line { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .nm { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .left { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
  .paused .left { color: var(--muted); font-weight: 500; }
  .ctl { display: flex; gap: 4px; }
  .ctl button { width: 28px; height: 28px; border-radius: 50%; border: 0; background: rgba(255,255,255,.08); color: inherit; display: grid; place-items: center; }
  .bar { height: 5px; border-radius: 99px; background: rgba(255,255,255,.08); overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--accent); border-radius: inherit; transition: width 1s linear; }
  .paused .bar i { background: var(--muted); }
</style>
