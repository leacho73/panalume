<script>
  // Make Panalume the page Home Assistant opens on for whoever is signed in, in the
  // companion apps and the browser. Home Assistant's own setting (Profile → Dashboard)
  // only lists its dashboards, not apps, so this sets the same thing from here: the
  // `default_panel` in that person's Home Assistant user settings. Only shown inside
  // Home Assistant, where its frontend is the page around Panalume. With `admin`, also the
  // default for everyone (Home Assistant's own system-wide setting, which an admin sets
  // from Settings → Dashboards for its dashboards); a person's own choice still comes first.
  let { admin = false, available = $bindable(false) } = $props();
  const hass = () => { try { return window.parent !== window ? window.parent.document.querySelector('home-assistant')?.hass : null; } catch { return null; } };
  // Panalume's own panel in Home Assistant's sidebar, named after the app (its slug). If
  // the server can't say, the first part of the address, unless that's the Apps page
  // (…/hassio/ingress/…) rather than the sidebar entry.
  let panel = $state('');
  let current = $state(undefined); // the person's default page, '' for Home Assistant's own
  let everyone = $state(undefined); // the default for everyone, '' when it's Home Assistant's own
  let busy = $state(false), err = $state('');
  const read = async (scope = 'user') => (await hass().callWS({ type: `frontend/get_${scope}_data`, key: 'core' }))?.value || {};
  if (hass()) {
    fetch('api/me').then((r) => r.json()).catch(() => ({})).then(async (m) => {
      const panels = hass()?.panels || {};
      let first = '';
      try { first = window.parent.location.pathname.split('/')[1]; } catch {}
      panel = [m?.slug, first !== 'hassio' && first].find((p) => p && panels[p]) || '';
      if (!panel) return;
      current = (await read().catch(() => hass()?.userData || {})).default_panel || '';
      if (admin) everyone = (await read('system').catch(() => hass()?.systemData || {})).default_panel || '';
      available = true;
    });
  }

  async function set(on, scope = 'user') {
    busy = true; err = '';
    try {
      const v = { ...(await read(scope)) };
      if (on) v.default_panel = panel;
      else delete v.default_panel;
      await hass().callWS({ type: `frontend/set_${scope}_data`, key: 'core', value: v });
      if (scope === 'system') everyone = on ? panel : '';
      else current = on ? panel : '';
    } catch (e) {
      err = e?.message || 'Home Assistant didn’t accept that';
    }
    busy = false;
  }
</script>

{#if panel && current !== undefined}
  <div class="dp">
    {#if current === panel}
      <p class="hint">Home Assistant opens on Panalume for you, in the app and the browser.</p>
      <button class="sm" disabled={busy} onclick={() => set(false)}>Switch back to Home Assistant’s own</button>
    {:else}
      <button class="sm" disabled={busy} onclick={() => set(true)}>Open Home Assistant on Panalume</button>
      <p class="hint">For the person signed in (each Home Assistant user sets their own), in the companion app and the browser. Switch it back here, or in your Home Assistant profile under Dashboard.</p>
    {/if}
    {#if admin && everyone !== undefined}
      {#if everyone === panel}
        <p class="hint">Panalume is also the default for everyone in the home who hasn't chosen their own.</p>
        <button class="sm" disabled={busy} onclick={() => set(false, 'system')}>Stop it being the default for everyone</button>
      {:else}
        <button class="sm" disabled={busy} onclick={() => set(true, 'system')}>Make it the default for everyone</button>
        <p class="hint">For every Home Assistant user, as Home Assistant's own "Set as default" does for its dashboards. Anyone who has picked their own default page keeps theirs.</p>
      {/if}
    {/if}
    {#if err}<p class="hint err">{err}</p>{/if}
  </div>
{/if}

<style>
  .dp { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
  /* As the editor's own small buttons and hints. */
  .sm { display: inline-flex; align-items: center; gap: 5px; background: rgba(255,255,255,.07); border: 0; color: inherit; padding: 7px 11px; border-radius: 9px; font: inherit; font-size: 13px; cursor: pointer; }
  .sm:hover { background: rgba(255,255,255,.13); }
  .sm:disabled { opacity: .35; }
  .hint { color: var(--muted); font-size: 13px; line-height: 1.5; margin: 0; }
  .err { color: #ff7a7a; }
</style>
