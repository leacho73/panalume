<script module>
  export const meta = {
    type: 'media', name: 'Media player', icon: 'mdi:music', category: 'Media',
    size: { w: 420, h: 220 }, tap: 'none', hold: 'more-info',
    defaults: { entity: '', artwork: 'background', show_progress: true, show_volume: true, show_source: true, show_group: true },
    fields: [
      { key: 'entity', label: 'Media player', type: 'entity', domain: 'media_player' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'artwork', label: 'Artwork', type: 'select', options: [{ value: 'background', label: 'Blurred, behind everything' }, { value: 'fill', label: 'Fill the card (sharp)' }, { value: 'cover', label: 'Square beside the text' }, { value: 'none', label: 'None' }] },
      { key: 'show_progress', label: 'Progress bar', type: 'bool' },
      { key: 'show_volume', label: 'Volume', type: 'bool' },
      { key: 'show_source', label: 'Source picker', type: 'bool' },
      { key: 'show_group', label: 'Grouping', type: 'bool' },
      { key: 'group_players', label: 'Players for grouping', type: 'entities', domain: 'media_player' },
    ],
  };
</script>

<script>
  import Icon from '../components/Icon.svelte';
  import Slider from '../components/Slider.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { name } from '../lib/entity.js';
  import { callService, haImage, states } from '../lib/ha.svelte.js';
  import { mediaPosition, clockTime, queueOwner } from '../lib/media.js';
  let { props, h } = $props();
  const e = $derived(ent(props.entity));
  const a = $derived(e?.attributes || {});
  const id = $derived(e?.entity_id);
  const sf = $derived(a.supported_features || 0);
  const has = (bit) => (sf & bit) !== 0;
  const playing = $derived(e?.state === 'playing');
  const off = $derived(!e || ['off', 'unavailable', 'unknown'].includes(e.state));
  const art = $derived(haImage(a.entity_picture_local || a.entity_picture));
  const title = $derived(a.media_title || (off ? 'Off' : e?.state === 'idle' ? 'Idle' : ''));
  const sub = $derived([a.media_artist, a.media_album_name].filter(Boolean).join(' — ') || a.app_name || a.source || '');
  const svc = (s, d = {}) => callService('media_player', s, d, { entity_id: id });
  // Skip, seek, shuffle and repeat go to the group's leader when this player is in a group.
  const queue = (s, d = {}) => callService('media_player', s, d, { entity_id: queueOwner(id, a) });
  // How far into the track, kept moving while it plays.
  let nowMs = $state(Date.now());
  $effect(() => {
    if (!playing) return;
    const i = setInterval(() => (nowMs = Date.now()), 1000);
    return () => clearInterval(i);
  });
  const dur = $derived(Number(a.media_duration) || 0);
  const pos = $derived(mediaPosition(a, playing, nowMs));
  const pct = $derived(dur > 0 && pos != null ? Math.max(0, Math.min(100, (pos / dur) * 100)) : 0);
  function seek(ev) {
    if (!has(2) || !dur) return;
    const r = ev.currentTarget.getBoundingClientRect();
    queue('media_seek', { seek_position: Math.round(((ev.clientX - r.left) / r.width) * dur) });
  }
  let groupOpen = $state(false);
  const members = $derived(a.group_members || [id]);
  const groupable = $derived(has(524288));
  const candidates = $derived.by(() => {
    const list = props.group_players?.length ? props.group_players : [...states.keys()].filter((k) => k.startsWith('media_player.') && (states.get(k).attributes.supported_features & 524288));
    return list.filter((k) => k !== id);
  });
  function toggleMember(m) {
    if (members.includes(m)) callService('media_player', 'unjoin', {}, { entity_id: m });
    else callService('media_player', 'join', { group_members: [m] }, { entity_id: id });
  }
  const compact = $derived(h < 170);
</script>

<div class="media {props.artwork}" class:compact>
  {#if art && (props.artwork === 'background' || props.artwork === 'fill')}<div class="bg" class:sharp={props.artwork === 'fill'} style="background-image:url('{art}')"></div><div class="shade"></div>{/if}
  <div class="main">
    {#if art && props.artwork === 'cover' && !compact}<img class="cover" src={art} alt="" />{/if}
    <div class="info">
      <div class="who"><Icon icon="mdi:speaker" size="1em" /> {t(props.name) || name(e)}{#if members.length > 1}<span class="badge">+{members.length - 1}</span>{/if}</div>
      <div class="title">{title}</div>
      <div class="sub">{sub}</div>
    </div>
  </div>
  <div class="controls" data-stop>
    {#if has(32768)}<button class:act={a.shuffle} onclick={() => queue('shuffle_set', { shuffle: !a.shuffle })}><Icon icon="mdi:shuffle" size="1.2em" /></button>{/if}
    {#if has(16)}<button onclick={() => queue('media_previous_track')}><Icon icon="mdi:skip-previous" size="1.6em" /></button>{/if}
    <button class="play" onclick={() => (off && has(128) ? svc('turn_on') : svc('media_play_pause'))}>
      <Icon icon={off ? 'mdi:power' : playing ? 'mdi:pause' : 'mdi:play'} size="1.8em" />
    </button>
    {#if has(32)}<button onclick={() => queue('media_next_track')}><Icon icon="mdi:skip-next" size="1.6em" /></button>{/if}
    {#if has(262144)}<button class:act={a.repeat && a.repeat !== 'off'} onclick={() => queue('repeat_set', { repeat: a.repeat === 'off' ? 'all' : a.repeat === 'all' ? 'one' : 'off' })}><Icon icon={a.repeat === 'one' ? 'mdi:repeat-once' : 'mdi:repeat'} size="1.2em" /></button>{/if}
  </div>
  {#if props.show_progress !== false && dur > 0 && pos != null && !compact}
    <div class="prog" data-stop>
      <span class="times">{clockTime(pos)}</span>
      <div class="track" class:seek={has(2)} role="presentation" onclick={seek}><div class="done" style="width:{pct}%"></div></div>
      <span class="times">{clockTime(dur)}</span>
    </div>
  {/if}
  <div class="bottom" data-stop>
    {#if props.show_volume && has(4)}
      <button class="mini" onclick={() => svc('volume_mute', { is_volume_muted: !a.is_volume_muted })}><Icon icon={a.is_volume_muted ? 'mdi:volume-off' : 'mdi:volume-high'} size="1.2em" /></button>
      <div class="vol"><Slider value={Math.round((a.volume_level ?? 0) * 100)} unit="%" height={30} color="rgba(255,255,255,.85)" onchange={(v) => svc('volume_set', { volume_level: v / 100 })} /></div>
    {/if}
    {#if props.show_source && a.source_list?.length}
      <select value={a.source} onchange={(ev) => svc('select_source', { source: ev.currentTarget.value })}>
        {#if !a.source}<option value="">Source</option>{/if}
        {#each a.source_list as s}<option value={s}>{s}</option>{/each}
      </select>
    {/if}
    {#if props.show_group && groupable}
      <button class="mini" class:act={members.length > 1} onclick={() => (groupOpen = !groupOpen)}><Icon icon="mdi:speaker-multiple" size="1.2em" /></button>
    {/if}
  </div>
  {#if groupOpen}
    <div class="group" data-stop>
      <div class="ghead">Group with <button class="mini" onclick={() => (groupOpen = false)}><Icon icon="mdi:close" size="1.1em" /></button></div>
      {#each candidates as m}
        {@const me = states.get(m)}
        <label class="gm"><input type="checkbox" checked={members.includes(m)} onchange={() => toggleMember(m)} /> {me ? name(me) : m}<span class="gs">{me?.state}</span></label>
      {/each}
    </div>
  {/if}
</div>

<style>
  .media { position: relative; height: 100%; display: flex; flex-direction: column; justify-content: space-between; gap: 8px; isolation: isolate; }
  .bg { position: absolute; inset: calc(var(--pad) * -1); background-size: cover; background-position: center; filter: blur(2px) saturate(1.2); transform: scale(1.05); z-index: -2; border-radius: inherit; transition: background-image .5s; }
  .bg.sharp { filter: none; transform: none; }
  .shade { position: absolute; inset: calc(var(--pad) * -1); background: linear-gradient(90deg, rgba(0,0,0,.8), rgba(0,0,0,.45)), linear-gradient(180deg, transparent 40%, rgba(0,0,0,.6)); z-index: -1; }
  .main { display: flex; gap: 14px; min-height: 0; flex: 1 1 auto; }
  .cover { height: 100%; max-height: 120px; aspect-ratio: 1; object-fit: cover; border-radius: 12px; box-shadow: 0 6px 20px rgba(0,0,0,.4); }
  .info { min-width: 0; display: flex; flex-direction: column; }
  .who { font-size: .8em; color: var(--muted); display: flex; align-items: center; gap: 6px; }
  .badge { background: var(--accent); color: #000; border-radius: 8px; padding: 0 6px; font-size: .85em; font-weight: 600; }
  .title { font-size: 1.25em; font-weight: 600; margin-top: 6px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .sub { color: var(--muted); font-size: .9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .controls { display: flex; align-items: center; justify-content: center; gap: 6px; }
  .compact .controls { justify-content: flex-end; position: absolute; right: 0; top: 0; }
  button { background: none; border: 0; color: inherit; padding: 6px; border-radius: 50%; display: grid; place-items: center; }
  button:active { background: rgba(255,255,255,.12); }
  .act { color: var(--accent); }
  .play { width: 52px; height: 52px; background: rgba(255,255,255,.92); color: #111; }
  .compact .play { width: 42px; height: 42px; }
  .bottom { display: flex; align-items: center; gap: 8px; }
  .prog { display: flex; align-items: center; gap: 8px; }
  .track { flex: 1; height: 5px; border-radius: 3px; background: rgba(255,255,255,.22); overflow: hidden; }
  .track.seek { cursor: pointer; height: 7px; }
  .done { height: 100%; background: var(--accent); transition: width 1s linear; }
  .times { font-size: .72em; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .vol { flex: 1; }
  select { background: rgba(255,255,255,.1); color: inherit; border: 0; border-radius: 10px; padding: 6px 8px; max-width: 40%; font: inherit; font-size: .85em; }
  .group { position: absolute; inset: 0; background: rgba(15,18,28,.96); border-radius: 12px; padding: 10px; overflow: auto; z-index: 5; }
  .ghead { display: flex; justify-content: space-between; align-items: center; font-weight: 600; margin-bottom: 6px; }
  .gm { display: flex; align-items: center; gap: 10px; padding: 8px 4px; border-bottom: 1px solid rgba(255,255,255,.06); }
  .gm input { width: 20px; height: 20px; accent-color: var(--accent); }
  .gs { margin-left: auto; color: var(--muted); font-size: .85em; }
</style>
