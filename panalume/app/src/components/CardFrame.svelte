<script>
  // Wraps a card: applies theme + per-card styling, visibility template and
  // tap / hold actions.
  import { cards } from '../lib/registry.js';
  import { t, ent, truthy } from '../lib/tpl.js';
  import { app, setView } from '../lib/config.svelte.js';
  import { callService } from '../lib/ha.svelte.js';
  import { toggle, canToggle, domain } from '../lib/entity.js';
  import { splitCss } from '../lib/css.js';

  let { card, w, h, editing = false, inPopup = false } = $props();
  const def = $derived(cards[card.type]);
  const s = $derived(card.style || {});
  const vars = $derived({ entity_id: card.props?.entity });
  // Content size: dashboard-wide card size × this card's own size (both %).
  const z = $derived(((Number(app.config.theme.cardScale) || 100) / 100) * ((Number(s.scale) || 100) / 100));
  const visible = $derived(!card.visible || truthy(t(card.visible, vars)));

  const cssParts = $derived(s.css ? splitCss(t(s.css, vars), `[data-card="${card.id}"][data-card]`) : { decls: '', rules: '' });
  const px = (v) => (v === '' || v == null ? null : /^-?\d+(\.\d+)?$/.test(String(v)) ? v + 'px' : v);
  const style = $derived.by(() => {
    const out = [];
    const add = (k, v) => v != null && v !== '' && out.push(`${k}:${v}`);
    add('--card-bg', t(s.background, vars));
    add('color', t(s.color, vars));
    add('--accent', t(s.accent, vars));
    add('--on', t(s.accent, vars));
    add('--radius', px(t(s.radius, vars)));
    add('--pad', px(t(s.padding, vars)));
    add('--card-border', t(s.border, vars));
    add('--card-shadow', t(s.shadow, vars));
    add('--blur', px(t(s.blur, vars)));
    add('opacity', t(s.opacity, vars));
    add('font-family', t(s.font, vars));
    add('font-size', px(t(s.fontSize, vars)));
    add('font-weight', t(s.fontWeight, vars));
    add('text-align', t(s.align, vars));
    const img = t(s.backgroundImage, vars);
    if (img) add('background-image', img.startsWith('url(') || img.includes('gradient(') ? img : `url('${img}')`);
    if (cssParts.decls) out.push(cssParts.decls);
    return out.join(';');
  });

  function run(which) {
    const meta = def?.meta || {};
    const act = card[which] || {};
    let kind = act.action || 'default';
    // Cards without a single "entity" (e.g. Zappi, energy cards) use the entity
    // picked for the action, the card's own choice (meta.infoEntity), or else their first entity setting that's filled in.
    let entity = t(act.entity) || t(card.props?.entity);
    if (!entity && kind === 'more-info' && meta.infoEntity) entity = meta.infoEntity(card.props || {});
    if (!entity && (kind === 'more-info' || kind === 'toggle' || kind === 'fullscreen')) {
      const f = (meta.fields || []).find((f) => f.type === 'entity' && card.props?.[f.key] && !String(card.props[f.key]).includes('{'));
      if (f) entity = card.props[f.key];
    }
    if (kind === 'default') kind = which === 'tap' ? meta.tap || 'more-info' : meta.hold || 'more-info';
    if (kind === 'toggle') {
      const e = ent(entity);
      if (e && (canToggle(entity) || ['scene', 'script', 'button', 'input_button'].includes(domain(entity)))) toggle(e);
      else if (entity) app.popup = { entity };
    } else if (kind === 'more-info' && entity) app.popup = { entity };
    else if (kind === 'fullscreen' && entity?.startsWith('camera.')) app.popup = { camera: entity, name: t(card.props?.name) };
    else if (kind === 'fullscreen' && entity) app.popup = { entity };
    else if (kind === 'popup') app.popup = { cards: act.cards || [], title: act.title };
    else if (kind === 'navigate' && act.view) setView(act.view);
    else if (kind === 'url' && act.url) window.open(t(act.url), act.newTab === false ? '_self' : '_blank');
    else if (kind === 'service' && act.service) {
      const [d, sv] = act.service.split('.');
      let data = {};
      try { data = act.data ? JSON.parse(t(act.data)) : {}; } catch { data = {}; }
      callService(d, sv, data, entity && !data.entity_id ? { entity_id: entity } : undefined);
    }
  }

  // Tap / hold detection that ignores interactive children (sliders, buttons).
  let holdTimer, held, startX, startY;
  function down(e) {
    if (editing || e.target.closest('[data-stop],button,input,select,textarea,a')) return;
    held = false;
    startX = e.clientX; startY = e.clientY;
    holdTimer = setTimeout(() => { held = true; navigator.vibrate?.(20); run('hold'); }, 500);
  }
  function move(e) {
    if (holdTimer && Math.hypot(e.clientX - startX, e.clientY - startY) > 10) clearTimeout(holdTimer), (holdTimer = null);
  }
  function up(e) {
    if (!holdTimer && !held) return;
    clearTimeout(holdTimer);
    holdTimer = null;
    if (!held && !editing) run('tap');
  }
  const tappable = $derived(!editing && ((card.tap?.action && card.tap.action !== 'none') || (!card.tap?.action && def?.meta.tap !== 'none')));
</script>

{#if visible || editing}
  {#if cssParts.rules}{@html `<style>${cssParts.rules}</style>`}{/if}
  <div role="presentation" data-card={card.id} class="card {card.type}" class:tappable class:hidden={!visible} class:popup={inPopup} {style}
    onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={() => clearTimeout(holdTimer)}>
    <div class="content" style="zoom:{z};{inPopup ? 'width:100%;height:100%' : `width:${w / z}px;height:${h / z}px`}">
      {#if def}
        <def.component props={card.props || {}} {card} w={w / z} h={h / z} {editing} />
      {:else}
        <div class="missing">Unknown card “{card.type}”</div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .card {
    position: absolute; inset: 0; overflow: hidden; box-sizing: border-box;
    border-radius: var(--radius);
    background: var(--card-bg); border: var(--card-border); box-shadow: var(--card-shadow);
    backdrop-filter: blur(var(--blur)) saturate(1.3); -webkit-backdrop-filter: blur(var(--blur)) saturate(1.3);
    background-size: cover; background-position: center;
    transition: transform .12s ease, background-color .3s;
    user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
    contain: layout paint;
  }
  .content { position: relative; box-sizing: border-box; padding: var(--pad); border-radius: inherit; }
  .card.popup { position: relative; inset: auto; height: 100%; }
  .tappable { cursor: pointer; }
  .tappable:active { transform: scale(.97); }
  .hidden { opacity: .35; outline: 1px dashed rgba(255,255,255,.4); }
  .missing { color: var(--muted); font-size: .85em; }
</style>
