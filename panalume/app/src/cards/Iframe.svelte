<script module>
  export const meta = {
    type: 'iframe', name: 'Web page', icon: 'mdi:web', category: 'Media',
    size: { w: 480, h: 320 }, tap: 'none',
    defaults: { url: '', hide_ha: true },
    fields: [
      { key: 'url', label: 'URL', type: 'text', hint: 'For a page on Home Assistant, a path like /lovelace/0 works at home and away.' },
      { key: 'ha_view', label: 'Or one of Home Assistant\'s own dashboards', type: 'ha-view' },
      { key: 'hide_ha', label: 'Hide Home Assistant\'s header and sidebar', type: 'bool', hint: 'When the page is part of Home Assistant.' },
    ],
  };

  // Is Panalume on the same address as Home Assistant (opened from its sidebar)?
  // Only then can a Home Assistant page in the card sign in and be tidied up.
  let sameHa;
  const onHa = () => (sameHa ??= fetch('/auth/providers', { cache: 'no-store' }).then((r) => r.ok && r.json()).then((j) => !!(Array.isArray(j) || j?.providers)).catch(() => false));
</script>

<script>
  import { t } from '../lib/tpl.js';
  let { props, editing } = $props();
  const src = $derived(props.ha_view || t(props.url));
  let frame = $state();
  let haOk = $state(true);
  $effect(() => { if (props.ha_view) onHa().then((v) => (haOk = v)); else haOk = true; });

  // Home Assistant's own page in the card: hide its header and sidebar. It's on our
  // address, so its page can be reached; checked twice a second, as Home Assistant
  // builds the page in stages and rebuilds parts of it when you move around in it.
  const CSS = {
    drawer: '.sidebar-shell{display:none!important}.app-content{padding-inline-start:0!important}',
    root: '.header{display:none!important}#view,hui-view-container{padding-top:0!important;min-height:100vh!important}',
  };
  function tidy() {
    let doc;
    try { doc = frame?.contentDocument; } catch { return; }
    const ms = doc?.querySelector('home-assistant')?.shadowRoot?.querySelector('home-assistant-main')?.shadowRoot;
    if (!ms) return;
    const add = (root, css) => {
      if (!root || root.querySelector('style[data-panalume]')) return;
      const s = doc.createElement('style'); s.dataset.panalume = ''; s.textContent = css; root.appendChild(s);
    };
    add(ms.querySelector('ha-drawer')?.shadowRoot, CSS.drawer);
    add(ms.querySelector('ha-panel-lovelace')?.shadowRoot?.querySelector('hui-root')?.shadowRoot, CSS.root);
  }
  $effect(() => {
    if (!props.hide_ha || !frame) return;
    const id = setInterval(tidy, 500);
    const load = () => { tidy(); setTimeout(tidy, 300); };
    frame.addEventListener('load', load);
    return () => { clearInterval(id); frame.removeEventListener('load', load); };
  });
</script>

{#if props.ha_view && !haOk}
  <div class="msg">Home Assistant's dashboards show here when Panalume is opened from Home Assistant's sidebar.</div>
{:else}
  <iframe bind:this={frame} {src} title="" style:pointer-events={editing ? 'none' : 'auto'} loading="lazy"></iframe>
{/if}

<style>
  iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; border-radius: inherit; background: transparent; }
  .msg { height: 100%; display: grid; place-items: center; text-align: center; color: var(--muted); font-size: .85em; padding: 0 12px; }
</style>
