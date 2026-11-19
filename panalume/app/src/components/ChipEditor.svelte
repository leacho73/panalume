<script>
  // Editor for the Chips card: one row per chip, kept in the order they sit on the
  // card. Order is the only placement — the card centres and wraps them itself — so
  // the arrows are how you arrange the bar.
  import Icon from './Icon.svelte';
  import EntityPicker from './EntityPicker.svelte';
  import IconPicker from './IconPicker.svelte';
  import { states } from '../lib/ha.svelte.js';
  import { entityIcon, name as eName } from '../lib/entity.js';

  let { values = [], onupdate } = $props();

  const list = $derived(Array.isArray(values) ? values : []);
  const blank = () => ({ entity: '', icon: '', label: '', show: 'name', control: '', action: '', color: '', visible: '' });
  const clone = () => list.map((c) => ({ ...c }));
  const commit = (next) => onupdate?.(next);

  function patch(i, k, v) {
    const a = clone();
    a[i][k] = v;
    commit(a);
  }
  function add() { commit([...clone(), blank()]); }
  function del(i) { commit(clone().filter((_, j) => j !== i)); }
  function dup(i) {
    const a = clone();
    a.splice(i + 1, 0, { ...a[i] });
    commit(a);
  }
  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const a = clone();
    [a[i], a[j]] = [a[j], a[i]];
    commit(a);
  }

  const live = (c) => (c.entity ? states.get(String(c.entity).trim()) : null);
  const heading = (c) => String(c.label ?? '').trim() || eName(live(c)) || String(c.entity ?? '').trim() || 'New chip';
  const preview = (c) => String(c.icon ?? '').trim() || entityIcon(live(c)) || 'mdi:tag-outline';
</script>

<div class="ced">
  {#each list as c, i (i)}
    <div class="crow2">
      <div class="head">
        <span class="pv"><Icon icon={preview(c)} size="1.15em" /></span>
        <span class="ttl" title={heading(c)}>{heading(c)}</span>
        <button type="button" title="Move up" disabled={i === 0} onclick={() => move(i, -1)}><Icon icon="mdi:arrow-up" size="14px" /></button>
        <button type="button" title="Move down" disabled={i === list.length - 1} onclick={() => move(i, 1)}><Icon icon="mdi:arrow-down" size="14px" /></button>
        <button type="button" title="Duplicate" onclick={() => dup(i)}><Icon icon="mdi:content-copy" size="14px" /></button>
        <button type="button" title="Remove" onclick={() => del(i)}><Icon icon="mdi:close" size="14px" /></button>
      </div>

      <div class="cgrid">
        <div class="f full">
          <label for="cd-{i}-entity">Entity</label>
          <EntityPicker bind:value={() => c.entity || '', (v) => patch(i, 'entity', v)} placeholder="Search entities…" />
        </div>
        <div class="f full">
          <label for="cd-{i}-icon">Icon (blank = the entity’s own)</label>
          <IconPicker bind:value={() => c.icon || '', (v) => patch(i, 'icon', v)} onchange={() => commit(clone())} />
        </div>
        <div class="f full">
          <label for="cd-{i}-label">Label (blank = the entity’s name, template ok)</label>
          <input id="cd-{i}-label" type="text" value={c.label ?? ''} placeholder="Kitchen" oninput={(e) => patch(i, 'label', e.currentTarget.value)} />
        </div>
        <div class="f">
          <label for="cd-{i}-show">Shows</label>
          <select id="cd-{i}-show" value={c.show || 'name'} onchange={(e) => patch(i, 'show', e.currentTarget.value)}>
            <option value="name">Name</option>
            <option value="state">State</option>
            <option value="both">Name and state</option>
            <option value="icon">Icon only</option>
          </select>
        </div>
        <div class="f">
          <label for="cd-{i}-control">Kind</label>
          <select id="cd-{i}-control" value={c.control || ''} onchange={(e) => patch(i, 'control', e.currentTarget.value)}>
            <option value="">Button (tap it)</option>
            <option value="slider">Slider (drag it)</option>
          </select>
        </div>
        {#if c.control === 'slider'}
          <div class="f">
            <label>Drags</label>
            <div class="note">Brightness on a light, position on a cover, the set point on a thermostat, volume on a speaker, a number helper's value — over the entity's own range, with the arrow keys on a desk.</div>
          </div>
        {:else}
          <div class="f">
            <label for="cd-{i}-action">Tap does</label>
            <select id="cd-{i}-action" value={c.action || ''} onchange={(e) => patch(i, 'action', e.currentTarget.value)}>
              <option value="">Automatic (toggle, else more info)</option>
              <option value="toggle">Toggle</option>
              <option value="more-info">More info</option>
              <option value="none">Nothing</option>
            </select>
          </div>
        {/if}
        <div class="f full">
          <label for="cd-{i}-color">Colour (template ok, `entity_id` is this chip’s entity)</label>
          <div class="col">
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '#7aa2ff'} oninput={(e) => patch(i, 'color', e.currentTarget.value)} />
            <input id="cd-{i}-color" type="text" value={c.color ?? ''} placeholder="the light’s own colour when on" oninput={(e) => patch(i, 'color', e.currentTarget.value)} />
          </div>
        </div>
        <div class="f full">
          <label for="cd-{i}-visible">Visible when (template, blank = always)</label>
          <input id="cd-{i}-visible" type="text" value={c.visible ?? ''} placeholder={"{{ is_state('sun.sun', 'below_horizon') }}"} oninput={(e) => patch(i, 'visible', e.currentTarget.value)} />
        </div>
      </div>
    </div>
  {/each}

  <button type="button" class="add" onclick={add}><Icon icon="mdi:plus" size="15px" /> Add chip</button>
</div>

<style>
  .ced { display: flex; flex-direction: column; gap: 8px; }
  .crow2 { border: 1px solid rgba(255, 255, 255, .1); border-radius: 10px; padding: 6px 8px 8px; background: rgba(255, 255, 255, .03); }
  .head { display: flex; align-items: center; gap: 4px; margin-bottom: 6px; }
  .pv { width: 1.9em; height: 1.9em; border-radius: 50%; display: grid; place-items: center; background: rgba(255, 255, 255, .07); color: var(--muted); flex: none; }
  .ttl { flex: 1; min-width: 0; font-size: 12px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .head button { background: none; border: 0; color: var(--muted); padding: 4px; border-radius: 6px; display: grid; }
  .head button:hover:not(:disabled) { background: rgba(255, 255, 255, .1); color: var(--text); }
  .head button:disabled { opacity: .3; }
  .cgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .f { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .f.full { grid-column: 1 / -1; }
  .note { font-size: 11px; color: var(--muted); line-height: 1.35; opacity: .85; }
  label { font-size: 11px; color: var(--muted); }
  input, select { width: 100%; box-sizing: border-box; }
  .col { display: flex; gap: 6px; }
  .col input[type='color'] { width: 32px; flex: none; padding: 0; height: 32px; border: 0; background: none; }
  .add { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 7px; border-radius: 9px; border: 1px dashed rgba(255, 255, 255, .22); background: none; color: var(--text); font-size: 12px; cursor: pointer; }
  .add:hover { background: rgba(255, 255, 255, .06); }
</style>
