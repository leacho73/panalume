<script module>
  import { states } from '../lib/ha.svelte.js';
  export const meta = {
    type: 'weather-alerts', name: 'Weather alerts', icon: 'mdi:alert-outline', category: 'Info',
    size: { w: 520, h: 240 }, tap: 'none',
    defaults: { entities: [], entity: '', title: '', show_empty: true, calm: true },
    autofill: () => {
      // One sensor each for warnings, watches, advisories, statements and endings, else
      // anything that names itself as an alert source (Meteoalarm, NWS Alerts).
      const ids = [...states.keys()];
      const ec = ids.filter((id) => id.startsWith('sensor.') && /(warnings|watches|advisories|statements|endings)$/i.test(id)).sort();
      if (ec.length) return { entities: ec };
      const other = ids.filter((id) => /^(sensor|binary_sensor)\./.test(id)
        && /alert|warning|advisory|meteoalarm|nws/i.test(`${id} ${states.get(id)?.attributes?.friendly_name || ''}`));
      return other.length ? { entities: other.slice(0, 5) } : {};
    },
    sections: [{ key: 'head', label: 'Title' }, { key: 'calm', label: 'When there is nothing' }],
    fields: [
      { key: 'entities', label: 'Alert sensors', type: 'entities', domain: ['sensor', 'binary_sensor'], hint: 'Any sensor that publishes warnings. Environment Canada gives five, one each for warnings, watches, advisories, statements and endings, with `alert_1`, `alert_2` … in the attributes; NWS Alerts gives one sensor with an `Alerts` list; Meteoalarm gives a binary sensor whose attributes describe the one alert in effect. Pick as many as you have — one row is drawn per alert.' },
      { key: 'title', label: 'Title (blank = “Alerts”)', type: 'text' },
      { key: 'show_empty', label: 'Say so when there is nothing in effect', type: 'bool' },
    ],
  };
  const ORDER = ['warning', 'watch', 'advisory', 'statement', 'ending'];
  const TONE = { warning: '#e03131', watch: '#f08c00', advisory: '#f0b429', statement: '#74c0fc', ending: '#868e96' };
  export const kindOf = (text) => ORDER.find((k) => String(text).toLowerCase().includes(k)) || 'statement';
</script>

<script>
  // One row per alert, across as many alert sensors as are picked. Two ways a sensor can
  // describe its alerts: Environment Canada names the kind in the sensor and puts each
  // title in `alert_N`; NWS Alerts, Meteoalarm and most others carry a severity in the
  // data, so the colour comes from that and the sensor's name is only the fallback.
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

  const TITLE = ['title', 'headline', 'event', 'name', 'alert', 'summary', 'message'];
  const SEVERITY = ['severity', 'awareness_level', 'awareness_type', 'level', 'alert_level', 'category', 'type'];
  const WHEN = ['onset', 'start', 'effective', 'sent', 'begin', 'from', 'issued', 'date'];
  const first = (o, keys) => {
    if (!o || typeof o !== 'object') return '';
    // Attribute names arrive in whatever case the integration chose (NWS publishes "Event",
    // "Severity"; Meteoalarm publishes "awareness_level"), so match them case-blind.
    const entries = Object.entries(o);
    for (const want of keys) {
      for (const [k, v] of entries) {
        if (k.toLowerCase() !== want) continue;
        if (v != null && String(v).trim()) return String(v);
      }
    }
    return '';
  };
  // CAP severities and Meteoalarm's colours land on the same five words the card uses.
  const severityKind = (text) => {
    const s = String(text || '').toLowerCase();
    if (!s) return '';
    if (/(^|\W)(extreme|severe|red|warning)(\W|$)/.test(s)) return 'warning';
    if (/(^|\W)(orange|watch)(\W|$)/.test(s)) return 'watch';
    if (/(^|\W)(moderate|yellow|advisory)(\W|$)/.test(s)) return 'advisory';
    if (/(^|\W)(minor|green|statement)(\W|$)/.test(s)) return 'statement';
    return '';
  };
  // "3; orange; Severe" → "Severe"; "8; forest-fire" → "forest fire".
  const phrase = (v) => String(v || '').split(';').pop().trim().replace(/[_-]+/g, ' ');
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

  const alerts = $derived.by(() => {
    const out = [];
    for (const id of ids) {
      const e = ent(id);
      if (!e || ['unknown', 'unavailable'].includes(String(e.state))) continue;
      const a = e.attributes || {};
      const name = entName(e) || id;
      const fromName = kindOf(`${id} ${name}`);
      let found = false;

      // Environment Canada: one title per alert_N, with alert_time_N beside it.
      for (const [k, v] of Object.entries(a)) {
        const m = /^alert_(\d+)$/.exec(k);
        if (!m || !v) continue;
        found = true;
        out.push({ key: `${id}:${m[1]}`, kind: fromName, title: String(v), when: a[`alert_time_${m[1]}`] || '', source: name });
      }

      // A list of alert objects under whatever name the integration gives it.
      if (!found) {
        for (const [k, v] of Object.entries(a)) {
          if (!Array.isArray(v)) continue;
          const objs = v.filter((x) => x && typeof x === 'object');
          if (!objs.length) continue;
          found = true;
          objs.forEach((o, i) => out.push({
            key: `${id}:${k}:${i}`,
            kind: severityKind(first(o, SEVERITY)) || fromName,
            title: first(o, TITLE) || name,
            when: first(o, WHEN),
            source: name,
          }));
        }
      }

      // One alert carried in the sensor's own attributes, and the sensor says whether it is on.
      if (!found) {
        const title = first(a, TITLE);
        const sev = first(a, SEVERITY);
        const st = String(e.state).trim();
        const live = !['0', 'off', 'false', 'no', 'none', ''].includes(st.toLowerCase());
        if (live && (title || sev)) {
          const type = phrase(a.awareness_type || '');
          const level = phrase(sev);
          out.push({
            key: `${id}:self`,
            kind: severityKind(sev) || fromName,
            title: title || [cap(type), cap(level)].filter(Boolean).join(' · ') || name,
            when: first(a, WHEN),
            source: name,
          });
        } else if (live && !/^\d+(\.\d+)?$/.test(st) && st.length > 2) {
          // A sensor whose state is the warning itself, with no attributes to read.
          out.push({ key: `${id}:state`, kind: severityKind(st) || fromName, title: st, when: first(a, WHEN), source: name });
        } else if (/^\d+$/.test(st) && Number(st) > 0) {
          // A count with nothing else to go on: still better than hiding a live alert.
          out.push({ key: `${id}:count`, kind: fromName, title: name, when: '', source: '' });
        }
      }
    }
    // Most severe first, so the header colour is the worst thing in effect.
    return out.sort((x, y) => ORDER.indexOf(x.kind) - ORDER.indexOf(y.kind));
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
        {#if tall}<small>{ids.length ? t('Nothing in effect for these sensors') : t('Pick the alert sensors')}</small>{/if}
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
  .row { display: flex; gap: .5em; align-items: flex-start; background: rgba(255, 255, 255, .04); border-radius: .5em; padding: .35em .55em; min-width: 0; flex: none; }
  .flag { flex: none; width: .28em; align-self: stretch; border-radius: .2em; background: var(--tone); }
  .body { display: flex; flex-direction: column; gap: .08em; min-width: 0; }
  .ti { font-size: .86em; font-weight: 600; line-height: 1.2; }
  .meta { font-size: .7em; color: var(--muted); }
  .calm { margin: auto; display: flex; align-items: center; gap: .55em; color: #69db7c; }
  .calm b { display: block; font-size: .92em; }
  .calm small { color: var(--muted); font-size: .74em; }
  @container (max-height: 130px) { .calm small { display: none; } }
</style>
