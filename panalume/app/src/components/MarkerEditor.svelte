<script>
  // Editor for the Picture elements card: one row per element, with the spot on
  // the picture given as a percentage so it survives any card size.
  import Icon from './Icon.svelte';
  import EntityPicker from './EntityPicker.svelte';
  import IconPicker from './IconPicker.svelte';
  import { states } from '../lib/ha.svelte.js';
  import { entityIcon, name as eName } from '../lib/entity.js';

  let { values = [], onupdate } = $props();

  const list = $derived(Array.isArray(values) ? values : []);
  const blank = () => ({ entity: '', icon: '', label: '', x: 50, y: 50, action: 'more-info', color: '', size: 24 });
  const commit = (next) => onupdate?.(next);
  const clone = () => list.map((m) => ({ ...m }));

  function patch(i, k, v) {
    const a = clone();
    a[i][k] = v;
    commit(a);
  }
  function clampPct(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n * 10) / 10)) : 50;
  }
  function add() { commit([...clone(), blank()]); }
  function del(i) { commit(clone().filter((_, j) => j !== i)); }
  function dup(i) {
    const a = clone();
    a.splice(i + 1, 0, { ...a[i], x: clampPct(Number(a[i].x) + 5) });
    commit(a);
  }
  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const a = clone();
    [a[i], a[j]] = [a[j], a[i]];
    commit(a);
  }
  const live = (m) => (m.entity ? states.get(String(m.entity).trim()) : null);
  const heading = (m) => (m.label ? String(m.label) : '') || eName(live(m)) || 'New element';
  const preview = (m) => String(m.icon || '').trim() || entityIcon(live(m)) || 'mdi:help-circle-outline';
</script>

<div class="mk-ed">
  {#each list as m, i (i)}
    <div class="mrow">
      <div class="head">
        <span class="pv"><Icon icon={preview(m)} size="1.15em" /></span>
        <span class="ttl" title={heading(m)}>{heading(m)}</span>
        <button type="button" title="Move up" disabled={i === 0} onclick={() => move(i, -1)}><Icon icon="mdi:arrow-up" size="14px" /></button>
        <button type="button" title="Move down" disabled={i === list.length - 1} onclick={() => move(i, 1)}><Icon icon="mdi:arrow-down" size="14px" /></button>
        <button type="button" title="Duplicate" onclick={() => dup(i)}><Icon icon="mdi:content-copy" size="14px" /></button>
        <button type="button" title="Remove" onclick={() => del(i)}><Icon icon="mdi:close" size="14px" /></button>
      </div>

      <div class="grid">
        <div class="f full">
          <label for="mk-{i}-entity">Entity</label>
          <EntityPicker bind:value={() => m.entity || '', (v) => patch(i, 'entity', v)} placeholder="Search entities…" />
        </div>
        <div class="f full">
          <label for="mk-{i}-icon">Icon</label>
          <IconPicker bind:value={() => m.icon || '', (v) => patch(i, 'icon', v)} onchange={() => commit(clone())} />
        </div>
        <div class="f full">
          <label for="mk-{i}-label">Label</label>
          <input id="mk-{i}-label" type="text" value={m.label ?? ''} placeholder="Kitchen" oninput={(e) => patch(i, 'label', e.currentTarget.value)} />
        </div>
        <div class="f">
          <label for="mk-{i}-x">X %</label>
          <input id="mk-{i}-x" type="number" min="0" max="100" step="1" value={m.x ?? 50} oninput={(e) => patch(i, 'x', e.currentTarget.value)} onchange={(e) => patch(i, 'x', clampPct(e.currentTarget.value))} />
        </div>
        <div class="f">
          <label for="mk-{i}-y">Y %</label>
          <input id="mk-{i}-y" type="number" min="0" max="100" step="1" value={m.y ?? 50} oninput={(e) => patch(i, 'y', e.currentTarget.value)} onchange={(e) => patch(i, 'y', clampPct(e.currentTarget.value))} />
        </div>
        <div class="f">
          <label for="mk-{i}-action">Tap</label>
          <select id="mk-{i}-action" value={m.action || 'more-info'} onchange={(e) => patch(i, 'action', e.currentTarget.value)}>
            <option value="toggle">Toggle</option>
            <option value="more-info">More info</option>
          </select>
        </div>
        <div class="f">
          <label for="mk-{i}-size">Size</label>
          <input id="mk-{i}-size" type="number" min="12" max="80" step="2" value={m.size ?? 24} oninput={(e) => patch(i, 'size', e.currentTarget.value)} />
        </div>
        <div class="f full">
          <label for="mk-{i}-color">Colour (when on)</label>
          <div class="col">
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(m.color || '') ? m.color : '#7aa2ff'} oninput={(e) => patch(i, 'color', e.currentTarget.value)} />
            <input id="mk-{i}-color" type="text" value={m.color ?? ''} placeholder="automatic (template ok)" oninput={(e) => patch(i, 'color', e.currentTarget.value)} />
          </div>
        </div>
      </div>
    </div>
  {/each}

  <button type="button" class="add" onclick={add}><Icon icon="mdi:plus" size="15px" /> Add element</button>
</div>

<style>
  .mk-ed { display: flex; flex-direction: column; gap: 8px; }
  .mrow { border: 1px solid rgba(255, 255, 255, .1); border-radius: 10px; padding: 6px 8px 8px; background: rgba(255, 255, 255, .03); }
  .head { display: flex; align-items: center; gap: 4px; margin-bottom: 6px; }
  .pv { width: 1.9em; height: 1.9em; border-radius: 50%; display: grid; place-items: center; background: rgba(255, 255, 255, .07); color: var(--muted); flex: none; }
  .ttl { flex: 1; min-width: 0; font-size: 12px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .head button { background: none; border: 0; color: var(--muted); padding: 4px; border-radius: 6px; display: grid; }
  .head button:hover:not(:disabled) { background: rgba(255, 255, 255, .1); color: var(--text); }
  .head button:disabled { opacity: .3; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .f { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .f.full { grid-column: 1 / -1; }
  label { font-size: 11px; color: var(--muted); }
  input, select { width: 100%; box-sizing: border-box; }
  .col { display: flex; gap: 6px; }
  .col input[type='color'] { width: 32px; flex: none; padding: 0; height: 32px; border: 0; background: none; }
  .add { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 7px; border-radius: 9px; border: 1px dashed rgba(255, 255, 255, .22); background: none; color: var(--text); font-size: 12px; cursor: pointer; }
  .add:hover { background: rgba(255, 255, 255, .06); }
</style>
