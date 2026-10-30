<script module>
  import { states } from '../lib/ha.svelte.js';
  // The first Seerr-family sensor that actually carries a request list.
  const autofill = () => {
    const ids = [...states.keys()].filter((id) => /seerr|overseerr|jellyseerr/i.test(id) && id.startsWith('sensor.'));
    const withItems = ids.find((id) => Array.isArray(states.get(id)?.attributes?.items));
    return { entity: withItems || ids[0] || '' };
  };
  export const meta = {
    type: 'requests', name: 'Requests', icon: 'mdi:account-clock-outline', category: 'Media',
    size: { w: 360, h: 340 }, tap: 'none',
    defaults: { entity: '', posters: false, max: 6, confirm: true, requester: true },
    autofill,
    sections: [
      { key: 'head', label: 'Title' },
      { key: 'meta', label: 'Year, type and who asked' },
      { key: 'actions', label: 'Approve and decline' },
    ],
    fields: [
      { key: 'entity', label: 'Requests sensor', type: 'entity', domain: 'sensor', hint: 'A sensor with an items list: Seerr, Overseerr or Jellyseerr request sensors.' },
      { key: 'name', label: 'Title (blank = the sensor\'s name)', type: 'text' },
      { key: 'max', label: 'How many to show', type: 'number' },
      { key: 'posters', label: 'Load posters from the internet', type: 'bool', hint: 'Off by default: the posters come from TMDB, so a dashboard that works offline keeps them off.' },
      { key: 'requester', label: 'Show who asked', type: 'bool' },
      { key: 'confirm', label: 'Ask before approving or declining (tap twice)', type: 'bool' },
      { key: 'approve', label: 'Approve script', type: 'entity', domain: 'script', section: 'actions', hint: 'Called with the request id and its position, so a script written either way works.' },
      { key: 'decline', label: 'Decline script', type: 'entity', domain: 'script', section: 'actions' },
    ],
  };
</script>

<script>
  // Request queue from a Seerr-family sensor: what is waiting, who asked, and
  // approve or decline straight from the card. The buttons only appear when a
  // script is picked, so a read-only setup is just a list.
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { name } from '../lib/entity.js';
  import { callService } from '../lib/ha.svelte.js';
  let { props, w = 360, h = 340 } = $props();
  const show = (k) => !props.hide?.[k];

  const e = $derived(ent(props.entity));
  const items = $derived(Array.isArray(e?.attributes?.items) ? e.attributes.items : []);
  const max = $derived(Math.max(1, Math.min(20, Number(props.max) || 6)));
  const list = $derived(items.slice(0, max));
  const more = $derived(Math.max(0, items.length - list.length));
  const title = $derived(t(props.name) || name(e) || 'Requests');
  const compact = $derived(h < 200 || w < 240);
  const posters = $derived(!!props.posters);
  const approver = $derived(props.approve?.startsWith('script.') ? props.approve : '');
  const decliner = $derived(props.decline?.startsWith('script.') ? props.decline : '');
  const canAct = $derived(!!(approver || decliner));

  // One row armed at a time: the first tap asks, the second one acts.
  let armed = $state('');
  let armTimer;
  function arm(key) {
    if (!props.confirm) return true;
    if (armed === key) return true;
    armed = key;
    clearTimeout(armTimer);
    armTimer = setTimeout(() => (armed = ''), 4000);
    return false;
  }
  function run(script, item, index, key) {
    if (!script) return;
    if (!arm(key)) return;
    armed = '';
    clearTimeout(armTimer);
    // Both names go through, so a script can be written either way.
    callService('script', 'turn_on', { entity_id: script, variables: { id: item.id, slot: index } });
  }
  const typeIcon = (it) => (it?.type === 'tv' || it?.type === 'series' ? 'mdi:television-classic' : it?.type === 'movie' ? 'mdi:movie-open-outline' : 'mdi:play-box-multiple-outline');
  const metaLine = (it) => [it?.year, it?.type, props.requester !== false ? it?.by : ''].filter(Boolean).join(' · ');
</script>

<div class="rq" class:compact>
  {#if show('head') && !compact}
    <div class="head">
      <Icon icon="mdi:account-clock-outline" size="1.15em" />
      <span class="t">{title}</span>
      {#if items.length}<span class="n">{items.length}</span>{/if}
    </div>
  {/if}

  {#if !props.entity}
    <div class="msg">Pick the Seerr requests sensor in the card's settings.</div>
  {:else if !e}
    <div class="msg">Sensor not found</div>
  {:else if !list.length}
    <div class="msg"><Icon icon="mdi:check-circle-outline" size="1.4em" /><span>No requests waiting</span></div>
  {:else}
    <div class="list">
      {#each list as it, i (it.id ?? i)}
        <div class="it">
          {#if posters && it.poster && !compact}
            <img class="p" src={it.poster} alt="" loading="lazy" />
          {:else if !compact}
            <span class="ti"><Icon icon={typeIcon(it)} size="1.1em" /></span>
          {/if}
          <span class="tx">
            <span class="ti-name">{it.title || 'Untitled'}{#if compact && it.year}<span class="yr"> ({it.year})</span>{/if}</span>
            {#if show('meta') && !compact}
              {@const m = metaLine(it)}
              {#if m}<span class="sub">{m}</span>{/if}
            {/if}
          </span>
          {#if canAct && !compact && show('actions')}
            <span class="acts">
              {#if decliner}
                <button class="no" class:armed={armed === 'd' + (i)} title={armed === 'd' + (i) ? 'Tap again to decline' : 'Decline'} aria-label="Decline" data-stop
                  onclick={() => run(decliner, it, i, 'd' + (i))}><Icon icon="mdi:close" size="1em" /></button>
              {/if}
              {#if approver}
                <button class="yes" class:armed={armed === 'a' + (i)} title={armed === 'a' + (i) ? 'Tap again to approve' : 'Approve'} aria-label="Approve" data-stop
                  onclick={() => run(approver, it, i, 'a' + (i))}><Icon icon="mdi:check" size="1em" /></button>
              {/if}
            </span>
          {/if}
        </div>
      {/each}
      {#if more}
        <div class="more">and {more} more</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .rq { height: 100%; display: flex; flex-direction: column; min-height: 0; }
  .head { display: flex; align-items: center; gap: 8px; font-weight: 600; }
  .head :global(svg) { color: var(--accent); flex: none; }
  .t { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .n { flex: none; min-width: 1.6em; height: 1.6em; padding: 0 .45em; border-radius: 1em; display: grid; place-items: center; background: color-mix(in srgb, var(--accent) 25%, transparent); font-size: .78em; }
  .list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; margin-top: 6px; scrollbar-width: thin; }
  .it { display: flex; align-items: center; gap: 10px; padding: 6px 4px; border-radius: 10px; min-width: 0; }
  .p { flex: none; width: 34px; height: 50px; object-fit: cover; border-radius: 6px; background: rgba(255,255,255,.06); }
  .ti { flex: none; color: var(--muted); display: grid; place-items: center; width: 1.6em; }
  .tx { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .ti-name { font-size: .92em; overflow-wrap: anywhere; }
  .yr { color: var(--muted); }
  .sub { color: var(--muted); font-size: .76em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .acts { flex: none; display: flex; gap: 4px; }
  .acts button { width: 2em; height: 2em; border: 0; border-radius: 8px; display: grid; place-items: center; color: var(--text); background: rgba(255,255,255,.07); }
  .acts .yes { color: #8fe0a8; }
  .acts .no { color: #ff9a9a; }
  .acts .armed { background: rgba(255,120,80,.35); color: #fff; }
  .acts .yes.armed { background: rgba(80,200,120,.35); }
  .more { color: var(--muted); font-size: .76em; padding: 4px 6px; }
  .msg { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center; color: var(--muted); font-size: .85em; padding: 8px; }
  .msg :global(svg) { opacity: .5; }
  .compact .it { padding: 4px 2px; }
</style>
