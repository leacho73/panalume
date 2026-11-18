<script module>
  import { states } from '../lib/ha.svelte.js';

  // The Mail and Packages integration's sensors, by their usual ids: sensor.mail_usps_mail,
  // sensor.mail_royal_delivering, sensor.mail_packages_in_transit, …
  const CARRIERS = {
    usps: 'USPS', ups: 'UPS', fedex: 'FedEx', amazon: 'Amazon', capost: 'Canada Post', dhl: 'DHL', hermes: 'Hermes',
    royal: 'Royal Mail', auspost: 'AusPost', poczta_polska: 'Poczta Polska', inpost_pl: 'InPost', dpd_com_pl: 'DPD', gls: 'GLS',
  };
  // Every sensor the card reads, so they're watched (a missing one is just left out).
  const MAIL_SENSORS = ['sensor.mail_usps_mail', 'sensor.mail_packages_in_transit', 'sensor.mail_packages_delivered', 'sensor.mail_amazon_packages', 'sensor.mail_amazon_hub',
    ...Object.keys(CARRIERS).flatMap((k) => [`sensor.mail_${k}_delivering`, `sensor.mail_${k}_delivered`])];

  // A letterbox sensor and Mail and Packages' camera, if there are any.
  const autofill = () => {
    if (!states.size) return {};
    const ids = [...states.keys()];
    const box = ids.find((id) => id.startsWith('binary_sensor.') && /mail|letter|post/.test(id));
    const cam = ids.find((id) => id === 'camera.mail_usps_camera') || ids.find((id) => id.startsWith('camera.mail_'));
    return { ...(box ? { mailbox: box } : {}), ...(cam ? { camera: cam } : {}) };
  };

  export const meta = {
    type: 'mail', name: 'Mail & parcels', icon: 'mdi:mailbox-outline', category: 'Info',
    size: { w: 320, h: 260 }, tap: 'none', autofill,
    defaults: { name: '', mailbox: '', waiting: '', camera: '', parcels: true },
    sections: [{ key: 'head', label: 'Title' }, { key: 'post', label: 'Post' }, { key: 'parcels', label: 'Parcels' }, { key: 'picture', label: 'Mail picture' }],
    watch: (p) => [p.mailbox, p.waiting, p.camera, ...MAIL_SENSORS].filter(Boolean),
    fields: [
      { key: 'name', label: 'Name (blank = Post)', type: 'text', section: 'head' },
      { key: 'mailbox', label: 'Letterbox sensor (optional)', type: 'entity', domain: 'binary_sensor', section: 'post', hint: 'A door, contact or vibration sensor on the letterbox. Opened today means the post has come.' },
      { key: 'waiting', label: 'Post waiting (optional)', type: 'entity', domain: ['input_boolean', 'binary_sensor', 'switch'], section: 'post', hint: 'An on/off that\'s on while post is waiting, e.g. an input_boolean an automation turns on when the letterbox opens. A helper gets a Collected button that turns it off. Used instead of the letterbox sensor.' },
      { key: 'parcels', label: 'Parcels from Mail and Packages', type: 'bool', section: 'parcels', hint: 'Found by themselves from the Mail and Packages integration\'s sensors: what\'s on the way and delivered today, by carrier.' },
      { key: 'camera', label: 'Mail picture camera (optional)', type: 'entity', domain: 'camera', section: 'picture', hint: 'e.g. camera.mail_usps_camera, the scanned letters from Mail and Packages. Tap it for full screen.' },
    ],
  };
</script>

<script>
  // Has the post come, and what's arriving: the letterbox (a sensor on it, or an on/off
  // that says post is waiting) and parcels from the Mail and Packages integration.
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/tpl.js';
  import { callService } from '../lib/ha.svelte.js';
  import { app } from '../lib/config.svelte.js';
  import { domain } from '../lib/entity.js';
  import { clock } from '../lib/clock.svelte.js';
  let { props, h = 260 } = $props();
  const show = (k) => !props.hide?.[k];

  // Home Assistant's times come as seconds here.
  const when = (v) => new Date(typeof v === 'number' ? v * 1000 : v);
  const hm = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const today = (d) => d.toDateString() === new Date(clock.now).toDateString();
  const num = (id) => { const v = Number(states.get(id)?.state); return Number.isFinite(v) ? v : 0; };

  // Post: from "post waiting" if set, otherwise the letterbox opened today.
  const post = $derived.by(() => {
    const w = props.waiting && states.get(props.waiting);
    if (w) {
      const on = w.state === 'on';
      const at = when(w.last_changed);
      return { on, text: on ? `Post waiting${today(at) ? ' since ' + hm(at) : ''}` : 'No post waiting', clear: on && ['input_boolean', 'switch'].includes(domain(w.entity_id)) };
    }
    const b = props.mailbox && states.get(props.mailbox);
    if (b) {
      const at = when(b.last_changed);
      const on = b.state === 'on' || today(at);
      return { on, text: b.state === 'on' ? 'Letterbox open' : on ? `Post came at ${hm(at)}` : 'No post yet today' };
    }
    return null;
  });
  // Letters scanned today (USPS Informed Delivery), if Mail and Packages has them.
  const letters = $derived(states.get('sensor.mail_usps_mail') ? num('sensor.mail_usps_mail') : null);

  // Parcels: the totals, and each carrier with something on the way or delivered today.
  const parcels = $derived.by(() => {
    if (props.parcels === false) return null;
    if (!MAIL_SENSORS.some((id) => states.has(id))) return null;
    const rows = [];
    for (const [k, label] of Object.entries(CARRIERS)) {
      const coming = num(`sensor.mail_${k}_delivering`) + (k === 'amazon' ? num('sensor.mail_amazon_packages') : 0);
      const done = num(`sensor.mail_${k}_delivered`);
      const hub = k === 'amazon' ? num('sensor.mail_amazon_hub') : 0;
      if (coming || done || hub) rows.push({ k, label, coming, done, hub });
    }
    const transit = states.get('sensor.mail_packages_in_transit') ? num('sensor.mail_packages_in_transit') : rows.reduce((n, r) => n + r.coming, 0);
    const delivered = states.get('sensor.mail_packages_delivered') ? num('sensor.mail_packages_delivered') : rows.reduce((n, r) => n + r.done, 0);
    return { rows, transit, delivered };
  });

  const cam = $derived(props.camera && states.get(props.camera) ? props.camera : '');
  // A fresh picture when the camera's picture changes (it's redrawn when the mail is checked).
  const camSrc = $derived(cam ? `ha/api/camera_proxy/${cam}?t=${encodeURIComponent(states.get(cam)?.last_updated || '')}` : '');
  const nothing = $derived(!post && !parcels && !cam && letters == null);
</script>

<div class="mail">
  {#if show('head')}<div class="title"><Icon icon={post?.on ? 'mdi:mailbox-up' : 'mdi:mailbox-outline'} size="1.1em" /><span>{t(props.name) || 'Post'}</span></div>{/if}
  {#if nothing}
    <div class="none">Pick a letterbox sensor, or add the Mail and Packages integration</div>
  {:else}
    {#if post && show('post')}
      <div class="post" class:on={post.on}>
        <span class="pi"><Icon icon={post.on ? 'mdi:email-alert-outline' : 'mdi:email-outline'} size="1.2em" /></span>
        <span class="pt">{post.text}{#if letters}<small>{letters} letter{letters === 1 ? '' : 's'} today</small>{/if}</span>
        {#if post.clear}<button data-stop onclick={() => callService(domain(props.waiting), 'turn_off', {}, { entity_id: props.waiting })}>Collected</button>{/if}
      </div>
    {:else if letters != null && show('post')}
      <div class="post" class:on={letters > 0}><span class="pi"><Icon icon="mdi:email-outline" size="1.2em" /></span><span class="pt">{letters ? `${letters} letter${letters === 1 ? '' : 's'} today` : 'No letters today'}</span></div>
    {/if}
    {#if parcels && show('parcels')}
      <div class="parcels">
        <div class="tot">
          <span><b>{parcels.transit}</b> on the way</span>
          <span><b>{parcels.delivered}</b> delivered today</span>
        </div>
        {#if parcels.rows.length}
          <div class="rows">
            {#each parcels.rows as r (r.k)}
              <div class="row">
                <Icon icon={r.k === 'amazon' ? 'mdi:package-variant-closed' : 'mdi:truck-delivery-outline'} size="1em" />
                <span class="cn">{r.label}</span>
                <span class="cv">{[r.coming && `${r.coming} coming`, r.done && `${r.done} delivered`, r.hub && `${r.hub} at a locker`].filter(Boolean).join(' · ')}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
    {#if cam && show('picture') && h >= 200}
      <button class="pic" data-stop onclick={() => (app.popup = { camera: cam, name: t(props.name) || 'Post' })} aria-label="Mail picture full screen"><img src={camSrc} alt="" /></button>
    {/if}
  {/if}
</div>

<style>
  .mail { height: 100%; display: flex; flex-direction: column; gap: 10px; min-height: 0; }
  .title { display: flex; align-items: center; gap: 8px; font-weight: 600; }
  .none { flex: 1; display: grid; place-items: center; text-align: center; color: var(--muted); font-size: .9em; }
  .post { display: flex; align-items: center; gap: 10px; }
  .pi { flex: none; width: 2.2em; height: 2.2em; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.07); color: var(--muted); }
  .post.on .pi { background: color-mix(in srgb, var(--accent) 22%, transparent); color: var(--accent); }
  .pt { flex: 1; min-width: 0; display: flex; flex-direction: column; font-weight: 500; }
  .pt small { color: var(--muted); font-weight: 400; font-size: .82em; }
  .post button { flex: none; border: 0; border-radius: 99px; padding: 6px 12px; background: var(--accent); color: #0b0f16; font: inherit; font-size: .85em; font-weight: 600; }
  .parcels { display: flex; flex-direction: column; gap: 6px; min-height: 0; }
  .tot { display: flex; gap: 16px; color: var(--muted); font-size: .9em; }
  .tot b { color: var(--text); font-size: 1.25em; font-variant-numeric: tabular-nums; margin-right: 2px; }
  .rows { display: flex; flex-direction: column; gap: 4px; overflow: auto; min-height: 0; }
  .row { display: flex; align-items: center; gap: 8px; font-size: .88em; color: var(--muted); }
  .cn { color: var(--text); white-space: nowrap; }
  .cv { flex: 1; min-width: 0; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
  .pic { flex: 1; min-height: 60px; border: 0; padding: 0; border-radius: 10px; overflow: hidden; background: rgba(255,255,255,.04); }
  .pic img { width: 100%; height: 100%; object-fit: contain; display: block; }
</style>
