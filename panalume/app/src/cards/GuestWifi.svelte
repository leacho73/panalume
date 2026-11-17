<script module>
  export const meta = {
    type: 'guest-wifi', name: 'Guest WiFi', icon: 'mdi:wifi', category: 'Info',
    size: { w: 300, h: 320 }, tap: 'none',
    defaults: { name: 'Guest WiFi', security: 'WPA', ecl: 'M' },
    sections: [
      { key: 'name', label: 'Title' }, { key: 'ssid', label: 'Network name' }, { key: 'password', label: 'Password' },
      { key: 'qr', label: 'QR code' }, { key: 'note', label: 'Note' },
    ],
    fields: [
      { key: 'name', label: 'Title', type: 'text' },
      { key: 'ssid', label: 'Network name (SSID)', type: 'text' },
      { key: 'password', label: 'Password', type: 'text', hint: 'Kept in the dashboard settings like any other field. It stays masked on the card until someone taps it.' },
      { key: 'security', label: 'Security', type: 'select', options: [{ value: 'WPA', label: 'WPA / WPA2 / WPA3' }, { value: 'WEP', label: 'WEP' }, { value: 'nopass', label: 'Open network' }] },
      { key: 'hidden', label: 'Hidden network', type: 'bool' },
      { key: 'show_password', label: 'Password shown without a tap', type: 'bool' },
      { key: 'note', label: 'Note under the code', type: 'text', placeholder: 'e.g. Scan to join' },
      { key: 'ecl', label: 'Error correction', type: 'select', options: [{ value: 'L', label: 'L — smallest code' }, { value: 'M', label: 'M — recommended' }, { value: 'Q', label: 'Q' }, { value: 'H', label: 'H — survives a scratched screen' }] },
    ],
  };
</script>

<script>
  // A WiFi join code drawn in the card, with the password kept behind a tap so a
  // wall panel in the kitchen isn't advertising the guest network all day.
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/tpl.js';
  import { encode, wifiPayload } from '../lib/qr.js';
  let { props, w = 300, h = 320 } = $props();
  const show = (k) => !props.hide?.[k];

  const ssid = $derived(String(t(props.ssid) ?? '').trim());
  const password = $derived(String(t(props.password) ?? ''));
  const open = $derived(/^(nopass|none|open)$/i.test(String(props.security || 'WPA')));
  const payload = $derived(
    ssid ? wifiPayload({ ssid, password, security: props.security, hidden: !!props.hidden }) : '',
  );
  const code = $derived(payload ? encode(payload, props.ecl || 'M') : null);
  // A revealed password goes back behind the tap by itself, so one glance at a
  // wall panel doesn't leave it on show for the rest of the evening.
  const HIDE_AFTER = 20e3;
  let revealed = $state(false);
  let timer;
  const reveal = (on) => {
    clearTimeout(timer);
    revealed = on;
    if (on) timer = setTimeout(() => (revealed = false), HIDE_AFTER);
  };
  $effect(() => () => clearTimeout(timer));
  const shown = $derived(!!props.show_password || open || revealed);
  const dots = $derived('•'.repeat(Math.min(16, Math.max(6, password.length))));

  // The code fills whatever room is left after the title and the password line,
  // and stays square: a QR that is squashed doesn't scan. The dark modules go
  // into a single path, a run at a time per row, instead of a rectangle each.
  const cells = $derived(code ? code.size + 8 : 0);
  const path = $derived.by(() => {
    if (!code) return '';
    let d = '';
    code.modules.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (!row[x]) continue;
        let len = 1;
        while (x + len < row.length && row[x + len]) len++;
        d += `M${x} ${y}h${len}v1h-${len}z`;
        x += len - 1;
      }
    });
    return d;
  });
</script>

<div class="wifi" style="--n:{cells}">
  <div class="head">
    {#if show('name')}<span class="title"><Icon icon="mdi:wifi" size="1.05em" />{t(props.name) || 'Guest WiFi'}</span>{/if}
    {#if show('ssid') && ssid}<span class="ssid">{ssid}</span>{/if}
  </div>

  {#if show('qr')}
    {#if !ssid}
      <div class="empty"><Icon icon="mdi:wifi-off" size="1.6em" />Set a network name to draw the code</div>
    {:else if !code}
      <div class="empty"><Icon icon="mdi:alert-circle-outline" size="1.6em" />Name and password too long for a code</div>
    {:else}
      <button class="code" onclick={() => reveal(!revealed)} aria-label={revealed ? 'Hide the password' : 'Show the password'} title={revealed ? 'Hide the password' : 'Show the password'}>
        <svg viewBox="-4 -4 {code.size + 8} {code.size + 8}" shape-rendering="crispEdges" role="img" aria-label="WiFi join code for {ssid}">
          <rect x="-4" y="-4" width={code.size + 8} height={code.size + 8} class="quiet" />
          <path d={path} class="dark" />
        </svg>
      </button>
    {/if}
  {/if}

  {#if show('password') && !open}
    {#if password}
      <button class="pass" class:on={shown} onclick={() => reveal(!revealed)} aria-label={shown ? 'Hide the password' : 'Reveal the password'}>
        <Icon icon={shown ? 'mdi:eye-off' : 'mdi:eye'} size="1em" />
        <span class="val" class:dots={!shown}>{shown ? password : dots}</span>
      </button>
    {:else}
      <div class="pass none"><Icon icon="mdi:lock-open-variant-outline" size="1em" /><span>No password set</span></div>
    {/if}
  {/if}

  {#if show('note') && t(props.note)}<div class="note">{t(props.note)}</div>{/if}
</div>

<style>
  .wifi { height: 100%; display: flex; flex-direction: column; align-items: center; gap: 8px; container-type: size; overflow: hidden; }
  .head { width: 100%; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .title { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: .95em; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .title :global(svg) { color: var(--accent); }
  .ssid { color: var(--muted); font-size: .8em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-left: 1px; }
  .code { flex: 1; min-height: 0; display: grid; place-items: center; background: none; border: 0; padding: 0; cursor: pointer; width: 100%; }
  .code svg { max-width: 100%; max-height: 100%; width: auto; height: 100%; aspect-ratio: 1; border-radius: 8px; display: block; }
  /* A code needs light around it: white card, dark modules, however dark the theme is. */
  .quiet { fill: #fff; }
  .dark { fill: #000; }
  .pass { flex: none; max-width: 100%; display: flex; align-items: center; gap: 6px; padding: 5px 10px; border: 0; border-radius: 10px; background: rgba(255,255,255,.06); color: var(--text); font: inherit; font-size: .85em; cursor: pointer; }
  .pass :global(svg) { color: var(--muted); }
  .pass.on { background: color-mix(in srgb, var(--accent) 18%, transparent); }
  .pass.on :global(svg) { color: var(--accent); }
  .pass .val { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .pass .val.dots { letter-spacing: .12em; color: var(--muted); }
  .pass.none { color: var(--muted); cursor: default; }
  .note { flex: none; color: var(--muted); font-size: .75em; text-align: center; }
  .empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--muted); font-size: .85em; text-align: center; padding: 8px; }
</style>
