/**
 * FX rates to EUR via Frankfurter (ECB data, no API key).
 * Rates cached in memory: `perEur[USD]` = USD units per 1 EUR → EUR = amount / perEur[ccy].
 */

const logger = require('./logger');

const TARGET = 'EUR';
const CACHE_TTL_MS = 60 * 60 * 1000;
const API_BASE = 'https://api.frankfurter.dev/v1/latest';

/** Used only when live fetch fails and cache is empty */
const FALLBACK_PER_EUR = { EUR: 1, USD: 1.16, GBP: 0.87, CHF: 0.95, PKR: 305 };

let cache = {
  perEur: { EUR: 1 },
  date: null,
  fetchedAt: 0,
};

let tlsRelaxedAuto = false;

function normalizeCurrency(ccy) {
  const c = String(ccy || TARGET).toUpperCase();
  if (c === 'GBX') return 'GBP';
  return c;
}

function isTlsCertError(err) {
  let e = err;
  let depth = 0;
  while (e && depth < 6) {
    const code = e.code;
    const msg = String(e.message || '').toLowerCase();
    if (
      code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
      code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
      msg.includes('certificate') ||
      msg.includes('self-signed')
    ) {
      return true;
    }
    e = e.cause;
    depth += 1;
  }
  return false;
}

function createRelaxedFetch() {
  try {
    const { Agent, fetch: undiciFetch } = require('undici');
    const dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
    return (url, init) => undiciFetch(url, { ...init, dispatcher });
  } catch {
    return fetch;
  }
}

function getHttpFetch() {
  if (process.env.YAHOO_TLS_RELAXED === 'true' || tlsRelaxedAuto) {
    return createRelaxedFetch();
  }
  return fetch;
}

async function httpFetch(url, init) {
  try {
    return await getHttpFetch()(url, init);
  } catch (err) {
    if (!tlsRelaxedAuto && !process.env.YAHOO_TLS_RELAXED && isTlsCertError(err)) {
      tlsRelaxedAuto = true;
      logger.warn('[fxRates] Corporate TLS detected — retrying FX API with relaxed TLS');
      return createRelaxedFetch()(url, init);
    }
    throw err;
  }
}

async function fetchPerEurRates(currencies) {
  const needed = [...new Set(currencies.map(normalizeCurrency).filter((c) => c !== TARGET))];
  if (!needed.length) {
    return { perEur: { EUR: 1 }, date: new Date().toISOString().slice(0, 10) };
  }

  const symbols = needed.join(',');
  const url = `${API_BASE}?base=${TARGET}&symbols=${symbols}`;
  const res = await httpFetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'FinanceOS/1.0' },
  });
  if (!res.ok) throw new Error(`FX API HTTP ${res.status}`);

  const data = await res.json();
  const perEur = { EUR: 1 };
  for (const [ccy, unitsPerEur] of Object.entries(data.rates || {})) {
    if (unitsPerEur > 0) perEur[ccy.toUpperCase()] = unitsPerEur;
  }
  return { perEur, date: data.date || null };
}

/**
 * @param {string[]} currencies
 * @returns {Promise<{ perEur: Record<string, number>, date: string|null, stale: boolean, error?: string }>}
 */
async function getPerEurRates(currencies) {
  const now = Date.now();
  const needed = [...new Set((currencies || []).map(normalizeCurrency))];

  const cacheValid =
    cache.fetchedAt && now - cache.fetchedAt < CACHE_TTL_MS &&
    needed.every((c) => c === TARGET || cache.perEur[c]);

  if (cacheValid) {
    return { perEur: cache.perEur, date: cache.date, stale: false };
  }

  try {
    const { perEur, date } = await fetchPerEurRates(needed);
    cache = {
      perEur: { ...cache.perEur, ...perEur, EUR: 1 },
      date,
      fetchedAt: now,
    };
    return { perEur: cache.perEur, date: cache.date, stale: false };
  } catch (err) {
    logger.warn(`[fxRates] fetch failed: ${err.message}`);
    if (cache.fetchedAt) {
      return { perEur: cache.perEur, date: cache.date, stale: true, error: err.message };
    }
    return {
      perEur: { ...FALLBACK_PER_EUR },
      date: null,
      stale: true,
      error: err.message,
    };
  }
}

/**
 * Convert amount from `currency` to EUR.
 * @returns {number|null}
 */
function convertToEur(amount, currency, perEur) {
  if (amount == null || Number.isNaN(Number(amount))) return null;
  const ccy = normalizeCurrency(currency);
  const n = Number(amount);
  if (ccy === TARGET) return Math.round(n * 100) / 100;

  const unitsPerEur = perEur?.[ccy];
  if (!unitsPerEur || unitsPerEur <= 0) return null;

  return Math.round((n / unitsPerEur) * 100) / 100;
}

/**
 * Convert EUR amount to another currency (units per 1 EUR from Frankfurter).
 * @returns {number|null}
 */
function convertFromEur(amountEur, currency, perEur) {
  if (amountEur == null || Number.isNaN(Number(amountEur))) return null;
  const ccy = normalizeCurrency(currency);
  const n = Number(amountEur);
  if (ccy === TARGET) return Math.round(n * 100) / 100;

  const unitsPerEur = perEur?.[ccy];
  if (!unitsPerEur || unitsPerEur <= 0) return null;

  return Math.round(n * unitsPerEur * 100) / 100;
}

module.exports = {
  TARGET,
  getPerEurRates,
  convertToEur,
  convertFromEur,
  normalizeCurrency,
  FALLBACK_PER_EUR,
};
