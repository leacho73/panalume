<script>
  import Stage from './components/Stage.svelte';
  import Editor from './components/Editor.svelte';
  import Popup from './components/Popup.svelte';
  import Icon from './components/Icon.svelte';
  import { app, load, save, layout, setPanelSide, DEVICES, MODE_SHORT, detectDevice, setView, removeSelected, duplicateSelected, selectedPlacement, changed, undo, undoLast, selectionSet, ensureEditable, zoneList, groupSelected } from './lib/config.svelte.js';
  import { conn, toasts, watchEntities, states, subscribe } from './lib/ha.svelte.js';
  import { loadMoney } from './lib/money.svelte.js';
  import { HUB_CHARGING, MYENERGI_OWN } from './lib/octopus.js';
  import { GRID } from './lib/config.svelte.js';
  import { setKiosk } from './lib/kiosk.js';
  import { connectLive } from './lib/live.js';
  import { param } from './lib/params.js';
  import { cards as cardTypes } from './lib/registry.js';
  import { reloadFromServer, startView } from './lib/config.svelte.js';

  let vw = $state(innerWidth);
  const autoDevice = detectDevice();
  // The editor panel docks left, right or along the bottom; the dashboard gets the rest of the width.
  const side = $derived(app.panelSide || (vw > 760 ? 'right' : 'bottom'));
  const panelOpen = $derived(app.editing && !!app.panel);
  const panelW = $derived(vw > 760 ? 360 : Math.min(360, Math.round(vw * 0.6)));
  const sideW = $derived(panelOpen && side !== 'bottom' ? panelW : 0);
  const available = $derived(vw - sideW);
  // Toolbar dock buttons: pick a side (opening the panel), or tap the current side again to hide it.
  function dock(s) {
    if (app.panel && side === s) app.panel = null;
    else { setPanelSide(s); app.panel ??= 'add'; }
  }

  load();

  // Subscribe only to entities the dashboard uses (all of them while editing, for pickers).
  let watchTimer;
  let myenergiOwn = $state(null);
  let askedMyenergi = false;
  $effect(() => {
    if (!app.config || !conn.connected) return;
    loadMoney();
    if (app.editing) return watchEntities(null);
    const ids = new Set();
    const walk = (v) => {
      if (typeof v === 'string') { if (/^[a-z_]+\.[a-z0-9_]+$/.test(v)) ids.add(v); }
      else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x);
    };
    walk(app.config.cards);
    // Extra entities a card reads without having them as settings (meta.watch).
    for (const c of Object.values(app.config.cards)) for (const id of cardTypes[c.type]?.meta.watch?.(c.props || {}) || []) ids.add(id);
    // Cards on the myenergi hub's combined charging sensor show the device's own
    // reading instead: look up the Zappi / Eddi sensors once, then watch them.
    if ([...ids].some((id) => HUB_CHARGING.test(id))) {
      if (myenergiOwn == null && !askedMyenergi) {
        askedMyenergi = true;
        const stop = subscribe({ type: 'render_template', template: MYENERGI_OWN }, (ev) => { myenergiOwn = String(ev.result || ''); queueMicrotask(stop); });
      }
      for (const id of (myenergiOwn || '').split(',')) if (id) ids.add(id);
    }
    if (app.popup?.entity) ids.add(app.popup.entity);
    if (app.popup?.camera) ids.add(app.popup.camera);
    // Members of light / switch groups, for "3/5 on" counts.
    for (const id of [...ids]) {
      const m = states.get(id)?.attributes.entity_id;
      if (Array.isArray(m)) m.forEach((x) => ids.add(x));
    }
    clearTimeout(watchTimer);
    watchTimer = setTimeout(() => watchEntities(ids), 50);
  });

  // Hide HA's header bar: per device (Layout tab) or ?kiosk / ?kiosk=0 in the URL.
  const kioskParam = param('kiosk');
  // ?noedit: no pencil and no E shortcut (wall tablets that shouldn't be edited).
  // Fully Kiosk (with its JavaScript interface on) tells us when the screen comes back on.
  try { window.fully?.bind?.('screenOn', "window.dispatchEvent(new Event('panalume-wake'))"); } catch {}
  const noEditParam = param('noedit') != null && param('noedit') !== '0';
  // Only Home Assistant admins can edit (the server checks too).
  fetch('api/me').then((r) => r.json()).then((m) => { app.canEdit = m.admin !== false; if (!app.canEdit) app.editing = false; }).catch(() => {});
  const noEdit = $derived(noEditParam || !app.canEdit);
  // No sidebar and no Navigation card on this view: a small views menu instead,
  // so there's always a way to switch views.
  let viewsOpen = $state(false);
  const needViews = $derived(!app.editing && app.config?.views.length > 1 && !layout().sidebar.enabled && !(layout().zones[app.view] || []).some((p) => app.config.cards[p.card]?.type === 'nav'));
  $effect(() => {
    if (!app.config) return;
    const on = kioskParam != null ? kioskParam !== '0' : !!app.config.layouts[app.device]?.kiosk;
    setKiosk(on);
  });

  const th = $derived(app.config?.theme);
  const rootStyle = $derived(th ? [
    `--text:${th.text}`, `--muted:${th.muted}`, `--accent:${th.accent}`, `--on:${th.on}`,
    `--card-bg:${th.cardBg}`, `--card-border:${th.cardBorder}`, `--card-shadow:${th.cardShadow}`,
    `--radius:${th.cardRadius}px`, `--pad:${th.cardPadding}px`, `--blur:${th.cardBlur}px`, `--sidebar-bg:${th.sidebarBg}`,
    `--font:${th.font}`, `--page-bg:${th.background}`,
  ].join(';') : '');
  $effect(() => { document.documentElement.style.cssText = rootStyle; });

  function toggleEdit() {
    app.editing = !app.editing;
    app.selected = null;
    if (app.editing) app.panel ??= 'add';
    else { if (app.dirty) save(); app.device = detectDevice(); }
  }

  function key(e) {
    if (e.target.closest('input,textarea,select,[contenteditable]')) return;
    if (e.key === 'e' && !e.ctrlKey && !e.metaKey && !noEdit) return toggleEdit();
    if (!app.editing) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); return undoLast(); }
    const p = selectedPlacement();
    if (e.key === 'Escape') { app.selected = null; app.multi = []; return; }
    if (!p) return;
    if (e.key === 'Delete' || e.key === 'Backspace') return removeSelected(false);
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); return duplicateSelected(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'g') { e.preventDefault(); return groupSelected(); }
    const step = e.shiftKey ? 1 : GRID;
    const mv = { ArrowLeft: ['x', -step], ArrowRight: ['x', step], ArrowUp: ['y', -step], ArrowDown: ['y', step] }[e.key];
    if (mv) {
      e.preventDefault();
      ensureEditable();
      const list = zoneList(app.selected.zone);
      for (const i of selectionSet()) list[i][mv[0]] = Math.max(0, list[i][mv[0]] + mv[1]);
      changed();
    }
  }

  // After some minutes without a touch, go back to this screen's own view and close any
  // pop-up. For wall tablets: ?return=5 in the address, or this device's setting in the
  // Layout tab (the address wins, so kiosk apps that can't change the address still work).
  const returnParam = Number(param('return'));
  const returnMins = () => (returnParam > 0 ? returnParam : Math.max(0, Number(app.config?.layouts[app.device]?.return_mins) || 0));
  let lastTouch = Date.now();
  for (const ev of ['pointerdown', 'keydown', 'wheel']) addEventListener(ev, () => (lastTouch = Date.now()), { capture: true, passive: true });
  setInterval(() => {
    const mins = returnMins();
    if (!mins || !app.config || app.editing || Date.now() - lastTouch < mins * 60e3) return;
    app.popup = null;
    const home = startView();
    if (home && app.view !== home) setView(home);
  }, 10e3);

  // Live: reload the layout as soon as another screen saves, and the page after an add-on update.
  connectLive({ onConfig: reloadFromServer, canReload: () => !app.editing && !app.dirty });
</script>

<svelte:window bind:innerWidth={vw} onkeydown={key} onhashchange={() => { const v = location.hash.slice(1); if (v) app.view = v; }} />
<svelte:head>
  {#if th?.fontUrl}<link rel="stylesheet" href={th.fontUrl} />{/if}
  {#if th?.customCss}{@html `<style>${th.customCss.replace(/<\/style/gi, '')}</style>`}{/if}
</svelte:head>

{#if app.config}
  <div class="app" class:noblur={!Number(th.cardBlur)} class:editing={app.editing} class:sheet={panelOpen && side === 'bottom'}>
    <Stage {available} {autoDevice} offset={panelOpen && side === 'left' ? panelW : 0} />
  </div>

  {#if app.editing}
    {#if app.panel}<Editor {side} width={panelW} />{/if}
    <div class="bar">
      <button class="done" onclick={toggleEdit} aria-label="Done"><Icon icon="mdi:check" size="1.2em" /><span class="lbl">Done</span></button>
      <button title="Undo (Ctrl+Z)" disabled={!undo.count && !app.dirty} onclick={undoLast}><Icon icon="mdi:undo" size="1.2em" /></button>
      <select value={app.view} onchange={(e) => setView(e.currentTarget.value)} title="View">
        {#each app.config.views as v}<option value={v.id}>{v.name}</option>{/each}
      </select>
      <select value={app.device} onchange={(e) => { app.device = e.currentTarget.value; app.selected = null; app.multi = []; }} title="Preview / edit device">
        {#each Object.entries(DEVICES) as [k, d]}<option value={k}>{d.label}{k !== 'tablet' ? ` (${MODE_SHORT[app.config.layouts[k].mode] || app.config.layouts[k].mode})` : ''}</option>{/each}
      </select>
      <span class="docks">
        {#each [['left', 'mdi:dock-left'], ['bottom', 'mdi:dock-bottom'], ['right', 'mdi:dock-right']] as [s, ic]}
          <button class:on={!!app.panel && side === s} title={app.panel && side === s ? 'Hide the panel' : `Panel on the ${s}`} aria-label={app.panel && side === s ? 'Hide the panel' : `Panel on the ${s}`} onclick={() => dock(s)}><Icon icon={ic} size="1.2em" /></button>
        {/each}
      </span>
      <span class="st">{app.saving ? 'Saving…' : app.dirty ? 'Unsaved' : 'Saved'}</span>
    </div>
  {/if}
  {#if needViews}
    <div class="views-fab" class:open={viewsOpen}>
      <button class="vf" onclick={() => (viewsOpen = !viewsOpen)} aria-label="Views"><Icon icon={viewsOpen ? 'mdi:close' : 'mdi:menu'} size="1.1em" /></button>
      {#if viewsOpen}
        <div class="vlist">
          {#each app.config.views as v (v.id)}<button class:on={app.view === v.id} onclick={() => { setView(v.id); viewsOpen = false; }}><Icon icon={v.icon || 'mdi:view-dashboard-outline'} size="1.1em" /> {v.name}</button>{/each}
        </div>
      {/if}
    </div>
  {/if}
  {#if !app.editing && !noEdit}
    <button class="edit-fab" onclick={toggleEdit} aria-label="Edit dashboard"><Icon icon="mdi:pencil" size="1.1em" /></button>
  {/if}
{/if}

{#if !conn.connected}<div class="offline"><Icon icon="mdi:lan-disconnect" size="1em" /> Connecting to Home Assistant…</div>{/if}
<div class="toasts">{#each toasts as t (t.id)}<div class="toast">{t.text}</div>{/each}</div>
<Popup />

<style>
  .app { min-height: 100dvh; }
  .app.editing { padding-bottom: calc(var(--bar-h) + 12px); } /* room to scroll the last cards clear of the toolbar */
  .app.editing.sheet { padding-bottom: calc(var(--bar-h) + 45dvh + 12px); } /* …and of the panel when it's docked along the bottom */
  .noblur :global(.card) { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
  .bar { position: fixed; left: 0; right: 0; bottom: 0; height: var(--bar-h); z-index: 850; display: flex; align-items: center; justify-content: center; justify-content: safe center; gap: 6px; padding: 0 10px; overflow-x: auto; background: rgba(20,24,36,.98); border-top: 1px solid rgba(255,255,255,.1); box-shadow: 0 -6px 24px rgba(0,0,0,.35); font-size: 13px; } /* always docked along the bottom edge, full width */
  .bar > * { flex: none; }
  .bar select { width: auto; max-width: 11em; } /* not full width like other dropdowns */
  .docks { display: inline-flex; gap: 2px; padding: 2px; border-radius: 12px; background: rgba(255,255,255,.04); }
  .bar .docks button { padding: 0 8px; background: none; }
  .bar .docks button.on { background: rgba(122,162,255,.22); color: var(--accent); }
  .bar button, .bar select { background: rgba(255,255,255,.07); border: 0; color: inherit; height: 36px; padding: 0 10px; border-radius: 10px; font: inherit; display: inline-flex; align-items: center; gap: 6px; }
  .bar button:disabled { opacity: .35; }
  .bar .done { background: var(--accent); color: #000; font-weight: 600; }
  .st { color: var(--muted); padding: 0 6px; min-width: 56px; }
  .edit-fab { position: fixed; top: 10px; right: 10px; z-index: 700; width: 36px; height: 36px; border-radius: 50%; border: 0; background: rgba(255,255,255,.06); color: var(--muted); opacity: .25; display: grid; place-items: center; transition: opacity .2s; }
  .edit-fab:hover { opacity: 1; }
  .views-fab { position: fixed; top: 10px; left: 10px; z-index: 700; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
  .vf { width: 36px; height: 36px; border-radius: 50%; border: 0; background: rgba(255,255,255,.06); color: var(--muted); opacity: .5; display: grid; place-items: center; transition: opacity .2s; }
  .vf:hover, .open .vf { opacity: 1; }
  .vlist { display: flex; flex-direction: column; gap: 2px; padding: 6px; border-radius: 14px; background: rgba(20,24,34,.95); box-shadow: 0 10px 30px rgba(0,0,0,.45); border: 1px solid rgba(255,255,255,.08); }
  .vlist button { display: flex; align-items: center; gap: 10px; padding: 9px 14px 9px 10px; border: 0; border-radius: 10px; background: none; color: var(--text); font: inherit; text-align: left; white-space: nowrap; }
  .vlist button.on { background: rgba(122,162,255,.18); }
  .offline { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 950; background: rgba(255,120,80,.9); color: #000; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; display: flex; gap: 6px; align-items: center; }
  .toasts { position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); z-index: 960; display: flex; flex-direction: column; gap: 6px; }
  .toast { background: #2a2f40; padding: 10px 16px; border-radius: 12px; box-shadow: 0 6px 20px rgba(0,0,0,.4); font-size: 14px; }
  @media (max-width: 480px) {
    .bar { gap: 4px; padding: 0 6px; }
    .bar select { max-width: 6.5em; padding: 0 6px; }
    .bar .lbl, .st { display: none; } /* folded phones: Done becomes just the tick; no Saved label */
  }
</style>
