<script module>
  export const meta = {
    type: 'activity', name: 'Activity', icon: 'mdi:format-list-bulleted-type', category: 'Info',
    size: { w: 360, h: 320 }, tap: 'none', hold: 'none',
    defaults: { entities: [], area: '', hours: 24, max: 30, name: '' },
    sections: [{ key: 'head', label: 'Title' }, { key: 'why', label: 'What caused it' }, { key: 'when', label: 'Time' }],
    fields: [
      { key: 'name', label: 'Title (blank = Activity)', type: 'text', section: 'head' },
      { key: 'entities', label: 'Only these (blank = everything)', type: 'entities', names: true, hint: 'Leave blank for all of Home Assistant\'s activity, or pick the things you care about so it isn\'t swamped.' },
      { key: 'area', label: 'Or only this area', type: 'text', placeholder: 'Kitchen', hint: 'An area\'s name or id; everything in it. Used when no entities are picked.' },
      { key: 'hours', label: 'Look back (hours)', type: 'number' },
      { key: 'max', label: 'Most rows', type: 'number' },
    ],
  };
</script>

<script>
  // Home Assistant's activity (its logbook), live and newest first: what changed, to
  // what, what caused it, and when. Optionally only some entities, or one area's.
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/tpl.js';
  import { haName } from '../lib/names.svelte.js';
  import { name, stateText, entityIcon, relTime } from '../lib/entity.js';
  import { states, subscribe, renderTemplate, conn } from '../lib/ha.svelte.js';
  import { app } from '../lib/config.svelte.js';
  import { clock } from '../lib/clock.svelte.js';
  let { props } = $props();
  const show = (k) => !props.hide?.[k];

  // Which entities to follow: the picked ones, else the area's (via Home Assistant's
  // own area_entities), else everything (null).
  const area = $derived(String(t(props.area) ?? '').trim().replace(/'/g, ''));
  const areaIds = $derived(area ? String(renderTemplate(`{{ area_entities('${area}') | join(',') }}`) ?? '') : '');
  const filter = $derived.by(() => {
    if (props.entities?.length) return props.entities.filter(Boolean);
    if (area) return areaIds ? areaIds.split(',').map((s) => s.trim()).filter(Boolean) : [];
    return null;
  });
  const hours = $derived(Math.max(1, Number(props.hours) || 24));
  const max = $derived(Math.max(1, Number(props.max) || 30));

  let events = $state([]);
  $effect(() => {
    const ids = filter;
    if (!conn.connected || (ids && !ids.length)) { events = []; return; }
    events = [];
    const seen = new Set();
    const msg = { type: 'logbook/event_stream', start_time: new Date(Date.now() - hours * 3600e3).toISOString(), ...(ids ? { entity_ids: ids } : {}) };
    return subscribe(msg, (ev) => {
      const add = (ev?.events || []).filter((x) => {
        const k = `${x.when}|${x.entity_id || x.name}|${x.state ?? x.message}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (add.length) events = [...events, ...add].sort((a, b) => b.when - a.when).slice(0, 200);
    });
  });

  // binary_sensor.front_door_contact → Front door contact, for things the dashboard isn't watching.
  const tidy = (id) => { const s = id.split('.')[1].replace(/_/g, ' '); return s[0].toUpperCase() + s.slice(1); };
  // One line per event: the thing, what it did, what caused it.
  const rows = $derived(events.slice(0, max).map((x, i) => {
    const e = x.entity_id ? states.get(x.entity_id) : null;
    // The state as it was then, in the words the dashboard uses now (no current brightness etc.).
    const then = x.entity_id ? { entity_id: x.entity_id, state: x.state, attributes: { device_class: e?.attributes.device_class, unit_of_measurement: e?.attributes.unit_of_measurement } } : null;
    const what = x.message || (then ? stateText(then) : '');
    const by = x.context_name || (x.context_user_id ? 'someone in the app' : x.context_event_type === 'automation_triggered' ? 'an automation' : '');
    return {
      key: `${i}:${x.when}`, id: x.entity_id,
      icon: (e && entityIcon({ ...e, state: x.state })) || x.icon || 'mdi:information-outline',
      who: x.entity_id ? (e ? name(e, t(props.names?.[x.entity_id])) : t(props.names?.[x.entity_id]) || haName(x.entity_id) || tidy(x.entity_id)) : x.name || x.domain || '',
      what, by, when: x.when,
    };
  }));
  const ago = (s) => { void clock.now; return Date.now() / 1000 - s < 86400 ? relTime(s) : new Date(s * 1000).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }); };
</script>

<div class="act">
  {#if show('head')}<div class="title"><Icon icon="mdi:format-list-bulleted-type" size="1.1em" /><span>{t(props.name) || 'Activity'}</span></div>{/if}
  {#if !rows.length}
    <div class="none">{filter && !filter.length ? (area ? `Nothing found in ${area}` : 'Pick what to follow') : `Nothing in the last ${hours} hours`}</div>
  {:else}
    <div class="list">
      {#each rows as r (r.key)}
        <div class="row" class:tap={!!r.id} role="presentation" data-stop onclick={() => r.id && (app.popup = { entity: r.id })}>
          <span class="ic"><Icon icon={r.icon} size="1.1em" /></span>
          <span class="txt">
            <span class="line"><b>{r.who}</b> {r.what}</span>
            {#if show('why') && r.by}<small>by {r.by}</small>{/if}
          </span>
          {#if show('when')}<span class="when">{ago(r.when)}</span>{/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .act { height: 100%; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
  .title { display: flex; align-items: center; gap: 8px; font-weight: 600; }
  .none { flex: 1; display: grid; place-items: center; color: var(--muted); font-size: .9em; text-align: center; }
  .list { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; }
  .row { display: flex; align-items: center; gap: 10px; padding: 6px 2px; border-bottom: 1px solid rgba(255,255,255,.05); }
  .row.tap { cursor: pointer; }
  .ic { flex: none; width: 1.9em; height: 1.9em; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.06); color: var(--muted); }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: .92em; }
  .line b { font-weight: 600; }
  small { color: var(--muted); font-size: .78em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .when { flex: none; color: var(--muted); font-size: .78em; font-variant-numeric: tabular-nums; }
</style>
