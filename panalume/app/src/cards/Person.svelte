<script module>
  export const meta = {
    type: 'person', name: 'People', icon: 'mdi:account-group', category: 'Info',
    size: { w: 320, h: 110 }, tap: 'none',
    defaults: { entities: [], open: 'details' },
    fields: [
      { key: 'entities', label: 'People', type: 'entities', domain: ['person', 'device_tracker'] },
      { key: 'status', label: 'Status line (template; entity_id is each person, blank shows home / away / zone)', type: 'text', placeholder: "{{ states('sensor.' ~ entity_id.split('.')[1] ~ '_travel_time') }} min away" },
      { key: 'label', label: 'Name (template; entity_id is each person, blank shows their name)', type: 'text' },
      { key: 'open', label: 'Tapping a person opens', type: 'select', options: [{ value: 'details', label: 'Their details' }, { value: 'map', label: 'A map of where they are' }] },
    ],
    // The map shows your home zone, so make sure it is being watched.
    watch: (p) => (p.open === 'map' ? ['zone.home'] : []),
  };
</script>

<script>
  import { states, haImage } from '../lib/ha.svelte.js';
  import { app } from '../lib/config.svelte.js';
  import { stateText } from '../lib/entity.js';
  import { t } from '../lib/tpl.js';
  import { personTap } from '../lib/location.js';
  let { props, card } = $props();
  // When the card has its own tap action (a pop-up of other cards, say), tapping a
  // person does that too, so the whole card behaves the same wherever it's tapped.
  const cardTap = $derived(!!card?.tap?.action && card.tap.action !== 'none');
  const nameOf = (id, e) => (props.label && t(props.label, { entity_id: id })) || e?.attributes.friendly_name || id;
  // Their map if chosen and they report a location; otherwise their details.
  const open = (id, e) => (app.popup = personTap(props, e) === 'map' ? { map: id, title: nameOf(id, e) } : { entity: id });
</script>

<div class="ppl">
  {#if !(props.entities || []).length}
    <div class="hint">Pick the people in the card's settings.</div>
  {/if}
  {#each props.entities || [] as id}
    {@const e = states.get(id)}
    {@const home = e?.state === 'home'}
    <svelte:element this={cardTap ? 'div' : 'button'} class="p" data-stop={cardTap ? undefined : ''} onclick={cardTap ? undefined : () => open(id, e)} role={cardTap ? 'presentation' : undefined}>
      <div class="av" class:home>
        {#if e?.attributes.entity_picture}<img src={haImage(e.attributes.entity_picture)} alt="" />{:else}{(e?.attributes.friendly_name || '?')[0]}{/if}
      </div>
      <span class="n">{nameOf(id, e)}</span>
      <span class="s">{props.status ? t(props.status, { entity_id: id }) : stateText(e)}</span>
    </svelte:element>
  {/each}
</div>

<style>
  .hint { color: var(--muted); font-size: .82em; margin: auto; }
  /* People line up along the top (avatars level even when a status wraps); the row sits in the middle of the card. */
  .ppl { height: 100%; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); align-content: center; align-items: start; gap: 4px; }
  .p { display: flex; flex-direction: column; align-items: center; gap: 3px; background: none; border: 0; color: inherit; font: inherit; min-width: 0; flex: 1; }
  .av { width: 48px; height: 48px; border-radius: 50%; overflow: hidden; display: grid; place-items: center; background: rgba(255,255,255,.1); font-weight: 600; font-size: 1.2em; filter: grayscale(1); opacity: .6; box-shadow: 0 0 0 2px rgba(255,255,255,.1); transition: all .3s; }
  .av.home { filter: none; opacity: 1; box-shadow: 0 0 0 2px #5bd88f; }
  .av img { width: 100%; height: 100%; object-fit: cover; }
  .n { font-size: .85em; font-weight: 600; white-space: nowrap; }
  /* Long statuses (e.g. room names) wrap onto a second line rather than being cut
     off; single words (e.g. "Ausente") only break if they can't fit at all. */
  .s { font-size: .75em; color: var(--muted); text-align: center; line-height: 1.25; width: calc(100% + 12px); margin: 0 -6px; overflow-wrap: break-word; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; }
</style>
