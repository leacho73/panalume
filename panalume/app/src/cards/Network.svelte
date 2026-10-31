<script module>
  import { states, renderTemplate } from '../lib/ha.svelte.js';

  // The estate's device trackers, asked of Home Assistant as one live template so
  // the card can follow every tracker without having them all as settings.
  const TRACKERS = "{{ states.device_tracker | map(attribute='entity_id') | join(',') }}";
  const trackers = () => String(renderTemplate(TRACKERS) || '').split(',').map((s) => s.trim()).filter(Boolean);

  const UP = ['on', 'up', 'online', 'connected', 'ok', 'home', 'running', 'true'];
  const STALE = ['unknown', 'unavailable', 'none', ''];

  export const meta = {
    type: 'network', name: 'Network status', icon: 'mdi:wan', category: 'Info',
    size: { w: 420, h: 300 }, tap: 'none', hold: 'more-info',
    defaults: { wan: '', download: '', upload: '', ping: '', clients: [], count: '', max: 5 },
    sections: [
      { key: 'wan', label: 'Internet' },
      { key: 'speed', label: 'Speed test' },
      { key: 'clients', label: 'Clients offline' },
      { key: 'when', label: 'Since when' },
    ],
    autofill: () => {
      const ids = [...states.keys()];
      const first = (re) => ids.find((id) => re.test(id)) || '';
      return {
        wan: first(/^binary_sensor\..*(wan|internet)/i) || first(/^sensor\..*wan.*status/i) || first(/^binary_sensor\..*connectivity/i),
        download: first(/^sensor\..*speedtest.*(download|down)/i),
        upload: first(/^sensor\..*speedtest.*(upload|up)/i),
        ping: first(/^sensor\..*speedtest.*(ping|latency)/i),
        clients: [],
      };
    },
    // The clients list can be left empty, in which case the card reads every
    // device tracker — which means asking for their states too.
    watch: (p) => (p.clients?.length ? p.clients : trackers()),
    fields: [
      { key: 'wan', label: 'Internet status', type: 'entity', section: 'wan', hint: 'A binary sensor or a status sensor whose on / up / online means the line is working.' },
      { key: 'download', label: 'Download', type: 'entity', domain: 'sensor', section: 'speed' },
      { key: 'upload', label: 'Upload', type: 'entity', domain: 'sensor', section: 'speed' },
      { key: 'ping', label: 'Ping', type: 'entity', domain: 'sensor', section: 'speed' },
      { key: 'clients', label: 'Clients (blank = every device tracker)', type: 'entities', domain: 'device_tracker', section: 'clients' },
      { key: 'count', label: 'Connected client count (optional)', type: 'entity', domain: 'sensor', section: 'clients' },
      { key: 'max', label: 'Most clients listed', type: 'number', section: 'clients' },
    ],
  };
</script>

<script>
  // The line, the last speed test and whoever is not on the network: the three
  // things to glance at when something feels slow.
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { name, entityIcon, formatNumber, relTime } from '../lib/entity.js';
  let { props, h = 300 } = $props();
  const show = (k) => !props.hide?.[k];

  const wanE = $derived(ent(props.wan));
  const wan = $derived.by(() => {
    if (!wanE) return null;
    const s = String(wanE.state).toLowerCase();
    if (STALE.includes(s)) return 'unknown';
    if (UP.includes(s)) return 'up';
    const n = Number(s);
    if (Number.isFinite(n) && n > 0) return 'up';
    return 'down';
  });

  const speed = $derived(
    [
      { key: 'down', icon: 'mdi:download', label: 'Down', e: ent(props.download), d: 1 },
      { key: 'up', icon: 'mdi:upload', label: 'Up', e: ent(props.upload), d: 1 },
      { key: 'ping', icon: 'mdi:timer-sand', label: 'Ping', e: ent(props.ping), d: 0 },
    ].filter((c) => c.e && !['unavailable', 'unknown'].includes(c.e.state)),
  );
  const val = (e, d) => {
    const n = Number(e.state);
    if (!Number.isFinite(n)) return e.state;
    // Whole numbers for a ping in ms, one decimal for a rate in Mbit/s.
    return formatNumber(n, d);
  };

  const all = $derived((props.clients?.length ? props.clients : String(renderTemplate(TRACKERS) || '').split(',').map((s) => s.trim()).filter(Boolean))
    .map((id) => states.get(id))
    .filter(Boolean));
  const offline = $derived(all.filter((e) => !STALE.includes(String(e.state).toLowerCase()) && e.state !== 'home').sort(byName));
  const stale = $derived(all.filter((e) => STALE.includes(String(e.state).toLowerCase()) && e.state !== '').sort(byName));
  function byName(a, b) { return String(name(a)).localeCompare(String(name(b))); }
  const max = $derived(Number(props.max) || 5);
  const rows = $derived([...offline, ...(show('stale') ? stale : [])].slice(0, max));
  const more = $derived(offline.length + (show('stale') ? stale.length : 0) - rows.length);
  const count = $derived.by(() => {
    const e = ent(props.count);
    const n = Number(e?.state);
    return e && Number.isFinite(n) ? n : null;
  });

  const word = (e) => {
    const s = String(e?.state || '');
    if (s === 'not_home') return 'Away';
    return s ? s.replace(/_/g, ' ') : 'No reading';
  };
  const compact = $derived(h < 230);
</script>

<div class="net" class:compact>
  <div class="head">
    {#if show('wan') && wan}
      <span class="pill" class:ok={wan === 'up'} class:bad={wan === 'down'} class:unk={wan === 'unknown'}>
        <span class="dot"></span>{wan === 'up' ? 'Internet up' : wan === 'down' ? 'Internet down' : 'Internet unknown'}
      </span>
    {:else}
      <span class="ttl">Network</span>
    {/if}
    <span class="count" class:bad={offline.length > 0}>
      {#if offline.length > 0}{offline.length} offline{:else if count != null}{count} connected{:else}All clients home{/if}
    </span>
  </div>

  {#if show('speed') && speed.length}
    <div class="speed">
      {#each speed as c (c.key)}
        <div class="sp">
          <span class="cap"><Icon icon={c.icon} size="1em" />{c.label}</span>
          <span class="v">{val(c.e, c.d)}<span class="u"> {c.e.attributes.unit_of_measurement || ''}</span></span>
        </div>
      {/each}
    </div>
  {/if}

  {#if show('clients')}
    <div class="rows">
      {#each rows as e (e.entity_id)}
        <div class="row" class:stale={STALE.includes(String(e.state).toLowerCase())} title={name(e)}>
          <span class="ic"><Icon icon={STALE.includes(String(e.state).toLowerCase()) ? 'mdi:help-network-outline' : entityIcon(e)} size="1.15em" /></span>
          <span class="n">{name(e)}</span>
          <span class="s">{word(e)}{#if show('when') && e.last_changed}<i>{relTime(e.last_changed)}</i>{/if}</span>
        </div>
      {/each}
      {#if !rows.length}
        <div class="empty"><Icon icon="mdi:check-network-outline" size="1.1em" /> Everyone is home</div>
      {/if}
      {#if more > 0}<div class="more">and {more} more</div>{/if}
    </div>
  {/if}
</div>

<style>
  .net { height: 100%; display: flex; flex-direction: column; gap: 10px; container-type: size; min-height: 0; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex: none; }
  .ttl { font-weight: 600; }
  .pill { display: inline-flex; align-items: center; gap: 7px; padding: 4px 12px; border-radius: 999px; font-size: .85em; font-weight: 600;
    background: rgba(127,127,127,.14); color: var(--muted); white-space: nowrap; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; box-shadow: 0 0 8px currentColor; }
  .pill.ok { color: #5bd88f; background: rgba(91,216,143,.15); }
  .pill.bad { color: #ff7a90; background: rgba(255,122,144,.15); }
  .pill.unk { color: #ffc861; background: rgba(255,200,97,.15); }
  .count { font-size: .8em; color: var(--muted); white-space: nowrap; }
  .count.bad { color: #ff7a90; font-weight: 600; }
  .speed { display: flex; gap: 8px; flex: none; }
  .sp { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; padding: 8px 10px; border-radius: 12px; background: rgba(127,127,127,.1); }
  .cap { display: flex; align-items: center; gap: 5px; font-size: .72em; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
  .v { font-size: min(1.15em, 7cqw); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
  .u { font-size: .62em; font-weight: 500; color: var(--muted); margin-left: 3px; }
  .rows { flex: 1; min-height: 0; overflow: auto; margin: 0 -6px; }
  .row { display: flex; align-items: center; gap: 10px; padding: 5px 6px; border-radius: 10px; min-height: 30px; }
  .row .ic { color: #ff7a90; display: grid; flex: none; }
  .row.stale .ic { color: var(--muted); }
  .n { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: .92em; }
  .row.stale .n { color: var(--muted); }
  .s { margin-left: auto; display: inline-flex; align-items: baseline; gap: 6px; font-size: .8em; color: #ff7a90; white-space: nowrap; }
  .row.stale .s { color: var(--muted); }
  .s i { font-style: normal; opacity: .7; font-size: .9em; }
  .empty { display: flex; align-items: center; gap: 7px; padding: 8px 6px; color: var(--muted); font-size: .88em; }
  .more { padding: 4px 6px; font-size: .78em; color: var(--muted); }
  .compact .rows { flex: 1; }
  @container (max-height: 190px) { .speed { display: none; } }
</style>
