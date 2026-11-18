<script>
  // Make Panalume the page Home Assistant opens on for whoever is signed in, in the
  // companion apps and the browser. Home Assistant's own setting (Profile → Dashboard)
  // only lists its dashboards, not apps, so this sets the same thing from here: the
  // `default_panel` in that person's Home Assistant user settings. Only shown inside
  // Home Assistant, where its frontend is the page around Panalume.
  const hass = () => { try { return window.parent !== window ? window.parent.document.querySelector('home-assistant')?.hass : null; } catch { return null; } };
  // Panalume's own panel in Home Assistant's sidebar, named after the app (its slug). If
  // the server can't say, the first part of the address, unless that's the Apps page
  // (…/hassio/ingress/…) rather than the sidebar entry.
  let panel = $state('');
  let current = $state(undefined); // the person's default page, '' for Home Assistant's own
  let busy = $state(false), err = $state('');
  const read = async () => (await hass().callWS({ type: 'frontend/get_user_data', key: 'core' }))?.value || {};
  if (hass()) {
    fetch('api/me').then((r) => r.json()).catch(() => ({})).then(async (m) => {
      const panels = hass()?.panels || {};
      let first = '';
      try { first = window.parent.location.pathname.split('/')[1]; } catch {}
      panel = [m?.slug, first !== 'hassio' && first].find((p) => p && panels[p]) || '';
      if (panel) current = (await read().catch(() => hass()?.userData || {})).default_panel || '';
    });
  }

  async function set(on) {
    busy = true; err = '';
    try {
      const v = { ...(await read()) };
      if (on) v.default_panel = panel;
      else delete v.default_panel;
      await hass().callWS({ type: 'frontend/set_user_data', key: 'core', value: v });
      current = on ? panel : '';
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
