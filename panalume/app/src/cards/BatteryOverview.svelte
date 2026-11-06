<script module>
  import { states, renderTemplate } from '../lib/ha.svelte.js';

  // Every battery-percentage sensor in the house, asked of Home Assistant as one
  // live template: the card follows new sensors without re-editing the card.
  const BATTERIES = "{{ states.sensor | selectattr('attributes.device_class', 'eq', 'battery') | map(attribute='entity_id') | join(',') }}";
  const batteries = () => String(renderTemplate(BATTERIES) || '').split(',').map((s) => s.trim()).filter(Boolean);

  export const meta = {
    type: 'batteries', name: 'Batteries', icon: 'mdi:battery-heart-variant', category: 'Info',
    size: { w: 320, h: 340 }, tap: 'none', hold: 'more-info',
    defaults: { entities: [], threshold: 20, max: 0, name: '', stale: false },
    sections: [{ key: 'bar', label: 'Level bar' }],
    // Nothing to auto-fill: an empty list means every battery in the house.
    watch: (p) => (p.entities?.length ? p.entities : batteries()),
    fields: [
      { key: 'name', label: 'Name (blank = Batteries)', type: 'text' },
      { key: 'entities', label: 'Sensors (blank = every battery in the house)', type: 'entities', domain: 'sensor' },
      { key: 'threshold', label: 'Warn at or below (%)', type: 'number' },
      { key: 'max', label: 'Most rows (0 = all of them)', type: 'number' },
      { key: 'stale', label: 'Also list sensors with no reading', type: 'bool' },
    ],
  };
</script>

<script>
  // One line per battery sensor, emptiest first, so the ones that need changing
  // are at the top of the list rather than hunting through a dashboard.
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/tpl.js';
  import { name } from '../lib/entity.js';
  let { props } = $props();
  const show = (k) => !props.hide?.[k];
  const level = (e) => {
    const n = Number(e?.state);
    return e && e.state !== '' && Number.isFinite(n) ? n : null;
  };
  const list = $derived((props.entities?.length ? props.entities : String(renderTemplate(BATTERIES) || '').split(',').map((s) => s.trim()).filter(Boolean))
    .map((id) => states.get(id))
    .filter(Boolean));
  const rated = $derived(list.filter((e) => level(e) != null).sort((a, b) => level(a) - level(b) || byName(a, b)));
  const stale = $derived(list.filter((e) => level(e) == null).sort(byName));
  function byName(a, b) { return String(name(a)).localeCompare(String(name(b))); }
  const threshold = $derived(Number(props.threshold ?? 20));
  const low = $derived(rated.filter((e) => level(e) <= threshold));
  const max = $derived(Number(props.max) || 0);
  const shown = $derived([...rated, ...(props.stale ? stale : [])]);
  const rows = $derived(max > 0 ? shown.slice(0, max) : shown);
  const hidden = $derived(shown.length - rows.length);
  // Sensors that are in the list but not reporting: counted, not listed, unless asked for.
  const silent = $derived(props.stale ? 0 : stale.length);
  // "Alicias Phone Battery Level" reads better as "Alicias Phone" in a list.
  const short = (e) => String(name(e)).replace(/\s+battery(\s+level)?\s*$/i, '').trim() || String(name(e));
  const colour = (v) => (v == null ? 'var(--muted)' : v <= threshold ? '#ff7a90' : v <= threshold * 2 ? '#ffc861' : '#5bd88f');
  const icon = (v) => {
    if (v == null) return 'mdi:battery-unknown';
    if (v <= threshold) return 'mdi:battery-alert-variant-outline';
    const step = Math.min(100, Math.max(10, Math.round(v / 10) * 10));
    return step >= 100 ? 'mdi:battery' : `mdi:battery-${step}`;
  };
</script>

<div class="bs">
  <div class="head">
    <span class="ttl">{t(props.name) || 'Batteries'}</span>
    {#if low.length}
      <span class="chip bad"><Icon icon="mdi:battery-alert" size="1em" />{low.length} low</span>
    {:else if rated.length}
      <span class="chip ok"><Icon icon="mdi:check-circle-outline" size="1em" />All good</span>
    {/if}
  </div>

  <div class="rows">
    {#each rows as e (e.entity_id)}
      {@const v = level(e)}
      <div class="row" class:low={v != null && v <= threshold} class:stale={v == null} title={name(e)}>
        <span class="ic" style="color:{colour(v)}"><Icon icon={icon(v)} size="1.25em" /></span>
        <span class="n">{short(e)}</span>
        {#if show('bar')}
          <span class="bar"><span class="fill" style="width:{v ?? 0}%;background:{colour(v)}"></span></span>
        {/if}
        <span class="v" style="color:{colour(v)}">{#if v == null}—{:else}{Math.round(v)}<small>%</small>{/if}</span>
      </div>
    {/each}
    {#if !rows.length}
      <div class="empty"><Icon icon="mdi:battery-off-outline" size="1.1em" /> No battery sensors found</div>
    {/if}
    {#if hidden > 0}<div class="more">and {hidden} more</div>{/if}
    {#if silent > 0}<div class="more">{silent} with no reading</div>{/if}
  </div>
</div>

<style>
  .bs { height: 100%; display: flex; flex-direction: column; gap: 8px; container-type: size; min-height: 0; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex: none; }
  .ttl { font-weight: 600; font-size: 1.05em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chip { display: inline-flex; align-items: center; gap: 5px; font-size: .75em; font-weight: 600; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
  .chip.bad { color: #ff7a90; background: rgba(255,122,144,.15); }
  .chip.ok { color: #5bd88f; background: rgba(91,216,143,.15); }
  .rows { flex: 1; min-height: 0; overflow: auto; margin: 0 -6px; }
  .row { display: flex; align-items: center; gap: 9px; padding: 4px 6px; border-radius: 10px; min-height: 28px; }
  .ic { display: grid; flex: none; }
  .n { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: .92em; }
  .row.low .n { font-weight: 600; }
  .row.stale .n { color: var(--muted); }
  .bar { width: 34%; max-width: 90px; min-width: 34px; height: 5px; border-radius: 3px; background: rgba(127,127,127,.22); overflow: hidden; flex: none; }
  .fill { display: block; height: 100%; border-radius: 3px; transition: width .6s ease; }
  .v { font-variant-numeric: tabular-nums; font-weight: 600; font-size: .9em; flex: none; min-width: 2.6em; text-align: right; }
  .v small { font-size: .75em; font-weight: 500; margin-left: 1px; opacity: .8; }
  .empty { display: flex; align-items: center; gap: 7px; padding: 8px 6px; color: var(--muted); font-size: .88em; }
  .more { padding: 4px 6px; font-size: .78em; color: var(--muted); }
  @container (max-width: 230px) { .bar { display: none; } }
</style>
