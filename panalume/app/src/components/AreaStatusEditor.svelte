<script>
  import EntityPicker from './EntityPicker.svelte';
  import IconPicker from './IconPicker.svelte';
  import { changed } from '../lib/config.svelte.js';
  import { states, toast } from '../lib/ha.svelte.js';
  import { name } from '../lib/entity.js';
  import { areaRegistry, useAreaRegistry, loadAreaRegistry } from '../lib/area-registry.svelte.js';
  import { INDICATOR_TYPES, indicatorEntities, singleReading } from '../lib/area-status.js';
  let { obj } = $props();
  useAreaRegistry();
  let kind = $state('entity'), dragging = $state(''), expanded = $state('');
  function add() {
    const id = `indicator-${Math.random().toString(36).slice(2, 10)}`;
    (obj.indicators ??= []).push({ id, kind, enabled: true, entities: [], excluded: [] }); expanded = id; changed();
  }
  function move(from, to) {
    if (from < 0 || to < 0 || from === to || to >= obj.indicators.length) return;
    const next = [...obj.indicators]; next.splice(to, 0, next.splice(from, 1)[0]); obj.indicators = next; changed();
  }
  function blocked(id) {
    const entity = areaRegistry.entities.find((e) => e.entity_id === id);
    if (entity?.hidden_by || entity?.disabled_by) { toast('This entity is hidden or disabled in Home Assistant and cannot appear in Area Status.'); return true; }
    return false;
  }
  function addEntity(item, key, id) {
    if (key === 'entities' && blocked(id)) return;
    item[key] = key === 'entities' && singleReading(item.kind) ? [id] : [...new Set([...(item[key] || []), id])];
    if (key === 'entities') item.excluded = (item.excluded || []).filter((x) => x !== id);
    changed();
  }
  function addSensor(id) {
    if (blocked(id)) return;
    (obj.indicators ??= []).push({ id: `sensor-${Math.random().toString(36).slice(2, 10)}`, kind: 'entity', enabled: true, entities: [id], excluded: [] });
    changed(); toast('Sensor added to Area Status.');
  }
  const displayName = (id) => name(states.get(id)) || id;
</script>

<div class="settings">
  <label>Home Assistant area<select aria-label="Status card area" value={obj.area || ''} onchange={(e) => { obj.area = e.currentTarget.value; changed(); }}>
    <option value="">Manual selection</option>
    {#each areaRegistry.areas as a (a.area_id)}<option value={a.area_id}>{a.name}</option>{/each}
    {#if obj.area && !areaRegistry.areas.some((a) => a.area_id === obj.area)}<option value={obj.area}>{obj.area} (not found)</option>{/if}
  </select></label>
  <p>Select an area for automatic suggestions. Expand an indicator to choose sensors yourself or exclude entities. Entities marked hidden or disabled in Home Assistant are always omitted. Temperature, humidity and illuminance use one reading; the other automatic indicators combine their selected entities.</p>
  {#if areaRegistry.error}<p>{areaRegistry.error}</p>{/if}
  <button disabled={areaRegistry.loading} onclick={() => loadAreaRegistry()}>{areaRegistry.loading ? 'Reading areas…' : 'Refresh areas'}</button>
  <p>Drag the grip to reorder, or use ↑ and ↓.</p>
  {#each obj.indicators || [] as item, i (item.id)}
    <section role="group" aria-label={`${item.label || INDICATOR_TYPES[item.kind]?.label} indicator settings`} ondragover={(e) => e.preventDefault()} ondrop={(e) => { e.preventDefault(); move(obj.indicators.findIndex((x) => x.id === dragging), i); dragging = ''; }}>
      <div class="row">
        <button class="grip" draggable="true" aria-label={`Drag ${item.label || INDICATOR_TYPES[item.kind]?.label} to reorder`} ondragstart={(e) => { dragging = item.id; e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.effectAllowed = 'move'; }} ondragend={() => dragging = ''}>⠿</button>
        <label class="check"><input type="checkbox" checked={item.enabled !== false} onchange={(e) => { item.enabled = e.currentTarget.checked; changed(); }} />{item.label || INDICATOR_TYPES[item.kind]?.label}</label>
        <button disabled={i === 0} aria-label={`Move ${item.label || INDICATOR_TYPES[item.kind]?.label} up`} onclick={() => move(i, i - 1)}>↑</button>
        <button disabled={i === obj.indicators.length - 1} aria-label={`Move ${item.label || INDICATOR_TYPES[item.kind]?.label} down`} onclick={() => move(i, i + 1)}>↓</button>
        <button aria-label={`Remove ${item.label || INDICATOR_TYPES[item.kind]?.label} indicator`} onclick={() => { obj.indicators.splice(i, 1); changed(); }}>×</button>
      </div>
      <details open={expanded === item.id}><summary>Settings · {indicatorEntities(obj, item, areaRegistry, states).length} selected</summary>
        <label>Label<input aria-label={`${INDICATOR_TYPES[item.kind]?.label} label ${i + 1}`} value={item.label || ''} placeholder={INDICATOR_TYPES[item.kind]?.label} oninput={(e) => { item.label = e.currentTarget.value; changed(); }} /></label>
        <span class="caption">Icon</span><IconPicker bind:value={() => item.icon || INDICATOR_TYPES[item.kind]?.icon || '', (v) => item.icon = v} onchange={changed} />
        <span class="caption">{singleReading(item.kind) ? 'Sensor (empty = automatic; choosing a sensor replaces the current reading)' : 'Entities (empty = automatic)'}</span>
        {#each item.entities || [] as id, index}<div class="entity"><span>{displayName(id)}</span><button disabled={index === 0} aria-label={`Prefer ${displayName(id)}`} onclick={() => { [item.entities[index - 1], item.entities[index]] = [item.entities[index], item.entities[index - 1]]; changed(); }}>↑</button><button aria-label={`Remove ${displayName(id)}`} onclick={() => { item.entities = item.entities.filter((x) => x !== id); changed(); }}>×</button></div>{/each}
        <EntityPicker inline placeholder="Select entity…" domain={item.kind === 'lights' ? 'light' : item.kind === 'covers' ? 'cover' : ['windows', 'doors', 'motion', 'smoke'].includes(item.kind) ? 'binary_sensor' : null} onpick={(id) => addEntity(item, 'entities', id)} />
        <span class="caption">Excluded entities</span>
        {#each item.excluded || [] as id}<div class="entity"><span>{displayName(id)}</span><button aria-label={`Include ${displayName(id)} again`} onclick={() => { item.excluded = item.excluded.filter((x) => x !== id); changed(); }}>×</button></div>{/each}
        <EntityPicker inline placeholder="Exclude entity…" onpick={(id) => addEntity(item, 'excluded', id)} />
      </details>
    </section>
  {/each}
  <div class="row"><select aria-label="New status indicator" bind:value={kind}>{#each Object.entries(INDICATOR_TYPES) as [value, info]}<option {value}>{info.label}</option>{/each}</select><button onclick={add}>Add indicator</button></div>
  <span class="caption">Add individual sensor</span>
  <EntityPicker inline placeholder="Add individual sensor…" domain={['sensor', 'binary_sensor']} onpick={addSensor} />
</div>

<style>
  .settings { display: flex; flex-direction: column; gap: 9px; }
  p { margin: 0; font-size: 12px; line-height: 1.5; color: var(--muted); }
  label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; }
  .check { flex-direction: row; align-items: center; flex: 1; font-size: 13px; }
  .check input { width: auto; accent-color: var(--accent); }
  .row, .entity { display: flex; align-items: center; gap: 5px; }
  .row select, .entity span { flex: 1; min-width: 0; }
  .entity span { overflow-wrap: anywhere; font-size: 12px; }
  section { background: #ffffff08; padding: 7px; border-radius: 10px; }
  summary { font-size: 12px; color: var(--muted); cursor: pointer; padding: 7px 0; }
  details[open] { display: flex; flex-direction: column; gap: 7px; }
  .caption { font-size: 12px; color: var(--muted); }
  button { font: inherit; font-size: 12px; color: inherit; background: #ffffff10; border: 0; border-radius: 7px; padding: 7px 9px; cursor: pointer; }
  button:disabled { opacity: .35; cursor: default; }
  .grip { cursor: grab; font-size: 18px; padding: 3px 6px; }
</style>
