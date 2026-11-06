// Money in Home Assistant's own currency (Settings → System → General), with
// numbers written the local way: £1.44 / 35.2p, 1,44 € / 35,2 ct, 1,44 kr. /
// 35,2 øre. Energy prices are usually a fraction of the currency per kWh, so
// they're shown in the small unit where the currency has a familiar one.
import { send, conn } from './ha.svelte.js';
import { loadTranslations } from './i18n.svelte.js';

export const money = $state({ currency: 'GBP', locale: undefined });

// The small unit for prices: symbol, whether it sits right after the number.
const SUB = {
  GBP: ['p', true], EUR: ['ct', false], USD: ['¢', true], CAD: ['¢', true], AUD: ['¢', true], NZD: ['¢', true],
  DKK: ['øre', false], NOK: ['øre', false], SEK: ['öre', false], CHF: ['Rp.', false], PLN: ['gr', false], CZK: ['hal.', false], ZAR: ['c', true],
};

let asked = false;
/** Read the currency, language and country from Home Assistant once connected. */
export function loadMoney() {
  if (asked || !conn.connected) return;
  asked = true;
  send({ type: 'get_config' }).then((c) => {
    if (c?.currency) money.currency = c.currency;
    // HA's language (e.g. "de", or "en-GB") plus its country gives the number format.
    const lang = c?.language || '';
    money.locale = lang.includes('-') ? lang : lang && c?.country ? `${lang}-${c.country}` : lang || undefined;
    loadTranslations(lang);
  }).catch(() => (asked = false));
}

const nf = (opts) => { try { return new Intl.NumberFormat(money.locale, opts); } catch { return new Intl.NumberFormat(undefined, opts); } };

/** An amount of money: £1.44, 1,44 €, −£0.20. */
export function fmtMoney(v, digits = 2) {
  const n = Number(v);
  if (v == null || v === '' || !Number.isFinite(n)) return '—';
  return nf({ style: 'currency', currency: money.currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

/** A price per unit given in the main currency (e.g. 0.352 → 35.2p, 35,2 ct); `d` decimals in the small unit. */
export function fmtRate(v, d = 1) {
  const n = Number(v);
  if (v == null || v === '' || !Number.isFinite(n)) return '—';
  const sub = SUB[money.currency];
  if (!sub) return fmtMoney(n, 3);
  const num = nf({ minimumFractionDigits: d, maximumFractionDigits: d }).format(n * 100);
  return sub[1] ? num + sub[0] : `${num} ${sub[0]}`;
}

/** A plain number written the local way (2.4 / 2,4). */
export function fmtNum(v, d = 1) {
  const n = Number(v);
  return v == null || !Number.isFinite(n) ? '—' : nf({ minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
}
