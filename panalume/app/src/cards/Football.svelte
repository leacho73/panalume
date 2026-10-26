<script module>
  import { states } from '../lib/ha.svelte.js';
  // The Soccer Live integration (HACS) makes one sensor per team: sensor.soccer_live_<team>…
  const autofill = () => ({ entity: [...states.keys()].filter((id) => id.startsWith('sensor.soccer_live_')).sort()[0] || '' });
  export const meta = {
    type: 'football', name: 'Football', icon: 'mdi:soccer', category: 'Info',
    size: { w: 360, h: 320 }, tap: 'none',
    defaults: { entity: '', upcoming: 3, recent: 2, logos: false },
    autofill,
    sections: [{ key: 'head', label: 'Competition & venue' }, { key: 'upcoming', label: 'Next fixtures' }, { key: 'recent', label: 'Recent results' }],
    fields: [
      { key: 'entity', label: 'Team (a Soccer Live sensor)', type: 'entity', domain: 'sensor' },
      { key: 'name', label: 'Your team (blank = the sensor\'s team)', type: 'text' },
      { key: 'upcoming', label: 'Next fixtures shown', type: 'number', section: 'upcoming' },
      { key: 'recent', label: 'Recent results shown', type: 'number', section: 'recent' },
      { key: 'logos', label: 'Team logos (loaded from ESPN)', type: 'bool', hint: 'Off: each team shows as a short badge, and nothing is loaded from outside your home.' },
    ],
  };
</script>

<script>
  // A football team from the Soccer Live integration: the match on now (score and
  // minute), or the next one with its kick-off, then the next fixtures and recent
  // results with a win / draw / loss for your team.
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { clock } from '../lib/clock.svelte.js';
  let { props, w = 360, h = 320 } = $props();
  const show = (k) => !props.hide?.[k];

  const e = $derived(ent(props.entity));
  const mine = $derived(String(t(props.name) || e?.attributes.team_name || '').trim().toLowerCase());
  const matches = $derived.by(() => {
    const list = Array.isArray(e?.attributes.matches) ? e.attributes.matches : [];
    return list.filter((m) => m && m.home_team && m.away_team && !isNaN(Date.parse(m.date_iso))).map((m) => ({ ...m, at: new Date(m.date_iso) })).sort((a, b) => a.at - b.at);
  });
  const live = $derived(matches.find((m) => m.state === 'in'));
  const ahead = $derived(matches.filter((m) => m.state === 'pre'));
  const done = $derived(matches.filter((m) => m.state === 'post'));
  const hero = $derived(live || ahead[0] || done.at(-1));
  const upcoming = $derived(show('upcoming') ? ahead.filter((m) => m !== hero).slice(0, Math.max(0, Number(props.upcoming ?? 3))) : []);
  const recent = $derived(show('recent') ? done.filter((m) => m !== hero).slice(-Math.max(0, Number(props.recent ?? 2)) || done.length).reverse() : []);

  const isMine = (team) => !!mine && String(team).toLowerCase() === mine;
  const score = (v) => (v == null || v === '' || v === 'N/A' ? '' : String(v));
  // Win / draw / loss for your team.
  const result = (m) => {
    const hs = Number(score(m.home_score)), as = Number(score(m.away_score));
    if (!Number.isFinite(hs) || !Number.isFinite(as) || (!isMine(m.home_team) && !isMine(m.away_team))) return '';
    const us = isMine(m.home_team) ? hs : as, them = isMine(m.home_team) ? as : hs;
    return us > them ? 'W' : us < them ? 'L' : 'D';
  };
  const now = $derived(clock.now);
  const day0 = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const hm = (d) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const when = (d) => {
    const diff = Math.round((day0(d) - day0(now)) / 864e5);
    const day = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, diff > 0 && diff < 7 ? { weekday: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' });
    return `${day} ${hm(d)}`;
  };
  const shortDay = (d) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  // In the list: "Tomorrow 18:45", "Fri 14:00" this week, "3 Nov 18:45" after that.
  const listWhen = (d) => {
    const diff = Math.round((day0(d) - day0(now)) / 864e5);
    const day = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff > 0 && diff < 7 ? d.toLocaleDateString(undefined, { weekday: 'short' }) : shortDay(d);
    return `${day} ${hm(d)}`;
  };
  const small = $derived(h < 170);
</script>

{#snippet badge(name, abbrev, logo)}
  {#if props.logos && logo}<img class="logo" src={logo} alt="" loading="lazy" />
  {:else}<span class="abbr" class:me={isMine(name)}>{abbrev || String(name).slice(0, 3).toUpperCase()}</span>{/if}
{/snippet}

<div class="fb" class:small>
  {#if !props.entity}
    <div class="msg">Pick your team's Soccer Live sensor in the card's settings.</div>
  {:else if !hero}
    <div class="msg">{e ? 'No matches to show yet' : 'Sensor not found'}</div>
  {:else}
    {#if show('head') && !small}
      <div class="head"><Icon icon="mdi:soccer" size="1.1em" /><span class="lg">{hero.league_name || ''}</span>{#if hero.venue && w >= 300}<span class="vn">{hero.venue}</span>{/if}</div>
    {/if}
    <div class="hero" class:live={hero === live}>
      <div class="team" class:me={isMine(hero.home_team)}>{@render badge(hero.home_team, hero.home_abbrev, hero.home_logo)}<span class="tn">{hero.home_team}</span></div>
      <div class="mid">
        {#if hero.state === 'pre'}
          <span class="ko">{hm(hero.at)}</span><span class="sub">{when(hero.at).replace(` ${hm(hero.at)}`, '')}</span>
        {:else}
          <span class="sc">{score(hero.home_score) || 0}<i>–</i>{score(hero.away_score) || 0}</span>
          <span class="sub">{#if hero === live}<b class="dot"></b>{hero.clock || 'Live'}{:else}Full time · {shortDay(hero.at)}{/if}</span>
        {/if}
      </div>
      <div class="team" class:me={isMine(hero.away_team)}>{@render badge(hero.away_team, hero.away_abbrev, hero.away_logo)}<span class="tn">{hero.away_team}</span></div>
    </div>
    {#if !small && (upcoming.length || recent.length)}
      <div class="list">
        {#each upcoming as m}
          <div class="row"><span class="d">{listWhen(m.at)}</span><span class="vs"><span class:me={isMine(m.home_team)}>{m.home_team}</span> <i>v</i> <span class:me={isMine(m.away_team)}>{m.away_team}</span></span></div>
        {/each}
        {#each recent as m}
          {@const r = result(m)}
          <div class="row"><span class="d">{shortDay(m.at)}</span><span class="vs"><span class:me={isMine(m.home_team)}>{m.home_team}</span> <b>{score(m.home_score)}–{score(m.away_score)}</b> <span class:me={isMine(m.away_team)}>{m.away_team}</span></span>{#if r}<span class="r {r}">{r}</span>{/if}</div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .fb { height: 100%; display: flex; flex-direction: column; gap: 10px; min-height: 0; }
  .msg { flex: 1; display: grid; place-items: center; text-align: center; color: var(--muted); font-size: .85em; }
  .head { display: flex; align-items: center; gap: 6px; font-size: .78em; color: var(--muted); min-width: 0; }
  .head :global(svg) { color: var(--accent); flex: none; }
  .lg { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vn { margin-left: auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .hero { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; }
  .team { display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; text-align: center; }
  .tn { font-size: .85em; font-weight: 500; line-height: 1.15; overflow-wrap: anywhere; }
  .team.me .tn { font-weight: 700; }
  .abbr { width: 2.6em; height: 2.6em; border-radius: 50%; display: grid; place-items: center; font-size: .82em; font-weight: 700; letter-spacing: .02em; background: rgba(255,255,255,.08); color: var(--muted); }
  .abbr.me { background: color-mix(in srgb, var(--accent) 28%, transparent); color: var(--text); }
  .logo { width: 2.2em; height: 2.2em; object-fit: contain; }
  .mid { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .ko { font-size: 1.5em; font-weight: 600; font-variant-numeric: tabular-nums; }
  .sc { font-size: 1.9em; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: .02em; }
  .sc i { font-style: normal; color: var(--muted); margin: 0 .15em; }
  .sub { display: inline-flex; align-items: center; gap: 5px; font-size: .75em; color: var(--muted); white-space: nowrap; }
  .live .sub { color: #ff6b6b; font-weight: 600; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: #ff6b6b; animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .3; } }
  .list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 3px; scrollbar-width: thin; mask-image: linear-gradient(to bottom, #000 calc(100% - 14px), transparent); }
  .row { display: flex; align-items: center; gap: 8px; padding: 6px 9px; border-radius: 9px; background: rgba(255,255,255,.04); font-size: .8em; min-width: 0; }
  .d { flex: none; width: 8.2em; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
  .vs { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vs i { font-style: normal; color: var(--muted); }
  .vs b { font-variant-numeric: tabular-nums; margin: 0 .2em; }
  .vs .me { font-weight: 700; }
  .r { flex: none; width: 1.7em; height: 1.7em; border-radius: 6px; display: grid; place-items: center; font-size: .85em; font-weight: 700; }
  .r.W { background: rgba(91,216,143,.18); color: #5bd88f; }
  .r.D { background: rgba(255,255,255,.08); color: var(--muted); }
  .r.L { background: rgba(255,107,107,.18); color: #ff6b6b; }
  .small .hero { gap: 4px; }
  .small .abbr { width: 2.2em; height: 2.2em; }
</style>
