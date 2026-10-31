<script module>
  import { states } from '../lib/ha.svelte.js';
  // An Unraid (or similar NAS) box at a glance: how full the array is and what
  // is left, CPU and memory load, the CPU and drive temperatures, how many
  // containers are running, and how long it has been up.
  //
  // Autofill keys off a `<prefix>_array_used` sensor and then looks for that
  // prefix's siblings, which is the shape a template or REST set built on an
  // Unraid API produces. Every entity is optional and pickable by hand.
  function autofill() {
    const ids = [...states.keys()];
    const base = ids.map((id) => /^sensor\.(.+)_array_used$/.exec(id)?.[1]).find(Boolean);
    if (!base) return {};
    const has = (...names) => {
      for (const n of names) if (states.has(`sensor.${base}_${n}`)) return `sensor.${base}_${n}`;
      return '';
    };
    return {
      array_used: `sensor.${base}_array_used`,
      array_free: has('array_free', 'array_space_free'),
      cpu: has('cpu_usage', 'cpu_load', 'cpu'),
      ram: has('ram_usage', 'memory_usage', 'ram'),
      cpu_temp: has('cpu_temperature', 'cpu_temp'),
      disk_temp: has('disk_temperature', 'disk_temp', 'hottest_drive_temperature'),
      containers: has('containers', 'containers_running', 'docker_containers'),
      uptime: has('uptime', 'server_uptime'),
    };
  }
  export const meta = {
    type: 'unraid', name: 'Unraid', icon: 'mdi:server', category: 'Info',
    size: { w: 440, h: 240 }, tap: 'more-info',
    defaults: { array_used: '', array_free: '', cpu: '', ram: '', cpu_temp: '', disk_temp: '', containers: '', uptime: '' },
    autofill,
    sections: [{ key: 'array', label: 'Array' }, { key: 'load', label: 'CPU / RAM' }, { key: 'temps', label: 'Temperatures' }, { key: 'foot', label: 'Free space / uptime' }],
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Unraid' },
      { key: 'icon', label: 'Icon', type: 'icon' },
      { key: 'array_used', label: 'Array used %', type: 'entity', domain: 'sensor' },
      { key: 'array_free', label: 'Array free (optional)', type: 'entity', domain: 'sensor', section: 'foot' },
      { key: 'cpu', label: 'CPU %', type: 'entity', domain: 'sensor', section: 'load' },
      { key: 'ram', label: 'Memory %', type: 'entity', domain: 'sensor', section: 'load' },
      { key: 'cpu_temp', label: 'CPU temperature', type: 'entity', domain: 'sensor', section: 'temps' },
      { key: 'disk_temp', label: 'Drive temperature (optional)', type: 'entity', domain: 'sensor', section: 'temps' },
      { key: 'containers', label: 'Containers (optional)', type: 'entity', domain: 'sensor', section: 'load' },
      { key: 'uptime', label: 'Uptime (optional)', type: 'entity', domain: 'sensor', section: 'foot' },
    ],
  };
</script>

<script>
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { formatNumber } from '../lib/entity.js';
  let { props, w = 440, h = 240 } = $props();
  const show = (k) => !props.hide?.[k];
  const num = (id) => { const v = Number(ent(id)?.state); return id && Number.isFinite(v) ? v : null; };
  const unitOf = (id) => ent(id)?.attributes.unit_of_measurement || '';

  const used = $derived(num(props.array_used));
  // The array's own state rides along as an attribute on the usage sensor, so a
  // box that is stopped reads as stopped rather than as an empty array.
  const arrayState = $derived(String(ent(props.array_used)?.attributes?.state ?? '').toUpperCase());
  const stopped = $derived(/STOP|MAINT|DISABLE|STARTING/.test(arrayState));
  const chip = $derived(
    /MAINT/.test(arrayState) ? 'Maintenance'
    : /STARTED/.test(arrayState) ? 'Started'
    : /STOP/.test(arrayState) ? 'Stopped'
    : /SYNC|CHECK|REBUILD/.test(arrayState) ? 'Working'
    : '');
  const barColor = $derived(used == null ? 'var(--muted)' : used >= 90 ? '#ff6b6b' : used >= 80 ? '#ffb547' : '#5bd88f');
  const pct = $derived(used == null ? 0 : Math.max(0, Math.min(100, used)));

  const free = $derived.by(() => {
    if (!show('foot')) return '';
    const e = ent(props.array_free);
    const v = Number(e?.state);
    if (!e || !Number.isFinite(v)) return '';
    const d = v >= 100 ? 0 : v >= 10 ? 1 : 2;
    return `${formatNumber(v, d)} ${unitOf(props.array_free) || 'TB'} free`;
  });
  const up = $derived.by(() => {
    if (!show('foot')) return '';
    const e = ent(props.uptime);
    const v = Number(e?.state);
    if (!e || !Number.isFinite(v)) return '';
    return `up ${formatNumber(v, v >= 100 ? 0 : 1)} ${unitOf(props.uptime) || 'd'}`;
  });
  const drives = $derived.by(() => {
    if (!show('temps')) return '';
    const v = num(props.disk_temp);
    return v == null ? '' : `drives ${formatNumber(v, 0)}°`;
  });
  const foot = $derived([free, drives, up].filter(Boolean).join(' · '));

  const tiles = $derived.by(() => {
    const out = [];
    if (show('load') && props.cpu) out.push({ k: 'CPU', v: num(props.cpu), u: '%', d: 0 });
    if (show('load') && props.ram) out.push({ k: 'RAM', v: num(props.ram), u: '%', d: 0 });
    if (show('temps') && props.cpu_temp) out.push({ k: 'CPU temp', v: num(props.cpu_temp), u: '°', d: 0 });
    if (show('load') && props.containers) out.push({ k: 'Containers', v: num(props.containers), u: '', d: 0 });
    return out;
  });

  const small = $derived(h < 170);
  const narrow = $derived(w < 300);
  // A short card is one line: the number and its bar, then as many readings as
  // fit beside it. Estimating the width keeps the row from ellipsising.
  const shortParts = $derived.by(() => {
    const all = tiles.filter((x) => x.v != null).map((x) => `${x.k} ${formatNumber(x.v, x.d)}${x.u}`);
    const avail = Math.max(60, w - 132);
    const out = [];
    let run = 0;
    for (const part of all) {
      const px = part.length * 7.6 + (out.length ? 14 : 0);
      if (run + px > avail) break;
      run += px;
      out.push(part);
    }
    return out;
  });
</script>

<div class="ur" class:small class:narrow class:stopped>
  <div class="head">
    {#if !small}<span class="ic"><Icon icon={t(props.icon) || 'mdi:server'} size="1.05em" /></span>{/if}
    <span class="name">{t(props.name) || 'Unraid'}</span>
    {#if chip}<span class="chip">{chip}</span>{/if}
  </div>

  {#if small}
    <div class="sline">
      <span class="lnum">{used == null ? '—' : formatNumber(used, 0)}<em>{used == null ? '' : '%'}</em></span>
      <div class="sbar"><i style="width:{pct}%;background:{barColor}"></i></div>
    </div>
    {#if shortParts.length}
      <div class="schips">{#each shortParts as part}<span class="sc">{part}</span>{/each}</div>
    {/if}
    {#if foot && h >= 140}<div class="foot" title={foot}>{foot}</div>{/if}
  {:else}
    <div class="array">
      <div class="arow">
        {#if !narrow}<span class="ak">Array used</span>{/if}
        <span class="av">{used == null ? '—' : formatNumber(used, 0)}<em>{used == null ? '' : '%'}</em></span>
      </div>
      <div class="bar"><i style="width:{pct}%;background:{barColor}"></i></div>
    </div>

    {#if tiles.length}
      <div class="tiles" class:few={tiles.length < 3} style="--n:{Math.min(tiles.length, 3)}">
        {#each tiles as x}
          <div class="tile" class:dim={x.v == null}>
            <span class="tk">{x.k}</span>
            <span class="tv">{x.v == null ? '—' : formatNumber(x.v, x.d)}<em>{x.v == null ? '' : x.u}</em></span>
          </div>
        {/each}
      </div>
    {/if}

    {#if foot}<div class="foot" title={foot}>{foot}</div>{/if}
  {/if}
</div>

<style>
  .ur { height: 100%; display: flex; flex-direction: column; gap: min(8px, 3cqh); container-type: size; min-width: 0; }
  .head { display: flex; align-items: center; gap: 8px; min-width: 0; flex: none; }
  .ic { width: 1.9em; height: 1.9em; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent); flex: none; }
  .name { font-weight: 600; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chip { font-size: .72em; font-weight: 600; padding: 3px 9px; border-radius: 99px; background: color-mix(in srgb, #5bd88f 24%, transparent); color: #5bd88f; white-space: nowrap; flex: none; }
  .stopped .chip { background: rgba(255,255,255,.08); color: var(--muted); }

  .array { flex: none; }
  .arow { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .ak { font-size: .78em; color: var(--muted); letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .av { font-size: 2.1em; font-size: min(2.1em, 12cqh, 20cqw); font-weight: 600; letter-spacing: -.02em; line-height: 1.05; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .av em { font-style: normal; font-size: .5em; color: var(--muted); margin-left: 1px; }
  .bar { height: min(8px, 3cqh); border-radius: 5px; background: rgba(255,255,255,.09); overflow: hidden; margin-top: 4px; }
  .bar i { display: block; height: 100%; border-radius: 5px; transition: width .6s, background .3s; }

  /* The tiles reflow: four across on a wide card, two by two on a narrow one,
     and a pair stays a pair rather than stretching across the whole card. */
  .tiles { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 78px), 1fr)); gap: min(8px, 2.5cqh); }
  .tiles.few { grid-template-columns: repeat(var(--n, 2), minmax(0, 168px)); justify-content: start; align-content: center; }
  .tiles.few .tile { max-height: min(72px, 100%); }
  .tile { min-width: 0; border-radius: 12px; background: rgba(255,255,255,.05); padding: min(6px, 2cqh) 9px; display: flex; flex-direction: column; justify-content: center; gap: 1px; overflow: hidden; }
  .tk, .tv { flex: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tk { font-size: min(.72em, 4.4cqh); color: var(--muted); }
  .tv { font-size: 1.3em; font-size: min(1.3em, 8cqh, 10cqw); font-weight: 600; line-height: 1.15; font-variant-numeric: tabular-nums; }
  .tv em { font-style: normal; font-size: .62em; color: var(--muted); }
  .dim .tv { color: var(--muted); font-weight: 500; }

  .foot { flex: none; font-size: min(.78em, 4.8cqh); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .sline { flex: none; display: flex; align-items: center; gap: 10px; }
  .lnum { font-size: min(1.9em, 12cqh, 16cqw); font-weight: 600; letter-spacing: -.02em; line-height: 1.05; flex: none; font-variant-numeric: tabular-nums; }
  .lnum em { font-style: normal; font-size: .5em; color: var(--muted); }
  .sbar { flex: 1; min-width: 24px; height: min(8px, 3cqh); border-radius: 5px; background: rgba(255,255,255,.09); overflow: hidden; }
  .sbar i { display: block; height: 100%; border-radius: 5px; transition: width .6s, background .3s; }
  .schips { flex: 1; min-height: 0; display: flex; align-items: center; gap: 6px; overflow: hidden; }
  .sc { font-size: min(.8em, 5cqh); padding: 3px 9px; border-radius: 99px; background: rgba(255,255,255,.06); color: var(--muted); white-space: nowrap; flex: none; font-variant-numeric: tabular-nums; }
</style>
