<script module>
  import { states, send } from '../lib/ha.svelte.js';
  // Home Assistant's areas (for room names), fetched once for every vacuum card.
  let areas = null;
  function areaList() {
    areas ??= send({ type: 'config/area_registry/list' }).catch((err) => { areas = null; throw err; });
    return areas;
  }
  // Finds the vacuum, and the battery / area / time / error sensors and map
  // some integrations (Roborock, Ecovacs, Dreame, Valetudo…) add next to it.
  function autofill() {
    const ids = [...states.keys()].filter((id) => id.startsWith('vacuum.')).sort();
    const v = ids.find((id) => states.get(id)?.state !== 'unavailable') || ids[0];
    if (!v) return {};
    const p = v.slice(7);
    const first = (...n) => n.map((x) => `sensor.${p}_${x}`).find((id) => states.has(id)) || '';
    const sel = ['selected_map', 'map', 'current_map'].map((x) => `select.${p}_${x}`).find((id) => states.has(id)) || '';
    const mode = [`select.${p}_cleaning_mode`].find((id) => states.has(id)) || '';
    // Dreame / Xiaomi: camera.<vacuum>_map; Roborock: image.<vacuum>_<map name>.
    const pic = [`camera.${p}_map`, `image.${p}_map`].find((id) => states.has(id)) || [...states.keys()].find((id) => id.startsWith(`image.${p}_`)) || '';
    return {
      entity: v,
      battery: first('battery', 'battery_level'),
      area: first('cleaned_area', 'cleaning_area', 'last_clean_area', 'total_cleaned_area'),
      time: first('cleaning_time', 'cleaning_duration', 'last_clean_duration'),
      error: first('error', 'vacuum_error'),
      map: sel,
      map_image: pic,
      clean_mode: mode,
    };
  }
  export const meta = {
    type: 'vacuum', name: 'Robot vacuum', icon: 'mdi:robot-vacuum', category: 'Controls',
    size: { w: 300, h: 250 }, tap: 'none', hold: 'more-info',
    defaults: { entity: '' },
    autofill,
    sections: [
      { key: 'state', label: 'Status' }, { key: 'battery', label: 'Battery', section: 'battery' }, { key: 'stats', label: 'Area / time cleaned', section: 'stats' },
      { key: 'controls', label: 'Start / pause / dock', section: 'controls' }, { key: 'fan', label: 'Suction power', section: 'fan' }, { key: 'cleanmode', label: 'Cleaning mode', section: 'cleanmode' }, { key: 'map', label: 'Map', section: 'map' }, { key: 'rooms', label: 'Rooms' }, { key: 'locate', label: 'Locate (beep)', section: 'locate' },
    ],
    fields: [
      { key: 'entity', label: 'Vacuum', type: 'entity', domain: 'vacuum', hint: 'Rooms to clean appear on the card when the vacuum\'s rooms are matched to Home Assistant areas (in the vacuum\'s settings in Home Assistant), or come from the Dreame integration.' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'battery', label: 'Battery (optional, uses the vacuum\'s own if it has one)', type: 'entity', domain: 'sensor', section: 'battery' },
      { key: 'area', label: 'Area cleaned (optional)', type: 'entity', domain: 'sensor', section: 'stats' },
      { key: 'time', label: 'Cleaning time (optional)', type: 'entity', domain: 'sensor', section: 'stats' },
      { key: 'error', label: 'Error message (optional)', type: 'entity', domain: 'sensor' },
      { key: 'clean_mode', label: 'Cleaning mode picker (optional, e.g. a Dreame\'s vacuum / mop / both)', type: 'entity', domain: 'select', section: 'cleanmode' },
      { key: 'map', label: 'Map picker (optional, e.g. a Roborock\'s selected map)', type: 'entity', domain: 'select', section: 'map' },
      { key: 'map_image', label: 'Map image (optional, e.g. the vacuum\'s map camera)', type: 'entity', domain: ['camera', 'image'], section: 'map' },
    ],
  };
</script>

<script>
  // A robot vacuum: a big round button (a ring that shows the battery, when
  // there is one) that starts, pauses or resumes it, the status under it, and
  // buttons to send it home, make it beep and pick the suction power. Bigger
  // cards can show the map instead of the button, and rooms to clean. It only
  // shows what the vacuum says it can do. Small cards become a single row.
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { stateWord } from '../lib/i18n.svelte.js';
  import { name, stateText, formatNumber } from '../lib/entity.js';
  import { callService, conn, haImage } from '../lib/ha.svelte.js';
  let { props, w = 300, h = 250 } = $props();
  const show = (k) => !props.hide?.[k];

  const e = $derived(ent(props.entity));
  const st = $derived(e?.state || 'unavailable');
  const dead = $derived(!e || st === 'unavailable' || st === 'unknown');

  const LOOK = {
    cleaning: ['Cleaning', '#4fb4ff'], returning: ['Heading home', '#b48cff'], paused: ['Paused', '#ffb547'], docked: ['Docked', '#5bd88f'],
    idle: ['Idle', '#8a94a8'], error: ['Needs attention', '#ff6b6b'], unavailable: ['Unavailable', '#8a94a8'], unknown: ['Unknown', '#8a94a8'],
  };
  const [label0, color] = $derived(LOOK[st] || [st.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), '#8a94a8']);
  const label = $derived(stateWord('vacuum', null, st) || label0);

  // What the vacuum supports (HA's feature flags). If it doesn't say, assume the basics.
  const feat = $derived(Number(e?.attributes.supported_features) || 0);
  const can = (bit, strict = false) => (feat ? (feat & bit) === bit : !strict);
  const START = 8192, PAUSE = 4, HOME = 16, FAN = 32, LOCATE = 512, CLEAN_AREA = 16384;

  const cleaning = $derived(st === 'cleaning');
  const batt = $derived.by(() => {
    if (!show('battery')) return NaN;
    const v = props.battery ? ent(props.battery)?.state : e?.attributes.battery_level;
    return v == null || v === '' ? NaN : Number(v);
  });
  const hasBatt = $derived(Number.isFinite(batt));

  const call = (svc, data = {}) => e && callService('vacuum', svc, data, { entity_id: e.entity_id });
  const startSvc = $derived(!feat || (feat & START) === START ? 'start' : 'turn_on');

  // Rooms. Home Assistant's own "clean area" first: the vacuum's rooms matched
  // to HA areas in its settings. Otherwise the room list the Dreame
  // integration puts on the vacuum (for the selected map).
  let areaRooms = $state(null);
  const entityId = $derived(e?.entity_id);
  const byArea = $derived(show('rooms') && can(CLEAN_AREA, true));
  $effect(() => {
    if (!entityId || !byArea || !conn.connected) { areaRooms = null; return; }
    let live = true;
    Promise.all([send({ type: 'config/entity_registry/get', entity_id: entityId }), areaList()]).then(([r, list]) => {
      if (!live) return;
      const map = r?.options?.vacuum?.area_mapping || {};
      const names = new Map(list.map((a) => [a.area_id, a.name]));
      areaRooms = Object.keys(map).filter((id) => map[id]?.length).map((id) => ({ id, name: names.get(id) || cap(id) }));
    }, () => live && (areaRooms = []));
    return () => (live = false);
  });
  const dreameRooms = $derived.by(() => {
    const r = e?.attributes.rooms;
    if (!r || typeof r !== 'object') return [];
    const list = Array.isArray(r) ? r : r[e.attributes.selected_map] || (Object.keys(r).length === 1 ? Object.values(r)[0] : []);
    return Array.isArray(list) ? list.filter((x) => x?.id != null).map((x) => ({ id: x.id, name: x.name || `Room ${x.id}` })) : [];
  });
  const viaArea = $derived(!!areaRooms?.length);
  const rooms = $derived(!show('rooms') || dead ? [] : viaArea ? areaRooms : dreameRooms);
  // Picked rooms, in the order they were tapped (that's the cleaning order).
  let picked = $state([]);
  const chosen = $derived(picked.filter((id) => rooms.some((r) => r.id === id)));
  const pick = (id) => (picked = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  $effect(() => { if (cleaning) picked = []; });
  function cleanRooms() {
    if (viaArea) call('clean_area', { cleaning_area_id: chosen });
    else callService('dreame_vacuum', 'vacuum_clean_segment', { segments: chosen }, { entity_id: e.entity_id });
    picked = [];
  }
  const roomsNext = $derived(chosen.length > 0 && !cleaning);
  // Fade the edge of the room row when more rooms are scrolled out of sight.
  let roomsEl = $state();
  let roomsMore = $state(false);
  const roomsFade = () => roomsEl && (roomsMore = roomsEl.scrollLeft + roomsEl.clientWidth < roomsEl.scrollWidth - 2);
  $effect(() => { rooms.length; w; roomsFade(); });

  const mainLabel = $derived(roomsNext ? (chosen.length === 1 ? `Clean ${rooms.find((r) => r.id === chosen[0])?.name}` : `Clean ${chosen.length} rooms`) : cleaning ? (can(PAUSE) ? 'Pause' : 'Stop') : st === 'paused' ? 'Resume' : 'Start');
  const mainIcon = $derived(cleaning ? (can(PAUSE) ? 'mdi:pause' : 'mdi:stop') : 'mdi:play');
  const main = () => { if (!dead) roomsNext ? cleanRooms() : call(cleaning ? (can(PAUSE) ? 'pause' : 'stop') : startSvc); };
  const goHome = $derived(show('controls') && can(HOME) && !dead && !['docked', 'returning'].includes(st));
  const canLocate = $derived(show('locate') && can(LOCATE, true) && !dead);
  const fans = $derived(show('fan') && can(FAN, true) && !dead ? e?.attributes.fan_speed_list || [] : []);
  // A map picker (e.g. Roborock's select.<vacuum>_selected_map), when one is set.
  const mapEnt = $derived(show('map') && props.map ? ent(props.map) : null);
  const maps = $derived(mapEnt && !['unavailable', 'unknown'].includes(mapEnt.state) && !dead ? mapEnt.attributes.options || [] : []);
  const cap = (s) => String(s).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  // A cleaning-mode picker (e.g. Dreame's select.<vacuum>_cleaning_mode: vacuum, mop or both).
  const modeEnt = $derived(show('cleanmode') && props.clean_mode ? ent(props.clean_mode) : null);
  const modes = $derived(modeEnt && !['unavailable', 'unknown'].includes(modeEnt.state) && !dead ? modeEnt.attributes.options || [] : []);

  // The map picture (a map camera, or an image entity), refreshed more often while it cleans.
  // Its address changes whenever the integration updates the map (e.g. Dreame, as
  // the robot moves); the timer only depends on the entity and whether it's moving,
  // so frequent map updates don't keep restarting it.
  const mapId = $derived(show('map') && props.map_image ? props.map_image : '');
  const mapPic = $derived(mapId ? ent(mapId) : null);
  const moving = $derived(cleaning || st === 'returning');
  let tick = $state(0);
  $effect(() => {
    if (!mapId) return;
    const iv = setInterval(() => tick++, moving ? 5000 : 60000);
    return () => clearInterval(iv);
  });
  const mapUrl = $derived.by(() => {
    if (!mapPic || ['unavailable', 'unknown'].includes(mapPic.state)) return '';
    const pic = haImage(mapPic.attributes.entity_picture);
    if (mapPic.entity_id.startsWith('image.')) return pic;
    const url = pic || `ha/api/camera_proxy/${mapPic.entity_id}`;
    return `${url}${url.includes('?') ? '&' : '?'}t=${tick}`;
  });

  const area = $derived(show('stats') && props.area ? ent(props.area) : null);
  const time = $derived(show('stats') && props.time ? ent(props.time) : null);
  const stats = $derived([area, time].filter((x) => x && !['unavailable', 'unknown'].includes(x.state)));
  const problem = $derived.by(() => {
    if (st !== 'error') return '';
    const m = ent(props.error)?.state ?? e?.attributes.error;
    return m && !['unavailable', 'unknown', 'none', 'no_error', 'ok'].includes(String(m).toLowerCase()) ? cap(m) : '';
  });

  const small = $derived(h < 150 || w < 240);
  // The map takes the big button's place when there's room and the buttons underneath can start it.
  const showMap = $derived(!!mapUrl && show('controls') && !dead && h >= 280 && w >= 240);
  const roomsRow = $derived(rooms.length ? 38 : 0);
  // The suction picker wraps onto its own row on narrower cards: leave room for it.
  const pickers = $derived((fans.length ? 1 : 0) + (maps.length ? 1 : 0) + (modes.length ? 1 : 0));
  const extraRow = $derived(!pickers || (w >= 380 && pickers < 3) ? 0 : pickers >= 2 && w < 300 ? 80 : 40);
  const ringRoom = $derived(Math.min(w - 48, h - 28 - 34 - (stats.length || problem ? 22 : 0) - 52 - 20 - extraRow - roomsRow, 170));
  const ringSize = $derived(Math.max(56, ringRoom));
  // A full card (rooms and several pickers) leaves no room for the round button: the Start button below does the same.
  const noOrb = $derived(ringRoom < 40 && show('controls'));
  const R = 44, C = 2 * Math.PI * R;
  const battColor = $derived(batt <= 15 ? '#ff6b6b' : batt <= 30 ? '#ffb547' : color);
  const battIcon = $derived(batt <= 15 ? 'mdi:battery-alert-variant-outline' : batt <= 40 ? 'mdi:battery-low' : batt <= 75 ? 'mdi:battery-medium' : 'mdi:battery-high');
</script>

<div class="vc" class:small class:cleaning class:returning={st === 'returning'} class:error={st === 'error'} style="--c:{color}">
  <div class="glow"></div>
  {#if small}
    <button class="orb" class:dead style="width:46px;height:46px" onclick={main} data-stop disabled={dead} aria-label={mainLabel}>{@render orb(46)}</button>
    <div class="txt">
      <div class="name">{t(props.name) || name(e)}</div>
      <div class="st">{[show('state') ? (problem || label) : '', hasBatt ? `${formatNumber(batt, 0)}%` : ''].filter(Boolean).join(' · ')}</div>
    </div>
    {#if show('controls') && w >= 200 && !dead}
      <div class="btns side" data-stop>
        <button class="sq" onclick={main} title={mainLabel}><Icon icon={mainIcon} size="1.1em" /></button>
        {#if goHome && w >= 260}<button class="sq" onclick={() => call('return_to_base')} title="Send home"><Icon icon="mdi:home-import-outline" size="1.1em" /></button>{/if}
      </div>
    {/if}
  {:else}
    <div class="head">
      <span class="name">{t(props.name) || name(e)}</span>
      {#if hasBatt}<span class="chip" class:low={batt <= 15}><Icon icon={battIcon} size="1em" />{formatNumber(batt, 0)}%</span>{/if}
    </div>
    <div class="mid" class:withmap={showMap} class:none={noOrb && !showMap}>
      {#if showMap}<img class="map" src={mapUrl} alt="Map" />
      {:else if !noOrb}<button class="orb" class:dead style="width:{ringSize}px;height:{ringSize}px" onclick={main} data-stop disabled={dead} aria-label={mainLabel}>{@render orb(ringSize)}</button>{/if}
    </div>
    <div class="foot">
      <div class="big">{show('state') ? label : ''}</div>
      {#if problem}<div class="sub bad">{problem}</div>
      {:else if stats.length}<div class="sub">{stats.map((x) => stateText(x)).join(' · ')}</div>{/if}
    </div>
    {#if rooms.length}
      <div class="rooms" class:more={roomsMore} bind:this={roomsEl} onscroll={roomsFade} data-stop role="group" aria-label="Rooms">
        {#each rooms as r (r.id)}
          {@const n = chosen.indexOf(r.id)}
          <button class:on={n >= 0} onclick={() => pick(r.id)} aria-pressed={n >= 0} disabled={cleaning || st === 'returning'}>{#if n >= 0 && chosen.length > 1}<b>{n + 1}</b>{/if}{r.name}</button>
        {/each}
      </div>
    {/if}
    {#if !dead && (show('controls') || canLocate || fans.length || maps.length || modes.length)}
      <div class="btns" data-stop>
        {#if show('controls')}
          <button class="main" class:go={!cleaning} onclick={main}><Icon icon={mainIcon} size="1.1em" /> <span class="ml">{mainLabel}</span></button>
        {/if}
        {#if goHome}<button onclick={() => call('return_to_base')}><Icon icon="mdi:home-import-outline" size="1.1em" /> Dock</button>{/if}
        {#if canLocate}<button class="sq" onclick={() => call('locate')} title="Make it beep"><Icon icon="mdi:map-marker-radius" size="1.1em" /></button>{/if}
        {#if fans.length}
          <select value={e.attributes.fan_speed} onchange={(ev) => call('set_fan_speed', { fan_speed: ev.currentTarget.value })} title="Suction power">
            {#each fans as f}<option value={f}>{cap(f)}</option>{/each}
          </select>
        {/if}
        {#if modes.length}
          <select class="mode" value={modeEnt.state} onchange={(ev) => callService('select', 'select_option', { option: ev.currentTarget.value }, { entity_id: modeEnt.entity_id })} title="Cleaning mode">
            {#each modes as m}<option value={m}>{cap(m)}</option>{/each}
          </select>
        {/if}
        {#if maps.length}
          <select value={mapEnt.state} onchange={(ev) => callService('select', 'select_option', { option: ev.currentTarget.value }, { entity_id: mapEnt.entity_id })} title="Map">
            {#each maps as m}<option value={m}>{m}</option>{/each}
          </select>
        {/if}
      </div>
    {/if}
  {/if}
</div>

{#snippet orb(size)}
  <svg class="ring" viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r={R} class="track" />
    {#if hasBatt}<circle cx="50" cy="50" r={R} class="fill" style="stroke:{battColor}" stroke-dasharray={C} stroke-dashoffset={C * (1 - Math.max(0, Math.min(100, batt)) / 100)} />
    {:else}<circle cx="50" cy="50" r={R} class="fill" stroke-dasharray={C} stroke-dashoffset="0" />{/if}
  </svg>
  <span class="bot"><Icon icon={st === 'error' ? 'mdi:robot-vacuum-alert' : 'mdi:robot-vacuum'} size="{size * 0.44}px" /></span>
{/snippet}

<style>
  .vc { position: relative; height: 100%; display: flex; flex-direction: column; gap: 6px; isolation: isolate; }
  .glow { position: absolute; inset: calc(var(--pad) * -1); z-index: -1; background: radial-gradient(90% 70% at 50% 42%, color-mix(in srgb, var(--c) 17%, transparent), transparent 70%); transition: background .5s; pointer-events: none; }
  .head { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .name { font-weight: 600; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chip { display: inline-flex; align-items: center; gap: 3px; font-size: .78em; color: var(--muted); }
  .chip.low { color: #ff8a8a; }
  .mid { flex: 1; min-height: 0; display: grid; place-items: center; }
  .orb { position: relative; flex: none; padding: 0; border: 0; border-radius: 50%; background: color-mix(in srgb, var(--c) 12%, rgba(255,255,255,.03)); color: var(--c); display: grid; place-items: center; transition: background .4s, color .4s, transform .15s; }
  .orb:active:not(:disabled) { transform: scale(.95); }
  .orb.dead { opacity: .55; }
  .ring { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); filter: drop-shadow(0 0 4px color-mix(in srgb, var(--c) 45%, transparent)); }
  .track { fill: none; stroke: rgba(255,255,255,.08); stroke-width: 5; }
  .fill { fill: none; stroke: var(--c); stroke-width: 5; stroke-linecap: round; transition: stroke-dashoffset 1s, stroke .5s; }
  .bot { position: relative; display: grid; place-items: center; }
  .map { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 10px; min-height: 0; }
  .mid.withmap { place-items: stretch; justify-items: center; }
  .rooms { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 1px; flex: none; justify-content: safe center; }
  .rooms::-webkit-scrollbar { display: none; }
  .rooms.more { -webkit-mask-image: linear-gradient(90deg, #000 80%, transparent); mask-image: linear-gradient(90deg, #000 80%, transparent); }
  .rooms button:disabled { opacity: .45; }
  .rooms button { flex: none; display: inline-flex; align-items: center; gap: 5px; padding: 6px 11px; border-radius: 99px; border: 0; background: rgba(255,255,255,.06); color: var(--muted); font: inherit; font-size: .8em; white-space: nowrap; }
  .rooms button.on { background: color-mix(in srgb, var(--c) 26%, transparent); color: var(--text); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 60%, transparent); }
  .rooms b { display: inline-grid; place-items: center; min-width: 1.4em; height: 1.4em; border-radius: 50%; background: var(--c); color: #0b0f17; font-size: .85em; }
  .ml { max-width: 11em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Sweeps side to side while cleaning, pulses on its way home. */
  .cleaning .bot { animation: sweep 2.4s ease-in-out infinite; }
  .returning .bot { animation: pulse 1.6s ease-in-out infinite; }
  .error .bot { animation: pulse 1s ease-in-out infinite; }
  @keyframes sweep { 0%, 100% { transform: translateX(-7%) rotate(-10deg); } 50% { transform: translateX(7%) rotate(10deg); } }
  @keyframes pulse { 50% { opacity: .5; } }
  .foot { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .big { font-weight: 600; font-size: 1.1em; color: var(--c); min-height: 1.3em; }
  .sub { font-size: .8em; color: var(--muted); }
  .sub.bad { color: #ff8a8a; }
  .btns { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; justify-content: center; }
  .btns.side { flex-wrap: nowrap; flex: none; }
  .btns button { display: inline-flex; align-items: center; gap: 5px; padding: 7px 12px; border-radius: 11px; border: 0; background: rgba(255,255,255,.07); color: inherit; font: inherit; font-size: .85em; }
  .btns .sq { padding: 7px 9px; }
  .btns .main { background: color-mix(in srgb, var(--c) 24%, rgba(255,255,255,.04)); font-weight: 600; }
  .btns .main.go { background: color-mix(in srgb, #5bd88f 26%, rgba(255,255,255,.04)); }
  .btns select { font-size: .8em; padding: 6px 8px; border-radius: 10px; background: rgba(255,255,255,.06); max-width: 120px; }
  .btns select.mode { max-width: 175px; }
  .mid.none { display: none; }
  .small { flex-direction: row; align-items: center; gap: 10px; }
  .txt { flex: 1; min-width: 0; }
  .st { font-size: .85em; color: var(--c); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
