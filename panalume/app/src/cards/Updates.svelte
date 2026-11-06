<script module>
  export const meta = {
    type: 'updates', name: 'Updates & notifications', icon: 'mdi:bell-badge-outline', category: 'Info',
    size: { w: 360, h: 320 }, tap: 'none',
    defaults: { exclude: [], backup: false, confirm: true },
    sections: [
      { key: 'head', label: 'Title' },
      { key: 'updates', label: 'Updates' },
      { key: 'notifications', label: 'Notifications' },
      { key: 'repairs', label: 'Repairs' },
      { key: 'versions', label: 'Version numbers' },
      { key: 'install', label: 'Install buttons' },
    ],
    fields: [
      { key: 'title', label: 'Title (blank = Updates & notifications)', type: 'text' },
      { key: 'exclude', label: 'Leave out these updates', type: 'entities', domain: 'update' },
      { key: 'confirm', label: 'Tap Install twice to confirm', type: 'bool' },
      { key: 'backup', label: 'Back up before installing (when the update supports it)', type: 'bool' },
    ],
  };
</script>

<script>
  // Everything in Home Assistant that wants attention, in one card: pending
  // updates (core, OS, apps, HACS, device firmware…) with Install, persistent
  // notifications with Dismiss, and open repairs. Updates come from a live
  // template so the card finds every update entity without having to watch
  // them all; notifications from HA's own notification subscription.
  import Icon from '../components/Icon.svelte';
  import { subscribe, send, callService, conn, haImage } from '../lib/ha.svelte.js';
  import { money } from '../lib/money.svelte.js';
  import { relTime } from '../lib/entity.js';
  import { clock } from '../lib/clock.svelte.js';
  import { t } from '../lib/tpl.js';
  let { props, w = 360, h = 320 } = $props();
  const show = (k) => !props.hide?.[k];

  // ---- updates ----
  // One template lists every update entity that's on (an update is waiting).
  const TPL = `{% set ns = namespace(l=[]) %}{% for s in states.update | selectattr('state','eq','on') %}{% set ns.l = ns.l + [{
    'id': s.entity_id, 'name': s.name, 'title': s.attributes.title, 'from': s.attributes.installed_version,
    'to': s.attributes.latest_version, 'url': s.attributes.release_url, 'busy': s.attributes.in_progress,
    'pct': s.attributes.update_percentage, 'pic': s.attributes.entity_picture, 'f': s.attributes.supported_features }] %}{% endfor %}{{ ns.l | tojson }}`;
  let rawUpdates = $state([]);
  $effect(() => {
    if (!show('updates')) return void (rawUpdates = []);
    return subscribe({ type: 'render_template', template: TPL }, (ev) => {
      if (ev.error) return;
      let r = ev.result;
      // HA may hand the list back already parsed, or as the JSON text.
      if (typeof r === 'string') try { r = JSON.parse(r); } catch { r = []; }
      rawUpdates = Array.isArray(r) ? r : [];
    });
  });
  const excluded = $derived(new Set(props.exclude || []));
  const updates = $derived(rawUpdates.filter((u) => u?.id && !excluded.has(u.id)).sort((a, b) => !!b.busy - !!a.busy || String(a.name).localeCompare(String(b.name))));

  // update.install supports: 1 = install, 8 = backup, 16 = release notes.
  const canInstall = (u) => (Number(u.f) & 1) === 1;
  const canBackup = (u) => (Number(u.f) & 8) === 8;
  const busy = (u) => u.busy === true || u.busy === 'true' || (typeof u.busy === 'number' && u.busy >= 0);
  const pct = (u) => (Number.isFinite(Number(u.pct)) && u.pct !== null ? Number(u.pct) : typeof u.busy === 'number' ? u.busy : null);
  // "Home Assistant Core Update" → "Home Assistant Core".
  const uName = (u) => String(u.title || u.name || u.id).replace(/\s+(update|firmware)$/i, '') || u.id;

  let armed = $state(null), armTimer;
  let started = $state({});
  function install(u) {
    if (props.confirm !== false && armed !== u.id) {
      armed = u.id;
      clearTimeout(armTimer);
      armTimer = setTimeout(() => (armed = null), 3000);
      return;
    }
    armed = null;
    started[u.id] = true;
    setTimeout(() => delete started[u.id], 15000);
    callService('update', 'install', props.backup && canBackup(u) ? { backup: true } : {}, { entity_id: u.id });
  }
  const skip = (u) => callService('update', 'skip', {}, { entity_id: u.id });

  // ---- notifications ----
  let notes = $state({});
  $effect(() => {
    if (!show('notifications')) return void (notes = {});
    return subscribe({ type: 'persistent_notification/subscribe' }, (ev) => {
      const n = ev.notifications || {};
      if (ev.type === 'current') notes = { ...n };
      else if (ev.type === 'removed') { const x = { ...notes }; for (const id of Object.keys(n)) delete x[id]; notes = x; }
      else notes = { ...notes, ...n };
    });
  });
  const notifications = $derived(Object.values(notes).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)));
  const dismiss = (n) => callService('persistent_notification', 'dismiss', { notification_id: n.notification_id });
  const dismissAll = () => callService('persistent_notification', 'dismiss_all');

  // Notification text is markdown; escape first, then a few safe bits of formatting.
  // Links to Home Assistant's own pages can't open from here, so they show as text.
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const md = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '<b>$1</b>')
    .replace(/\n/g, '<br>');

  // ---- repairs ----
  let issues = $state([]);
  let words = $state.raw({});
  let refresh = $state(0);
  $effect(() => {
    const i = setInterval(() => refresh++, 5 * 60e3);
    return () => clearInterval(i);
  });
  $effect(() => {
    refresh;
    if (!show('repairs') || !conn.connected) return void (issues = []);
    let alive = true;
    send({ type: 'repairs/list_issues' }).then(async (r) => {
      const list = (r?.issues || []).filter((x) => !x.ignored && !x.dismissed_version);
      if (!alive) return;
      issues = list;
      const domains = [...new Set(list.map((x) => x.translation_domain || x.domain))];
      if (!domains.length) return;
      const lang = String(money.locale || 'en').split('-')[0] || 'en';
      const get = (language) => send({ type: 'frontend/get_translations', language, category: 'issues', integration: domains }).then((x) => x?.resources || {}).catch(() => ({}));
      const [en, own] = await Promise.all([get('en'), lang === 'en' ? {} : get(lang)]);
      if (alive) words = { ...en, ...own };
    }).catch(() => alive && (issues = []));
    return () => (alive = false);
  });
  const fill = (s, ph) => String(s).replace(/\{(\w+)\}/g, (m, k) => (ph?.[k] ?? m));
  const issueTitle = (x) => {
    const k = `component.${x.translation_domain || x.domain}.issues.${x.translation_key}.title`;
    return words[k] ? fill(words[k], x.translation_placeholders) : `${x.domain}: ${String(x.translation_key || x.issue_id).replace(/_/g, ' ')}`;
  };
  const SEV = { critical: '#ff6b6b', error: '#ff6b6b', warning: '#ffc861' };

  // ---- layout ----
  const total = $derived(updates.length + notifications.length + issues.length);
  const small = $derived(h < 170);
  const title = $derived(t(props.title) || 'Updates & notifications');
  const now = $derived(clock.now);
  const ago = (iso) => (now, relTime(iso));
  let open = $state(null);
  const toggleOpen = (k) => (open = open === k ? null : k);
</script>

<div class="upd" class:small>
  {#if show('head') && !small}
    <div class="head">
      <Icon icon={total ? 'mdi:bell-badge-outline' : 'mdi:bell-check-outline'} size="1.2em" />
      <span class="t">{title}</span>
      {#if total}<span class="count">{total}</span>{/if}
    </div>
  {/if}

  {#if !total}
    <div class="msg"><Icon icon="mdi:check-circle-outline" size="2em" /><span>All up to date</span></div>
  {:else}
    <div class="list" data-stop>
      {#if updates.length}
        <div class="grp"><Icon icon="mdi:package-up" size="1em" />{updates.length === 1 ? '1 update' : `${updates.length} updates`}</div>
        {#each updates as u (u.id)}
          {@const b = busy(u) || started[u.id]}
          {@const p = pct(u)}
          <div class="row" class:busy={b}>
            <!-- Only pictures Home Assistant serves itself: Panalume doesn't load anything from the internet you haven't chosen (most update pictures are on brands.home-assistant.io). -->
            {#if String(u.pic || '').startsWith('/')}<img class="pic" src={haImage(u.pic)} alt="" loading="lazy" onerror={(e) => (e.currentTarget.style.visibility = 'hidden')} />
            {:else}<span class="ico"><Icon icon="mdi:package-up" size="1.1em" /></span>{/if}
            <div class="what">
              <button class="tap" onclick={() => toggleOpen(u.id)}>
              <span class="ti">{uName(u)}</span>
              {#if b}
                <span class="sub acc">Installing{p != null ? ` · ${Math.round(p)}%` : '…'}</span>
                <span class="prog"><i style="width:{p != null ? p : 100}%" class:indet={p == null}></i></span>
              {:else if show('versions') && (u.from || u.to)}
                <span class="sub">{u.from || '?'} <Icon icon="mdi:arrow-right" size=".9em" /> <b>{u.to || '?'}</b></span>
              {/if}
              </button>
              <!-- Links and buttons can't sit inside another button, so these follow it. -->
              {#if open === u.id && !b}
                <span class="more">
                  {#if u.url}<a href={u.url} target="_blank" rel="noopener"><Icon icon="mdi:open-in-new" size="1em" />Release notes</a>{/if}
                  <button class="lnk" onclick={() => skip(u)}><Icon icon="mdi:debug-step-over" size="1em" />Skip this version</button>
                </span>
              {/if}
            </div>
            {#if show('install') && canInstall(u) && !b && !small}
              <button class="act" class:armed={armed === u.id} onclick={() => install(u)}>{armed === u.id ? 'Confirm' : 'Install'}</button>
            {/if}
          </div>
        {/each}
      {/if}

      {#if issues.length}
        <div class="grp"><Icon icon="mdi:tools" size="1em" />{issues.length === 1 ? '1 repair' : `${issues.length} repairs`}</div>
        {#each issues as x (x.domain + x.issue_id)}
          <div class="row" style="--c:{SEV[x.severity] || 'var(--muted)'}">
            <span class="ico sev"><Icon icon={x.severity === 'warning' ? 'mdi:alert-outline' : 'mdi:alert-circle-outline'} size="1.1em" /></span>
            <span class="what"><span class="ti wrap">{issueTitle(x)}</span>
              {#if x.learn_more_url && !small}<a class="sub" href={x.learn_more_url} target="_blank" rel="noopener"><Icon icon="mdi:open-in-new" size="1em" />Learn more</a>{/if}
            </span>
          </div>
        {/each}
      {/if}

      {#if notifications.length}
        <div class="grp"><Icon icon="mdi:bell-outline" size="1em" />{notifications.length === 1 ? '1 notification' : `${notifications.length} notifications`}
          {#if notifications.length > 1 && !small}<button class="clear" onclick={dismissAll}>Dismiss all</button>{/if}</div>
        {#each notifications as n (n.notification_id)}
          <div class="row note" class:open={open === n.notification_id}>
            <span class="ico"><Icon icon="mdi:bell-outline" size="1.1em" /></span>
            <!-- Not a <button>: the message can contain links. -->
            <div class="what tap" role="button" tabindex="0" aria-expanded={open === n.notification_id} onclick={() => toggleOpen(n.notification_id)} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggleOpen(n.notification_id))}>
              <span class="ti">{n.title || 'Notification'}</span>
              {#if n.message}<span class="body">{@html md(n.message)}</span>{/if}
              {#if n.created_at && !small}<span class="sub">{ago(n.created_at)}</span>{/if}
            </div>
            <button class="x" onclick={() => dismiss(n)} aria-label="Dismiss" title="Dismiss"><Icon icon="mdi:close" size="1em" /></button>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .upd { height: 100%; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
  .head { display: flex; align-items: center; gap: 8px; font-weight: 600; }
  .head :global(svg) { color: var(--accent); flex: none; }
  .t { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .count { flex: none; min-width: 1.6em; padding: 0 .45em; height: 1.6em; display: grid; place-items: center; border-radius: 1em; background: var(--accent); color: #000; font-size: .78em; font-weight: 700; }
  .msg { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--muted); font-size: .85em; text-align: center; }
  .msg :global(svg) { color: #5bd88f; }
  .small .msg { flex-direction: row; }
  .small .msg :global(svg) { width: 1.3em; height: 1.3em; }
  .list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 3px; margin-right: -6px; padding-right: 6px; scrollbar-width: thin; mask-image: linear-gradient(to bottom, #000 calc(100% - 18px), transparent); }
  .grp { display: flex; align-items: center; gap: 5px; font-size: .72em; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin-top: 6px; }
  .grp:first-child { margin-top: 0; }
  .clear { margin-left: auto; background: none; border: 0; color: var(--accent); font: inherit; letter-spacing: inherit; text-transform: none; cursor: pointer; padding: 0; }
  .row { display: flex; align-items: center; gap: 9px; background: rgba(255,255,255,.04); border-radius: 10px; padding: 6px 8px; }
  .row.note { align-items: flex-start; }
  .pic, .ico { width: 26px; height: 26px; flex: none; border-radius: 7px; display: grid; place-items: center; object-fit: contain; }
  .ico { background: rgba(255,255,255,.06); color: var(--accent); }
  .ico.sev { color: var(--c); background: color-mix(in srgb, var(--c) 15%, transparent); }
  .what, .tap { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; text-align: left; background: none; border: 0; padding: 0; color: inherit; font: inherit; cursor: pointer; }
  span.what, div.what:not(.tap) { cursor: default; }
  .ti { font-size: .9em; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ti.wrap, .open .ti { white-space: normal; }
  .sub { display: flex; align-items: center; gap: 4px; font-size: .75em; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; text-decoration: none; }
  .sub b { color: var(--fg, inherit); font-weight: 600; }
  .sub.acc { color: var(--accent); }
  .body { font-size: .78em; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
  .open .body { display: block; max-height: 10em; overflow: auto; }
  .body :global(a) { color: var(--accent); }
  .body :global(code) { font-size: .95em; background: rgba(255,255,255,.08); padding: 0 .25em; border-radius: 4px; }
  .more { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 3px; font-size: .75em; }
  .more .lnk { background: none; border: 0; padding: 0; font: inherit; }
  .more a, .more .lnk { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); text-decoration: none; cursor: pointer; }
  .prog { height: 3px; border-radius: 2px; background: rgba(255,255,255,.1); overflow: hidden; margin-top: 2px; }
  .prog i { display: block; height: 100%; background: var(--accent); border-radius: 2px; transition: width .4s; }
  .prog i.indet { width: 35% !important; animation: slide 1.2s ease-in-out infinite; }
  @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(290%); } }
  .act { flex: none; border: 0; border-radius: 8px; padding: 5px 11px; font: inherit; font-size: .78em; font-weight: 600; cursor: pointer; color: inherit; background: color-mix(in srgb, var(--accent) 22%, transparent); }
  .act.armed { background: color-mix(in srgb, var(--accent) 55%, transparent); animation: ask .9s ease-in-out infinite; }
  @keyframes ask { 50% { transform: scale(1.06); } }
  .x { flex: none; width: 24px; height: 24px; border: 0; border-radius: 50%; background: none; color: var(--muted); display: grid; place-items: center; cursor: pointer; }
  .x:hover { background: rgba(255,255,255,.08); color: inherit; }
  .small .row { padding: 4px 8px; }
  .small .pic, .small .ico { width: 20px; height: 20px; }
</style>
