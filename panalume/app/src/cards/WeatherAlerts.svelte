<script module>
  export const meta = {
    type: 'weather-alerts', name: 'Weather alerts', icon: 'mdi:alert-outline', category: 'Info',
    size: { w: 520, h: 240 }, tap: 'none',
    defaults: { entities: [], entity: '', title: '', show_empty: true, calm: true },
    sections: [{ key: 'head', label: 'Title' }, { key: 'calm', label: 'When there is nothing' }],
    fields: [
      { key: 'entities', label: 'Alert sensors', type: 'entities', domain: 'sensor', hint: 'Sensors whose state is how many alerts are in effect and whose attributes carry `alert_1`, `alert_2` … with each title. Environment Canada publishes warnings, watches, advisories, statements and endings as one sensor each; pick all five. Rows are grouped by which sensor raised them.' },
      { key: 'title', label: 'Title (blank = “Alerts”)', type: 'text' },
      { key: 'show_empty', label: 'Say so when there is nothing in effect', type: 'bool' },
    ],
  };
  const ORDER = ['warning', 'watch', 'advisory', 'statement', 'ending'];
  const TONE = { warning: '#e03131', watch: '#f08c00', advisory: '#f0b429', statement: '#74c0fc', ending: '#868e96' };
  export const kindOf = (text) => ORDER.find((k) => String(text).toLowerCase().includes(k)) || 'statement';
</script>

<script>
  // One row per alert, across as many alert sensors as are picked. The severity comes from
  // the sensor itself (a warnings sensor raises warnings), so nothing has to be parsed out
  // of the title text.
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { name as entName, relTime } from '../lib/entity.js';

  let { props, h = 240 } = $props();
  const show = (k) => !props.hide?.[k];
  const ids = $derived(
    [...(Array.isArray(props.entities) ? props.entities : []), props.entity]
      .map((x) => String(t(x) || '').trim())
      .filter(Boolean)
      .filter((x, i, a) => a.indexOf(x) === i),
  );

  const alerts = $derived.by(() => {
    const out = [];
    for (const id of ids) {
      const e = ent(id);
      if (!e) continue;
      const kind = kindOf(`${id} ${e.attributes?.friendly_name || ''}`);
      const a = e.attributes || {};
      for (const [k, v] of Object.entries(a)) {
        const m = /^alert_(\d+)$/.exec(k);
        if (!m || !v) continue;
        const when = a[`alert_time_${m[1]}`] || '';
        out.push({ key: `${id}:${m[1]}`, kind, title: String(v), when, source: entName(e) || '' });
      }
    }
    return out;
  });
  const title = $derived(String(t(props.title) || '').trim() || 'Alerts');
  const tone = (kind) => TONE[kind] || '#868e96';
  const when = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return relTime(d) || d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  };
  const tall = $derived((Number(h) || 240) > 150);
</script>

<div class="wrap">
  {#if alerts.length}
    <div class="head" style:--tone={tone(alerts[0].kind)}>
      <Icon icon="mdi:alert" size="1.1em" />
      <span class="t">{title}</span>
      <span class="n">{alerts.length}</span>
    </div>
    <div class="list">
      {#each alerts as a (a.key)}
        <div class="row" style:--tone={tone(a.kind)}>
          <span class="flag"></span>
          <div class="body">
            <span class="ti">{a.title}</span>
            {#if tall && (a.when || a.source)}
              <span class="meta">{a.source}{a.when ? ` · ${when(a.when)}` : ''}</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {:else if show('calm')}
    <div class="calm">
      <Icon icon="mdi:shield-check-outline" size="1.15em" />
      <div>
        <b>{t('No alerts in effect')}</b>
        {#if tall}<small>{ids.length ? t('Nothing from Environment Canada for this area') : t('Pick the alert sensors')}</small>{/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .wrap { height: 100%; display: flex; flex-direction: column; gap: .4em; min-height: 0; container-type: size; }
  .head { display: flex; align-items: center; gap: .4em; font-weight: 600; color: var(--tone); flex: none; }
  .t { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .n { flex: none; font-size: .78em; background: color-mix(in srgb, var(--tone) 22%, transparent); color: var(--tone); padding: .05em .45em; border-radius: .5em; }
  .list { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: .3em; overflow: hidden; }
  .row { display: flex; gap: .5em; align-items: flex-start; background: rgba(255, 255, 255, .04); border-radius: .5em; padding: .35em .55em; min-width: 0; }
  .flag { flex: none; width: .28em; align-self: stretch; border-radius: .2em; background: var(--tone); }
  .body { display: flex; flex-direction: column; gap: .08em; min-width: 0; }
  .ti { font-size: .86em; font-weight: 600; line-height: 1.2; }
  .meta { font-size: .7em; color: var(--muted); }
  .calm { margin: auto; display: flex; align-items: center; gap: .55em; color: #69db7c; }
  .calm b { display: block; font-size: .92em; }
  .calm small { color: var(--muted); font-size: .74em; }
  @container (max-height: 130px) { .calm small { display: none; } }
</style>
