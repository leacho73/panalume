<script module>
  export const meta = {
    type: 'alarm', name: 'Alarm panel', icon: 'mdi:shield-home', category: 'Controls',
    size: { w: 300, h: 380 }, tap: 'none',
    defaults: { entity: '', keypad: true },
    fields: [
      { key: 'entity', label: 'Alarm', type: 'entity', domain: 'alarm_control_panel' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'keypad', label: 'Keypad', type: 'bool', hint: 'Shown anyway when the alarm needs a code.' },
      { key: 'code_disarm', label: 'Always ask for a code to disarm', type: 'bool', hint: 'For alarms that don\'t say whether they need one. Home Assistant checks the code with the alarm.' },
    ],
  };
</script>

<script>
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { name, stateText } from '../lib/entity.js';
  import { callService } from '../lib/ha.svelte.js';
  let { props, w = 300, h = 380 } = $props();
  const e = $derived(ent(props.entity));
  const a = $derived(e?.attributes || {});
  let code = $state('');
  // Disarm (and stop an arming countdown) whenever the alarm isn't simply disarmed.
  const armed = $derived(!!e && !['disarmed', 'unavailable', 'unknown'].includes(e.state));
  // The alarm's own code rules: a code to disarm whenever it has a code format (or the card
  // says always ask), and to arm only when it also says arming needs one.
  const needDisarm = $derived(!!a.code_format || !!props.code_disarm);
  const needArm = $derived(!!a.code_format && a.code_arm_required !== false);
  const textCode = $derived(a.code_format === 'text');
  const showPad = $derived(!!props.keypad || needDisarm || needArm);
  // Arm modes the alarm supports (home 1, away 2, night 4, vacation 32); all three when it doesn't say.
  const f = $derived(Number(a.supported_features) || 0);
  const modes = $derived([['alarm_arm_home', 'Home', 1], ['alarm_arm_away', 'Away', 2], ['alarm_arm_night', 'Night', 4], ['alarm_arm_vacation', 'Vacation', 32]].filter(([, , bit]) => (f ? f & bit : bit !== 32)));
  const go = (s) => {
    const need = s === 'alarm_disarm' ? needDisarm : needArm;
    if (need && !code) return;
    callService('alarm_control_panel', s, code ? { code } : {}, { entity_id: e.entity_id });
    code = '';
  };
  // Everything (buttons and keypad too) scales with the card, so resizing it
  // keeps the same look instead of squashing or cutting off the keypad.
  const k = $derived(Math.min(1.6, Math.max(0.5, Math.min(w / 300, h / (props.keypad ? 380 : 150)))));
  const color = $derived(e?.state === 'triggered' ? '#ff5b5b' : armed ? '#ff9f43' : '#5bd88f');
</script>

<div class="al" style="--ac:{color};font-size:{(k * 100).toFixed(1)}%">
  <div class="head"><Icon icon={armed ? 'mdi:shield-lock' : 'mdi:shield-off-outline'} size="1.8em" style="color:var(--ac)" />
    <div><div class="name">{t(props.name) || name(e)}</div><div class="state">{stateText(e)}</div></div></div>
  <div class="acts" data-stop>
    {#if armed}<button disabled={needDisarm && !code} onclick={() => go('alarm_disarm')}>Disarm</button>
    {:else}{#each modes as [svc, label] (svc)}<button disabled={needArm && !code} onclick={() => go(svc)}>{label}</button>{/each}{/if}
  </div>
  {#if showPad}
    {#if textCode}
      <input class="codein" type="password" autocomplete="off" placeholder="Code" bind:value={code} data-stop />
    {:else}
      <div class="code" class:hint={!code}>{'•'.repeat(code.length) || ((armed ? needDisarm : needArm) ? 'Enter the code' : ' ')}</div>
      <div class="pad" data-stop>
        {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'] as k}
          <button onclick={() => (k === 'C' ? (code = '') : k === '⌫' ? (code = code.slice(0, -1)) : (code += k))}>{k}</button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .al { height: 100%; display: flex; flex-direction: column; gap: .65em; min-height: 0; }
  .head { display: flex; align-items: center; gap: .75em; }
  .name { font-weight: 600; }
  .state { color: var(--ac); font-size: .9em; }
  .acts { display: flex; gap: .4em; }
  .acts button { flex: 1; padding: .65em; border-radius: .75em; border: 0; background: color-mix(in srgb, var(--ac) 25%, transparent); color: inherit; font: inherit; font-weight: 600; }
  .acts button:disabled { opacity: .4; }
  .code { text-align: center; letter-spacing: .4em; font-size: 1.4em; min-height: 1.4em; }
  .code.hint { font-size: .85em; letter-spacing: .05em; color: var(--muted); line-height: 1.65; }
  .codein { padding: .6em .8em; border-radius: .75em; font: inherit; text-align: center; letter-spacing: .2em; }
  .pad { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(3, 1fr); grid-auto-rows: minmax(0, 1fr); gap: .4em; }
  .pad button { min-height: 0; padding: 0; border-radius: .9em; border: 0; background: rgba(255,255,255,.07); color: inherit; font: inherit; font-size: 1.2em; }
  .pad button:active { background: rgba(255,255,255,.2); }
</style>
