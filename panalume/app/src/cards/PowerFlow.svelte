<script module>
  export const meta = {
    type: 'powerflow', name: 'Power flow', icon: 'mdi:home-lightning-bolt', category: 'Energy',
    size: { w: 340, h: 340 }, tap: 'none',
    defaults: { unit: 'W' },
    sections: [{ key: 'solar', label: 'Solar', section: 'solar' }, { key: 'grid', label: 'Grid', section: 'grid' }, { key: 'battery', label: 'Battery', section: 'battery' }, { key: 'ev', label: 'EV', section: 'ev' }, { key: 'home', label: 'Home', section: 'home' }, { key: 'appliances', label: 'Appliances', section: 'appliances' }, { key: 'flows', label: 'Flow lines' }],
    fields: [
      { key: 'solar', label: 'Solar power', type: 'entity', domain: 'sensor' },
      { key: 'grid', label: 'Grid power (+import / −export)', type: 'entity', domain: 'sensor' },
      { key: 'grid_invert', label: 'Invert grid sign', type: 'bool', section: 'grid' },
      { key: 'battery', label: 'Battery power (+discharge / −charge)', type: 'entity', domain: 'sensor' },
      { key: 'battery_invert', label: 'Invert battery sign', type: 'bool', section: 'battery' },
      { key: 'battery_soc', label: 'Battery %', type: 'entity', domain: 'sensor', section: 'battery' },
      { key: 'solar_2', label: 'Second solar power (optional)', type: 'entity', domain: 'sensor', section: 'solar' },
      { key: 'solar_label', label: 'Solar label', type: 'text', section: 'solar' },
      { key: 'solar_2_label', label: 'Second solar label', type: 'text', section: 'solar' },
      { key: 'battery_2', label: 'Second battery power (optional)', type: 'entity', domain: 'sensor', section: 'battery' },
      { key: 'battery_2_invert', label: 'Invert second battery sign', type: 'bool', section: 'battery' },
      { key: 'battery_2_soc', label: 'Second battery %', type: 'entity', domain: 'sensor', section: 'battery' },
      { key: 'battery_label', label: 'Battery label', type: 'text', section: 'battery' },
      { key: 'battery_2_label', label: 'Second battery label', type: 'text', section: 'battery' },
      { key: 'home', label: 'Home power (blank = calculated)', type: 'entity', domain: 'sensor' },
      { key: 'ev', label: 'EV / charger power', type: 'entity', domain: 'sensor' },
      { key: 'ev_label', label: 'EV label', type: 'text', section: 'ev' },
      { key: 'appliances', label: 'Appliances (power sensors, up to 4)', type: 'entities', domain: 'sensor', section: 'appliances', hint: 'Shown around the house, e.g. a heat pump or hot tub. Names come from the sensors; they\'re part of the home\'s use, not added to it.' },
    ],
  };
</script>

<script>
  import { myenergiPower } from '../lib/octopus.js';
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { name } from '../lib/entity.js';
  let { props } = $props();
  const show = (k) => !props.hide?.[k];
  // Normalise any power sensor to watts.
  function watts(id) {
    const e = ent(id);
    const v = Number(e?.state);
    if (!e || Number.isNaN(v)) return null;
    const u = (e.attributes.unit_of_measurement || 'W').toLowerCase();
    return u === 'kw' ? v * 1000 : u === 'mw' ? v * 1e6 : v;
  }
  // Up to two solar arrays and two batteries; with two, each gets its own circle.
  const solars = $derived([['solar', props.solar, t(props.solar_label)], ['solar2', props.solar_2, t(props.solar_2_label)]]
    .filter(([, id]) => id).map(([key, id, label], i, all) => ({ key, w: Math.max(0, watts(id) ?? 0), label: label || (all.length > 1 ? `Solar ${i + 1}` : 'Solar') })));
  const batts = $derived([['batt', props.battery, props.battery_invert, props.battery_soc, t(props.battery_label)], ['batt2', props.battery_2, props.battery_2_invert, props.battery_2_soc, t(props.battery_2_label)]]
    .filter(([, id]) => id).map(([key, id, inv, socId, label], i, all) => {
      const soc = ent(socId)?.state;
      return { key, w: (watts(id) ?? 0) * (inv ? -1 : 1), soc: soc != null && !isNaN(Number(soc)) ? Math.round(Number(soc)) + '%' : '', label: label || (all.length > 1 ? `Battery ${i + 1}` : '') };
    }));
  const solar = $derived(solars.reduce((a, x) => a + x.w, 0));
  const grid = $derived((watts(props.grid) ?? 0) * (props.grid_invert ? -1 : 1));
  const batt = $derived(batts.reduce((a, x) => a + x.w, 0));
  const ev = $derived(Math.max(0, watts(myenergiPower(props.ev)) ?? 0));
  const home = $derived(props.home ? (watts(props.home) ?? 0) : Math.max(0, solar + grid + batt - ev));
  // Up to four appliances (power sensors) in the corners, fed from the house.
  const APPLIANCE_ICONS = [[/heat ?pump|ashp/, 'mdi:heat-pump'], [/hot ?tub|spa\b/, 'mdi:hot-tub'], [/dish/, 'mdi:dishwasher'], [/wash/, 'mdi:washing-machine'], [/dryer/, 'mdi:tumble-dryer'],
    [/oven|cooker|hob\b|stove/, 'mdi:stove'], [/kettle/, 'mdi:kettle'], [/fridge|freezer/, 'mdi:fridge'], [/pool/, 'mdi:pool'], [/immersion|boiler|water heater|eddi/, 'mdi:water-boiler'],
    [/air ?con|\bac\b|aircon/, 'mdi:air-conditioner'], [/\btv\b|television/, 'mdi:television'], [/server|computer|\bpc\b|network|rack/, 'mdi:server'], [/car|ev\b|charger/, 'mdi:car-electric'], [/light/, 'mdi:lightbulb']];
  const AC = ['#ff9f5a', '#4fd1c5', '#f472b6', '#a3e635'];
  const corners = (tight) => (tight ? [[10, 10], [90, 10], [10, 90], [90, 90]] : [[12, 12], [88, 12], [12, 88], [88, 88]]);
  const appliances = $derived((show('appliances') && Array.isArray(props.appliances) ? props.appliances : []).filter(Boolean).slice(0, 4).map((id, i) => {
    const e = ent(id);
    const label = (e ? name(e) : id).replace(/\s+(current\s+)?(power|consumption|load|usage|watts)$/i, '') || 'Appliance';
    const icon = e?.attributes.icon || APPLIANCE_ICONS.find(([re]) => re.test(label.toLowerCase()))?.[1] || 'mdi:power-plug';
    return { key: `app${i}`, w: Math.max(0, watts(id) ?? 0), label, icon, color: AC[i] };
  }));
  // With a second solar array or battery as well, every circle shrinks a little to make room.
  const tight = $derived(appliances.length > 0 && (solars.length > 1 || batts.length > 1));
  const fmt = (w) => (Math.abs(w) >= 1000 ? (Math.abs(w) / 1000).toFixed(Math.abs(w) >= 10000 ? 0 : 1) + ' kW' : Math.round(Math.abs(w)) + ' W');
  const dur = (w) => Math.max(0.6, 3.5 - Math.log10(Math.max(1, Math.abs(w))) * 0.8) + 's';
  const C = { solar: '#ffc861', grid: '#8da2c0', home: '#7aa2ff', batt: '#5bd88f', ev: '#b48cff', exp: '#ff8fb1' };
  // Node positions in a 100x100 box; a second solar / battery sits beside the first.
  const P = $derived({
    solar: solars.length > 1 ? [34, 13] : [50, 13], solar2: [66, 13],
    grid: [13, 50], home: [50, 50], ev: [87, 50],
    batt: batts.length > 1 ? [34, 87] : [50, 87], batt2: [66, 87],
    ...Object.fromEntries(corners(tight).map((c, i) => [`app${i}`, c])),
  });
  const lines = $derived([
    ...(show('solar') ? solars.map((x) => ({ from: x.key, to: 'home', w: x.w, color: C.solar })) : []),
    props.grid && show('grid') && { from: grid >= 0 ? 'grid' : 'home', to: grid >= 0 ? 'home' : 'grid', w: grid, color: grid >= 0 ? C.grid : C.exp, a: 'grid', b: 'home' },
    ...(show('battery') ? batts.map((x) => ({ from: x.w >= 0 ? x.key : 'home', to: x.w >= 0 ? 'home' : x.key, w: x.w, color: C.batt, a: x.key, b: 'home' })) : []),
    props.ev && show('ev') && { from: 'home', to: 'ev', w: ev, color: C.ev },
    ...appliances.map((x) => ({ from: 'home', to: x.key, w: x.w, color: x.color })),
  ].filter(Boolean));
</script>

<div class="pf" class:tight>
  <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
    {#each show('flows') ? lines : [] as l}
      {@const [x1, y1] = P[l.a || l.from]}
      {@const [x2, y2] = P[l.b || l.to]}
      <line {x1} {y1} {x2} {y2} stroke="rgba(255,255,255,.08)" stroke-width="1.2" />
      {#if Math.abs(l.w) > 5}
        <line x1={P[l.from][0]} y1={P[l.from][1]} x2={P[l.to][0]} y2={P[l.to][1]} style="stroke:{l.color};animation-duration:{dur(l.w)}" class="flow" stroke-width="1.6" stroke-linecap="round" />
      {/if}
    {/each}
  </svg>
  {#snippet node(key, icon, label, w, color, extra, small)}
    <div class="node" class:small style="left:{P[key][0]}%;top:{P[key][1]}%;--c:{color}">
      <Icon {icon} size="1.3em" />
      <span class="v">{w == null ? '—' : fmt(w)}</span>
      {#if extra}<span class="x">{extra}</span>{/if}
      <span class="l">{label}</span>
    </div>
  {/snippet}
  {#if show('solar')}{#each solars as x (x.key)}{@render node(x.key, 'mdi:solar-power', x.label, x.w, C.solar)}{/each}{/if}
  {#if props.grid && show('grid')}{@render node('grid', 'mdi:transmission-tower', grid < 0 ? 'Export' : 'Grid', grid, grid < 0 ? C.exp : C.grid)}{/if}
  {#if show('home')}{@render node('home', 'mdi:home', 'Home', home, C.home)}{/if}
  {#if show('battery')}{#each batts as x (x.key)}{@render node(x.key, 'mdi:home-battery', x.label ? x.label : x.w < 0 ? 'Charging' : 'Battery', x.w, C.batt, x.soc)}{/each}{/if}
  {#if props.ev && show('ev')}{@render node('ev', 'mdi:car-electric', t(props.ev_label) || 'EV', ev, C.ev)}{/if}
  {#each appliances as x (x.key)}{@render node(x.key, x.icon, x.label, x.w, x.color, '', true)}{/each}
</div>

<style>
  .pf { position: relative; height: 100%; aspect-ratio: 1; max-width: 100%; margin: 0 auto; container-type: size; }
  svg { position: absolute; inset: 0; width: 100%; height: 100%; }
  .flow { stroke-dasharray: 2 4; animation: flow linear infinite; }
  @keyframes flow { to { stroke-dashoffset: -12; } }
  .node { position: absolute; transform: translate(-50%, -50%); width: 26%; aspect-ratio: 1; border-radius: 50%; border: 2px solid var(--c); background: color-mix(in srgb, var(--c) 10%, rgba(10,14,22,.9)); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; font-size: 4cqmin; line-height: 1.15; }
  .node :global(svg) { color: var(--c); position: static; width: 1.6em !important; height: 1.6em !important; }
  .v { font-weight: 600; font-size: 1.05em; }
  .x { color: var(--muted); font-size: .85em; }
  .node.small { width: 19%; font-size: 3.2cqmin; }
  .tight .node { width: 22%; font-size: 3.5cqmin; }
  .tight .node.small { width: 16%; font-size: 2.8cqmin; }
  .l { position: absolute; bottom: -1.5em; color: var(--muted); font-size: .9em; white-space: nowrap; }
  /* Older Safari doesn't size text by the card (container units). */
  @supports not (font-size: 1cqmin) { .node { font-size: .8em; } .node.small, .tight .node { font-size: .65em; } .tight .node.small { font-size: .55em; } }
</style>
