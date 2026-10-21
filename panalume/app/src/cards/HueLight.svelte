<script module>
  import { renderTemplate } from '../lib/ha.svelte.js';

  // Hue scenes are scene.* entities with a group_name. One live template (shared
  // by every Hue card) lists them, and the dashboard watches just those, rather
  // than fetching every entity in Home Assistant.
  const SCENES = "{{ states.scene | selectattr('attributes.group_name', 'defined') | map(attribute='entity_id') | join(',') }}";
  const sceneIds = () => String(renderTemplate(SCENES) || '').split(',').filter((id) => id.startsWith('scene.'));

  export const meta = {
    type: 'hue-light', name: 'Hue light (scenes)', icon: 'mdi:lightbulb-group', category: 'Controls',
    size: { w: 300, h: 170 }, tap: 'toggle', hold: 'more-info',
    defaults: { entity: '', dynamic: true },
    watch: () => sceneIds(),
    sections: [
      { key: 'brightness', label: 'Brightness slider' }, { key: 'temp', label: 'Warm / cool' }, { key: 'scenes', label: 'Hue scenes' },
      { key: 'state', label: 'State text' }, { key: 'members', label: 'Group count' }, { key: 'glow', label: 'Glow' },
    ],
    fields: [
      { key: 'entity', label: 'Hue room / zone light', type: 'entity', domain: 'light' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'icon', label: 'Icon', type: 'icon' },
      { key: 'dynamic', label: 'Play dynamic scenes animated', type: 'bool' },
      { key: 'sceneList', label: 'Scenes to show, in this order (leave empty to show all of the room\'s scenes)', type: 'entities', domain: 'scene', section: 'scenes' },
      { key: 'group', label: 'Hue room / zone name for the scenes (blank = the light\'s own name)', type: 'text', section: 'scenes' },
    ],
  };

</script>

<script>
  // Hue light: the same card as Light, but instead of colour buttons it lists
  // the Philips Hue scenes of the room or zone. Tap a scene to activate it.
  // Tap the icon to toggle, hold for full controls.
  import Icon from '../components/Icon.svelte';
  import Slider from '../components/Slider.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { stateWord } from '../lib/i18n.svelte.js';
  import { name, entityIcon, lightColor, toggle } from '../lib/entity.js';
  import { callService, states } from '../lib/ha.svelte.js';
  let { props, h = 170 } = $props();
  const show = (k) => !props.hide?.[k];
  const e = $derived(ent(props.entity));
  const a = $derived(e?.attributes || {});
  const on = $derived(e?.state === 'on');
  const pct = $derived(on ? Math.max(1, Math.round(((a.brightness ?? 255) / 255) * 100)) : 0);
  const modes = $derived(a.supported_color_modes || []);
  const dimmable = $derived(modes.some((m) => m !== 'onoff'));
  const hasTemp = $derived(modes.includes('color_temp'));
  const color = $derived(lightColor(e) || '#ffc861');
  const svc = (data) => callService('light', 'turn_on', data, { entity_id: e.entity_id });
  // Light groups: how many members are on.
  const members = $derived(Array.isArray(a.entity_id) ? a.entity_id : null);
  const membersOn = $derived(members ? members.filter((m) => states.get(m)?.state === 'on').length : 0);
  const compact = $derived(h < 150);

  // The scenes of this Hue room / zone. A Hue group light lists its scene names
  // (hue_scenes); the scene entities carry the group's name and type.
  const group = $derived(String(t(props.group) || a.friendly_name || '').trim());
  const hueNames = $derived(Array.isArray(a.hue_scenes) ? a.hue_scenes : []);
  const picked = $derived(Array.isArray(props.sceneList) ? props.sceneList : []);
  const pool = $derived(sceneIds().map((id) => states.get(id)).filter(Boolean));
  const loaded = $derived(renderTemplate(SCENES) != null && sceneIds().every((id) => states.has(id)));
  const scenes = $derived.by(() => {
    if (!group) return [];
    const seen = new Set();
    const mine = pool
      .filter((s) => s.attributes.group_name === group && (!a.hue_type || !s.attributes.group_type || s.attributes.group_type === a.hue_type))
      .filter((s) => { const n = s.attributes.name || s.attributes.friendly_name; if (seen.has(n)) return false; seen.add(n); return true; })
      .map((s) => ({ id: s.entity_id, name: s.attributes.name || s.attributes.friendly_name, dynamic: !!s.attributes.is_dynamic }));
    // Hue's own order when the light lists its scenes, otherwise alphabetical.
    const rank = (n) => { const i = hueNames.indexOf(n); return i < 0 ? 999 : i; };
    return mine.sort((x, y) => rank(x.name) - rank(y.name) || x.name.localeCompare(y.name));
  });

  // Scenes you picked yourself are shown exactly as listed (their order is the
  // list's order); with none picked, all of the room's scenes are shown.
  const shown = $derived.by(() => {
    if (!picked.length) return scenes;
    return picked.map((id) => {
      const st = states.get(id);
      return { id, name: st?.attributes?.name || st?.attributes?.friendly_name || id, dynamic: !!st?.attributes?.is_dynamic };
    });
  });

  let active = $state('');
  function run(s) {
    active = s.id;
    const animate = props.dynamic !== false && s.dynamic;
    callService('hue', 'activate_scene', { dynamic: animate }, { entity_id: s.id });
  }
  const showScenes = $derived(show('scenes') && !compact);

  // Make the scene row scrollable sideways with a mouse too: the wheel scrolls
  // it, and so does click-and-drag (touch already pans natively).
  function hscroll(node) {
    let down = false, moved = false, sx = 0, sl = 0;
    const wheel = (ev) => {
      if (node.scrollWidth <= node.clientWidth) return;
      node.scrollLeft += Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
      ev.preventDefault();
    };
    const pd = (ev) => { if (ev.pointerType !== 'mouse' || ev.button !== 0) return; down = true; moved = false; sx = ev.clientX; sl = node.scrollLeft; };
    const pm = (ev) => {
      if (!down) return;
      const dx = ev.clientX - sx;
      if (!moved && Math.abs(dx) > 5) { moved = true; node.setPointerCapture(ev.pointerId); }
      if (moved) node.scrollLeft = sl - dx;
    };
    const pu = () => { down = false; };
    const click = (ev) => { if (moved) { ev.stopPropagation(); ev.preventDefault(); moved = false; } };
    node.addEventListener('wheel', wheel, { passive: false });
    node.addEventListener('pointerdown', pd);
    node.addEventListener('pointermove', pm);
    node.addEventListener('pointerup', pu);
    node.addEventListener('pointercancel', pu);
    node.addEventListener('click', click, true);
    return { destroy() {
      node.removeEventListener('wheel', wheel);
      node.removeEventListener('pointerdown', pd);
      node.removeEventListener('pointermove', pm);
      node.removeEventListener('pointerup', pu);
      node.removeEventListener('pointercancel', pu);
      node.removeEventListener('click', click, true);
    } };
  }
</script>

<div class="light" class:on class:compact style="--lc:{color}">
  {#if show('glow')}<div class="glow" style="opacity:{on ? 0.25 + (pct / 100) * 0.75 : 0}"></div>{/if}
  <div class="top">
    <button class="ic" data-stop onclick={() => e && toggle(e)} aria-label="Toggle">
      <Icon icon={t(props.icon) || entityIcon(e)} size="1.5em" />
    </button>
    <div class="txt">
      <div class="name">{t(props.name) || name(e)}</div>
      {#if show('state')}
        <div class="state">
          {on ? (dimmable ? `${pct}%` : stateWord('light', null, 'on') || 'On') : e?.state === 'off' ? stateWord('light', null, 'off') || 'Off' : e?.state || '—'}
          {#if show('members') && members}<span class="mem">{' · '}{membersOn}/{members.length} on</span>{/if}
        </div>
      {/if}
    </div>
  </div>

  {#if dimmable && show('brightness')}
    <div class="bri">
      <Slider value={pct} min={1} max={100} color="linear-gradient(90deg, color-mix(in srgb, var(--lc) 45%, transparent), var(--lc))" height={compact ? 34 : 42}
        label={on ? '' : 'Off'} unit="%" onchange={(v) => svc({ brightness_pct: v })} />
    </div>
  {/if}

  {#if !compact && ((hasTemp && show('temp')) || showScenes)}
    <div class="quick" data-stop>
      {#if hasTemp && show('temp')}
        <button class="ct warm" title="Warm" onclick={() => svc({ color_temp_kelvin: a.min_color_temp_kelvin || 2700 })}></button>
        <button class="ct neutral" title="Neutral" onclick={() => svc({ color_temp_kelvin: 4000 })}></button>
        <button class="ct cool" title="Cool" onclick={() => svc({ color_temp_kelvin: a.max_color_temp_kelvin || 6500 })}></button>
      {/if}
      {#if showScenes}
        {#if hasTemp && show('temp')}<span class="sep"></span>{/if}
        {#if shown.length}
          <div class="scenes" use:hscroll>
            {#each shown as s (s.id)}
              <button class="sc" class:act={on && active === s.id} title={s.name} onclick={() => run(s)}>
                {#if s.dynamic}<Icon icon="mdi:motion-play-outline" size="1em" />{/if}{s.name}
              </button>
            {/each}
          </div>
        {:else if loaded && !picked.length}
          <span class="none">No Hue scenes for “{group}”</span>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .light { position: relative; height: 100%; width: 100%; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; gap: 10px; isolation: isolate; }
  .glow { position: absolute; inset: calc(var(--pad) * -1); z-index: -1; pointer-events: none; transition: opacity .5s, background .5s;
    background: radial-gradient(90% 120% at 12% 10%, color-mix(in srgb, var(--lc) 45%, transparent), transparent 65%); }
  .top { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .ic { width: 2.8em; height: 2.8em; border-radius: 50%; display: grid; place-items: center; border: 0; flex: none; background: rgba(255,255,255,.08); color: var(--muted); transition: all .3s; }
  .on .ic { background: var(--lc); color: rgba(0,0,0,.75); box-shadow: 0 0 18px color-mix(in srgb, var(--lc) 70%, transparent); }
  .txt { flex: 1; min-width: 0; }
  .name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .state { color: var(--muted); font-size: .85em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mem { color: var(--muted); }
  .quick { display: flex; align-items: center; gap: 6px; min-width: 0; width: 100%; overflow: hidden; }
  .ct { flex: none; width: 1.9em; aspect-ratio: 1; border-radius: 50%; border: 2px solid rgba(255,255,255,.15); padding: 0; transition: transform .15s; }
  .ct:active { transform: scale(.88); }
  .warm { background: #ffb46b; } .neutral { background: #fff1dc; } .cool { background: #cfe3ff; }
  .sep { flex: none; width: 1px; height: 1.4em; background: rgba(255,255,255,.12); margin: 0 2px; }
  /* Scenes: one scrolling row of pills. */
  .scenes { flex: 1 1 0; min-width: 0; display: flex; gap: 6px; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; scrollbar-width: none; touch-action: pan-x; padding: 2px 0; user-select: none; }
  .scenes::-webkit-scrollbar { display: none; }
  .sc { flex: none; display: inline-flex; align-items: center; gap: 4px; height: 1.9em; padding: 0 .85em; border-radius: 999px; border: 1px solid rgba(255,255,255,.15);
    background: rgba(255,255,255,.08); color: inherit; font-size: .85em; white-space: nowrap; transition: transform .15s, background .2s; }
  .sc:active { transform: scale(.94); }
  .sc.act { background: color-mix(in srgb, var(--lc) 55%, transparent); border-color: var(--lc); }
  .none { color: var(--muted); font-size: .8em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
