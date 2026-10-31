<script module>
  import { states } from '../lib/ha.svelte.js';

  // Autofill runs by hand from the editor, after the states have arrived — unlike
  // `watch`, which sees an empty map on first paint.
  const WASTE = /(^|_)(trash|garbage|rubbish|refuse|waste|bins?|recycl(e|ing|ables?)|pickup|pick_up|collection)(_|$)/i;
  const isDate = (id) => states.get(id)?.attributes.device_class === 'date';

  export const meta = {
    type: 'trash', name: 'Trash day', icon: 'mdi:trash-can', category: 'Info',
    size: { w: 300, h: 180 }, tap: 'more-info',
    defaults: {
      entity: '', bins: '', name: 'Trash day', text: 'Bins out tonight',
      remind_eve: true, eve_hour: 17, waste: '',
      c_garbage: '#ff6a3d', c_recycle: '#2f7ff0', c_compost: '#22a06b', c_other: '#ffb020',
    },
    sections: [
      { key: 'icon', label: 'Icon' },
      { key: 'date', label: 'Next date' },
      { key: 'type', label: 'Collection type' },
    ],
    fields: [
      { key: 'entity', label: 'Collection date', type: 'entity', domain: ['sensor', 'input_datetime'], hint: 'The next collection day — a date sensor (device class “date”), a timestamp sensor or an input_datetime.' },
      { key: 'bins', label: '“Bins out” sensor (optional)', type: 'entity', domain: 'binary_sensor', hint: 'A binary sensor that is on while the bins are waiting at the kerb. It lights the card on its own, whatever the date says.' },
      { key: 'name', label: 'Title', type: 'text', placeholder: 'Trash day' },
      { key: 'text', label: 'Collection-day words', type: 'text', placeholder: 'Bins out tonight', hint: 'The big line on the bright card.' },
      { key: 'waste', label: 'Collection type (blank = read from the entity)', type: 'text', placeholder: 'Garbage, recycling, compost…', hint: 'Blank reads the date entity’s attributes — collection_type, type, waste_type, bin_type, collection, category, kind and a few more. The type picks the colour and the icon.' },
      { key: 'remind_eve', label: 'Highlight from the evening before', type: 'bool', hint: 'The bins go out at night, so the card lights up the evening before the collection, not the morning of it.' },
      { key: 'eve_hour', label: 'Evening starts at (hour)', type: 'number' },
      { key: 'c_garbage', label: 'Garbage colour', type: 'color' },
      { key: 'c_recycle', label: 'Recycling colour', type: 'color' },
      { key: 'c_compost', label: 'Compost colour', type: 'color' },
      { key: 'c_other', label: 'No type / other colour', type: 'color' },
    ],
    autofill: () => {
      const ids = [...states.keys()];
      const out = {};
      const date = ids.find((id) => id.startsWith('sensor.') && WASTE.test(id) && isDate(id))
        || ids.find((id) => id.startsWith('sensor.') && WASTE.test(id) && /^\d{4}-\d{2}-\d{2}$/.test(String(states.get(id)?.state || '')));
      const bin = ids.find((id) => id.startsWith('binary_sensor.') && WASTE.test(id) && ['on', 'off'].includes(String(states.get(id)?.state || '')));
      if (date) out.entity = date;
      if (bin) out.bins = bin;
      return out;
    },
  };
</script>

<script>
  // A big, loud "bins out" card for the evening before collection, and a quiet
  // one the rest of the week. The type (garbage / recycling / compost) comes from
  // whatever the date sensor publishes; without it the card simply uses the
  // "no type" colour rather than inventing a rotation.
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { clock } from '../lib/clock.svelte.js';

  let { props, w = 300, h = 180 } = $props();
  const show = (k) => !props.hide?.[k];

  const day0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // Date sensors arrive as YYYY-MM-DD, timestamp sensors as epoch seconds or an
  // ISO string, input_datetime as either (or a bare time, which is not a date).
  function parseDate(v) {
    const s = String(v ?? '').trim();
    if (!s || /^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (/^\d{9,}$/.test(s)) {
      const d = new Date(Number(s) * (s.length <= 10 ? 1000 : 1));
      return isNaN(d) ? null : day0(d);
    }
    const d = new Date(s.replace(' ', 'T'));
    return isNaN(d) ? null : day0(d);
  }

  const dateEnt = $derived(ent(props.entity));
  const binEnt = $derived(props.bins ? ent(props.bins) : undefined);
  const gone = (e) => !e || ['unavailable', 'unknown', 'none', ''].includes(String(e.state).toLowerCase());

  const target = $derived(gone(dateEnt) ? null : parseDate(dateEnt.state));
  const today = $derived(day0(new Date(clock.now)));
  const away = $derived(target ? Math.round((target - today) / 864e5) : null);
  const binsOn = $derived(!!binEnt && !gone(binEnt) && binEnt.state === 'on');
  const eveHour = $derived(props.eve_hour === '' || props.eve_hour == null ? 17 : Number(props.eve_hour));
  const evening = $derived(new Date(clock.now).getHours() >= eveHour);
  const due = $derived(away === 0);
  // The reminder is on unless it was switched off; a layout written by hand (no
  // `defaults`) should still remind, so an absent setting means yes.
  const eve = $derived(props.remind_eve === undefined ? away === 1 && evening : !!props.remind_eve && away === 1 && evening);
  const hot = $derived(binsOn || due || eve);

  // Collection type: an explicit setting wins, else the first attribute that
  // carries one. Integrations disagree on the name, so several are tried.
  const ATTRS = ['collection_type', 'waste_type', 'bin_type', 'garbage_type', 'next_type', 'next_collection', 'type', 'collection', 'category', 'kind', 'waste', 'schedule'];
  const rawType = $derived.by(() => {
    if (props.waste) return String(t(props.waste)).trim();
    const a = dateEnt?.attributes || {};
    for (const k of ATTRS) {
      const v = a[k];
      if (v == null || v === '') continue;
      const s = Array.isArray(v) ? v.filter(Boolean).map(String).join(', ') : typeof v === 'string' ? v : '';
      if (s.trim()) return s.trim();
    }
    return '';
  });
  const KIND = [
    ['recycle', /recycl|blue (box|bag|bin)|cardboard|paper|plastic|glass|metal|tin|can/i],
    ['compost', /compost|organic|green (bin|cart)|yard|garden|food|leaf|leaves|branch/i],
    ['garbage', /garbage|trash|rubbish|refuse|landfill|general|household|waste|bin|cart/i],
  ];
  const kind = $derived((KIND.find(([, re]) => re.test(rawType)) || ['other'])[0]);
  const ICON = { garbage: 'mdi:trash-can', recycle: 'mdi:recycle', compost: 'mdi:leaf', other: 'mdi:trash-can-outline' };
  // Same values as `meta.defaults`: a layout written by hand carries no colours,
  // and the card must not fall back to the theme's grey because of that.
  const TINT = { garbage: '#ff6a3d', recycle: '#2f7ff0', compost: '#22a06b', other: '#ffb020' };
  const FALLBACK_LABEL = { garbage: 'Garbage', recycle: 'Recycling', compost: 'Compost', other: '' };
  const pretty = $derived(rawType
    ? rawType.split(/\s*[,;/]\s*/).filter(Boolean)
      .map((s) => s.replace(/_/g, ' ').trim().replace(/^./, (c) => c.toUpperCase()))
      .join(' & ')
    : '');
  const typeLabel = $derived(pretty || FALLBACK_LABEL[kind]);

  const colour = $derived(t(props['c_' + kind]) || TINT[kind] || t(props.c_other) || TINT.other);
  const icon = $derived(t(props.icon) || ICON[kind]);

  // White or near-black text, whichever reads on the chosen colour.
  function inkFor(c) {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || '').trim());
    if (!m) return '#fff';
    let x = m[1];
    if (x.length === 3) x = x.split('').map((d) => d + d).join('');
    const [r, g, b] = [0, 2, 4].map((i) => {
      const v = parseInt(x.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#171b21' : '#ffffff';
  }
  const ink = $derived(inkFor(colour));

  const fmt = (d) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const title = $derived(t(props.name) || 'Trash day');
  const headline = $derived(t(props.text) || 'Bins out tonight');
  const countdown = $derived(away == null ? '' : away === 0 ? 'Today' : away === 1 ? 'Tomorrow' : away > 1 ? `In ${away} days` : 'No date ahead');
</script>

{#if !props.entity}
  <div class="trash"><div class="note">Pick the collection date in the card’s settings.</div></div>
{:else if gone(dateEnt)}
  <div class="trash"><div class="note">{title} · collection date unavailable</div></div>
{:else if !target}
  <div class="trash"><div class="note">{title} · the date entity carries no date</div></div>
{:else if hot}
  <div class="trash">
    <div class="fill hot" class:small={h < 130} style="--tc:{colour};--ink:{ink}">
      {#if show('icon')}
        <span class="bin" aria-hidden="true"><Icon icon={icon} size="1em" /></span>
      {/if}
      <span class="words">
        <span class="headline">{headline}</span>
        {#if (show('type') && typeLabel) || show('date')}
          <span class="sub">
            {#if show('type') && typeLabel}<span class="tag">{typeLabel}</span>{/if}
            {#if show('date')}<span class="when">{binsOn && away !== 0 && away !== 1 ? fmt(target) : away === 1 ? 'Tomorrow' : away === 0 ? 'Today' : fmt(target)}</span>{/if}
          </span>
        {/if}
      </span>
    </div>
  </div>
{:else}
  <div class="trash quiet" class:small={h < 120}>
    <div class="head">
      {#if show('icon')}<span class="mark"><Icon icon={icon} size="1.15em" /></span>{/if}
      <span class="name">{title}</span>
      {#if show('type') && typeLabel}<span class="pill" style="--tc:{colour}">{typeLabel}</span>{/if}
    </div>
    <div class="next">
      <span class="big">{countdown}</span>
      {#if show('date')}<span class="when">{fmt(target)}</span>{/if}
    </div>
    {#if away < 0}
      <div class="note">That date has passed — check the sensor still updates.</div>
    {/if}
  </div>
{/if}

<style>
  .trash { height: 100%; display: flex; flex-direction: column; gap: .4em; min-height: 0; container-type: size; position: relative; }
  .head { display: flex; align-items: center; gap: .5em; min-width: 0; color: var(--muted); font-size: .92em; flex: none; }
  .mark { color: var(--accent); display: grid; flex: none; }
  .name { font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .pill { margin-left: auto; flex: none; font-size: .82em; font-weight: 600; padding: .15em .55em; border-radius: 99px; color: var(--tc); background: color-mix(in srgb, var(--tc) 22%, transparent); }
  .next { display: flex; flex-direction: column; justify-content: center; gap: .1em; flex: 1; min-height: 0; }
  .big { flex: none; font-size: clamp(14px, min(16cqh, 11cqw), 64px); line-height: 1.05; font-weight: 650; letter-spacing: -.015em; white-space: nowrap; }
  .when { flex: none; font-size: clamp(12px, min(9cqh, 6cqw), 26px); color: var(--muted); white-space: nowrap; }
  .note { color: var(--muted); font-size: .85em; line-height: 1.35; margin: auto 0; }

  /* Collection day: the card leaves the theme behind and paints itself. */
  .fill { position: absolute; inset: calc(var(--pad) * -1); box-sizing: border-box; padding: calc(var(--pad) * 1.1);
    background: radial-gradient(120% 130% at 8% 0%, rgba(255,255,255,.26) 0%, rgba(255,255,255,0) 62%), var(--tc);
    color: var(--ink); display: flex; align-items: center; gap: 5cqw; }
  .bin { flex: none; display: grid; font-size: min(30cqh, 24cqw); line-height: 1; opacity: .95; }
  .words { display: flex; flex-direction: column; justify-content: center; gap: .45cqh; min-width: 0; flex: 1; min-height: 0; }
  .headline { font-size: min(26cqh, 13cqw); line-height: 1.02; font-weight: 800; letter-spacing: -.02em; text-transform: uppercase; text-wrap: balance; }
  .sub { display: flex; align-items: center; gap: .5em; font-size: clamp(12px, min(9cqh, 4.6cqw), 22px); font-weight: 600; opacity: .82; min-width: 0; }
  .tag { padding: .12em .5em; border-radius: 99px; background: rgba(0,0,0,.16); color: inherit; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hot .when { color: inherit; opacity: .82; font-size: inherit; }

  /* A short cell keeps the icon, the words and the type line, all smaller. */
  @container (max-height: 125px) {
    .fill { padding: calc(var(--pad) * .75); gap: 3cqw; }
    .headline { font-size: min(27cqh, 11cqw); }
    .bin { font-size: min(34cqh, 18cqw); }
    .sub { font-size: min(13cqh, 4cqw); gap: .35em; }
  }
  @container (max-width: 215px) {
    .bin { display: none; }
    .headline { font-size: min(26cqh, 20cqw); }
    .sub { display: none; }
  }
  .quiet.small { gap: .15em; }
  .quiet.small .next { flex-direction: row; align-items: baseline; gap: .45em; }
  .quiet.small .big { font-size: min(30cqh, 8cqw); }
</style>
