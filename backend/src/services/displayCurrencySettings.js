/**
 * Net worth secondary currency display (dashboard conversion under EUR total).
 */

const { normalizeCurrency, FALLBACK_PER_EUR } = require('./fxRates');

const KEYS = {
  enabled: 'net_worth_display_currency_enabled',
  currency: 'net_worth_display_currency',
};

/** Currencies available for net worth conversion (Frankfurter / fallback). */
const SUPPORTED_CURRENCIES = [
  { code: 'PKR', label: 'Pakistani Rupee (PKR)' },
  { code: 'USD', label: 'US Dollar (USD)' },
  { code: 'GBP', label: 'British Pound (GBP)' },
  { code: 'CHF', label: 'Swiss Franc (CHF)' },
  { code: 'SEK', label: 'Swedish Krona (SEK)' },
  { code: 'NOK', label: 'Norwegian Krone (NOK)' },
  { code: 'DKK', label: 'Danish Krone (DKK)' },
  { code: 'PLN', label: 'Polish Złoty (PLN)' },
  { code: 'CZK', label: 'Czech Koruna (CZK)' },
  { code: 'HUF', label: 'Hungarian Forint (HUF)' },
  { code: 'INR', label: 'Indian Rupee (INR)' },
  { code: 'AUD', label: 'Australian Dollar (AUD)' },
  { code: 'CAD', label: 'Canadian Dollar (CAD)' },
  { code: 'JPY', label: 'Japanese Yen (JPY)' },
];

const SUPPORTED_CODES = new Set(SUPPORTED_CURRENCIES.map((c) => c.code));

function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row?.value ?? null;
}

function setSetting(db, key, value) {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, String(value));
}

function getNetWorthDisplayCurrency(db) {
  const enabledRaw = getSetting(db, KEYS.enabled);
  const currencyRaw = getSetting(db, KEYS.currency);
  const currency = normalizeCurrency(currencyRaw || 'PKR');

  return {
    enabled: enabledRaw !== 'false',
    currency: SUPPORTED_CODES.has(currency) ? currency : 'PKR',
    supportedCurrencies: SUPPORTED_CURRENCIES,
  };
}

function updateNetWorthDisplayCurrency(db, { enabled, currency }) {
  if (enabled !== undefined) {
    setSetting(db, KEYS.enabled, enabled ? 'true' : 'false');
  }
  if (currency !== undefined) {
    const code = normalizeCurrency(currency);
    if (!SUPPORTED_CODES.has(code)) {
      throw new Error(`Unsupported currency: ${currency}`);
    }
    setSetting(db, KEYS.currency, code);
  }
  return getNetWorthDisplayCurrency(db);
}

module.exports = {
  KEYS,
  SUPPORTED_CURRENCIES,
  FALLBACK_PER_EUR,
  getNetWorthDisplayCurrency,
  updateNetWorthDisplayCurrency,
};
