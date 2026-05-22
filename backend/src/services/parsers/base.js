/**
 * Base investment parser utilities.
 * Shared fingerprinting, amount parsing, date utilities.
 * All broker parsers must return objects conforming to NormalizedTx.
 */

const crypto = require('crypto');

/**
 * Normalized transaction type tokens shared across all brokers.
 */
const TX_TYPES = {
  BUY:        'Buy',
  SELL:       'Sell',
  DIVIDEND:   'Dividend',
  DEPOSIT:    'Deposit',
  WITHDRAWAL: 'Withdrawal',
  INTEREST:   'Interest',
  TRANSFER:   'Transfer',
  FEE:        'Fee',
  REFUND:     'Refund',
  CONVERSION: 'Conversion',
};

/**
 * Build a deduplication fingerprint for an investment transaction.
 * Priority: broker reference ID → fallback hash of key fields.
 */
function makeFingerprint(broker, reference, datetime, amount, type, ticker) {
  const ref = reference ? String(reference).trim() : '';
  const key = ref
    ? `${broker}:${ref}`
    : `${broker}:${datetime}:${amount}:${type}:${ticker ?? ''}`;
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 32);
}

/**
 * Parse a standard decimal amount string (e.g. "1234.56" or "-100.00").
 */
function parseDecimal(raw) {
  if (!raw || raw === '') return 0;
  return parseFloat(String(raw).replace(/,/g, '')) || 0;
}

/**
 * Parse European-formatted amount (comma as decimal, period as thousands).
 * e.g. "1.234,56" → 1234.56 or "92,70" → 92.70
 */
function parseEuropeanDecimal(raw) {
  if (!raw || raw === '') return 0;
  const s = String(raw).trim()
    .replace(/\./g, '')  // strip thousands separator
    .replace(',', '.');  // decimal comma → dot
  return parseFloat(s) || 0;
}

/**
 * Canonical NormalizedTx — what every parser must return for each row.
 * Optional fields default to null/0.
 */
function normalizedTx(fields) {
  return {
    // --- Core (required) ---
    broker:          fields.broker,           // 'lightyear' | 'swedbank_fund'
    fingerprint:     fields.fingerprint,
    date:            fields.date,             // YYYY-MM-DD
    datetime:        fields.datetime,         // YYYY-MM-DDTHH:MM:SS (use T00:00:00 when time unknown)
    type:            fields.type,             // TX_TYPES.*
    currency:        fields.currency || 'EUR',
    netAmount:       fields.netAmount,        // always present, signed positive

    // --- Asset identification ---
    ticker:          fields.ticker        ?? null,
    isin:            fields.isin          ?? null,
    fundName:        fields.fundName      ?? null,   // full fund name
    fundOrderId:     fields.fundOrderId   ?? null,   // broker order ID

    // --- Trade details ---
    quantity:        fields.quantity      ?? null,
    pricePerShare:   fields.pricePerShare ?? null,
    grossAmount:     fields.grossAmount   ?? null,
    fxRate:          fields.fxRate        ?? null,
    fee:             fields.fee           ?? 0,
    taxAmount:       fields.taxAmount     ?? 0,

    // --- Broker metadata ---
    brokerAccountId: fields.brokerAccountId ?? null,
    reference:       fields.reference     ?? null,   // broker's own tx ID
    rawDetails:      fields.rawDetails    ?? null,
    rawType:         fields.rawType       ?? null,
    settlementDate:  fields.settlementDate ?? null,

    valid: true,
  };
}

module.exports = { TX_TYPES, makeFingerprint, parseDecimal, parseEuropeanDecimal, normalizedTx };
