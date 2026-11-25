<script module>
  import { states } from '../lib/ha.svelte.js';
  // Time helpers with "heat", "on", "off", "start" or "end" in their name, for a heating schedule.
  const autofill = () => {
    const ids = [...states.keys()].filter((id) => id.startsWith('input_datetime.') && states.get(id)?.attributes.has_time);
    const sched = ids.filter((id) => /heat|on|off|start|end|wake|sleep/.test(id));
    const picked = (sched.length ? sched : ids).slice(0, 2);
    return picked.length ? { entities: picked } : {};
  };

  export const meta = {
    type: 'time-picker', name: 'Time picker', icon: 'mdi:clock-edit-outline', category: 'Controls',
    size: { w: 340, h: 160 }, tap: 'none', hold: 'none', autofill,
    defaults: { entities: [], name: '', step: 15, hour12: false },
    sections: [{ key: 'head', label: 'Title' }, { key: 'names', label: 'Names' }],
    fields: [
      { key: 'name', label: 'Title (blank = none)', type: 'text', section: 'head' },
      { key: 'entities', label: 'Times (input_datetime helpers)', type: 'entities', domain: 'input_datetime', names: true, hint: 'Date-and-time helpers keep their date; only the time is changed here.' },
      { key: 'step', label: 'Minutes per tap', type: 'select', options: [{ value: 1, label: '1' }, { value: 5, label: '5' }, { value: 10, label: '10' }, { value: 15, label: '15' }, { value: 30, label: '30' }] },
      { key: 'hour12', label: '12-hour clock (7:30 pm)', type: 'bool' },
    ],
  };
</script>

<script>
  // Set the time on Home Assistant time helpers (input_datetime), e.g. when the heating
  // comes on and goes off: the time large, with up and down buttons for the hours and the
  // minutes. Taps add up on the card and are sent once you stop tapping.
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/tpl.js';
  import { name } from '../lib/entity.js';
  import { callService } from '../lib/ha.svelte.js';
  let { props, w = 340 } = $props();
  const show = (k) => !props.hide?.[k];

  const ids = $derived((props.entities || []).filter(Boolean));
  // Minutes past midnight from the helper's state ("06:30:00" or "2026-11-26 06:30:00").
  const minsOf = (e) => {
    const m = String(e?.state ?? '').match(/(\d{1,2}):(\d{2})(?::\d{2})?$/);
    return m ? +m[1] * 60 + +m[2] : null;
  };
  // Changes not yet sent, by entity: minutes past midnight.
  let pending = $state({});
  const timers = {};
  const shown = (id) => pending[id] ?? minsOf(states.get(id));

  function nudge(id, by) {
    const now = shown(id);
    if (now == null) return;
    pending[id] = (((now + by) % 1440) + 1440) % 1440;
    clearTimeout(timers[id]);
    timers[id] = setTimeout(() => send(id), 1200);
  }
  function send(id) {
    const v = pending[id];
    const e = states.get(id);
    if (v == null || !e) return;
    const hhmm = `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}:00`;
    const date = e.attributes.has_date ? String(e.state).split(' ')[0] : '';
    callService('input_datetime', 'set_datetime', date ? { datetime: `${date} ${hhmm}` } : { time: hhmm }, { entity_id: id });
  }
  // Once Home Assistant shows the time that was sent, stop showing our own copy.
  $effect(() => {
    for (const id of Object.keys(pending)) if (minsOf(states.get(id)) === pending[id]) delete pending[id];
  });
  $effect(() => () => Object.values(timers).forEach(clearTimeout));

  const step = $derived(Math.max(1, Number(props.step) || 15));
  const parts = (m) => {
    let h = Math.floor(m / 60);
    const mm = String(m % 60).padStart(2, '0');
    if (!props.hour12) return { h: String(h).padStart(2, '0'), m: mm, ap: '' };
    const ap = h < 12 ? 'am' : 'pm';
    h = h % 12 || 12;
    return { h: String(h), m: mm, ap };
  };
  const narrow = $derived(w / Math.max(1, ids.length) < 150);
</script>

<div class="tp">
  {#if show('head') && t(props.name)}<div class="title">{t(props.name)}</div>{/if}
  {#if !ids.length}
    <div class="none">Pick a time helper (input_datetime)</div>
  {:else}
    <div class="row" class:narrow>
      {#each ids as id, i (i + ':' + id)}
        {@const e = states.get(id)}
        {@const m = shown(id)}
        <div class="one" class:busy={pending[id] != null}>
          {#if show('names')}<div class="nm">{name(e, t(props.names?.[id])) || id}</div>{/if}
          {#if m == null}
            <div class="na">{e ? 'Not a time' : 'Not found'}</div>
          {:else}
            {@const p = parts(m)}
            <div class="clock" data-stop>
              <div class="col">
                <button onclick={() => nudge(id, 60)} aria-label="Hour up"><Icon icon="mdi:chevron-up" size="1.2em" /></button>
                <b>{p.h}</b>
                <button onclick={() => nudge(id, -60)} aria-label="Hour down"><Icon icon="mdi:chevron-down" size="1.2em" /></button>
              </div>
              <b class="sep">:</b>
              <div class="col">
                <button onclick={() => nudge(id, step)} aria-label="Minutes up"><Icon icon="mdi:chevron-up" size="1.2em" /></button>
                <b>{p.m}</b>
                <button onclick={() => nudge(id, -step)} aria-label="Minutes down"><Icon icon="mdi:chevron-down" size="1.2em" /></button>
              </div>
              {#if p.ap}<span class="ap">{p.ap}</span>{/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tp { height: 100%; display: flex; flex-direction: column; gap: 6px; min-height: 0; }
  .title { font-weight: 600; }
  .none { flex: 1; display: grid; place-items: center; color: var(--muted); font-size: .9em; text-align: center; }
  .row { flex: 1; min-height: 0; display: flex; justify-content: space-around; align-items: center; gap: 8px; }
  .row.narrow { flex-direction: column; align-items: stretch; }
  .one { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 0; }
  .nm { color: var(--muted); font-size: .85em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .na { color: var(--muted); font-size: .85em; }
  .clock { display: flex; align-items: center; gap: 2px; }
  .col { display: flex; flex-direction: column; align-items: center; }
  .col b, .sep { font-size: 2em; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.1; }
  .busy .col b, .busy .sep { color: var(--accent); }
  .col button { border: 0; background: none; color: var(--muted); padding: 0 6px; border-radius: 8px; display: grid; place-items: center; }
  .col button:hover { background: rgba(255,255,255,.08); color: var(--text); }
  .ap { margin-left: 4px; color: var(--muted); font-size: .9em; }
</style>
