/**
 * Investment CSV Parser — tailored for LightYear broker export format.
 *
 * Format characteristics:
 *   - Delimiter: , (comma), double-quoted fields
 *   - Date: DD/MM/YYYY HH:MM:SS
 *   - Amount: standard decimal with . (can be negative for conversion outflows)
 *   - Reference prefixes: OR=Order, DD=Dividend, DT=Deposit, WL=Withdrawal,
 *                         CN=Conversion, IN=Interest
 *   - Types: Buy, Sell, Dividend, Deposit, Withdrawal, Conversion, Interest, Refund
 *
 * Column indices (0-based):
 *   0  Date
 *   1  Reference
 *   2  Ticker
 *   3  ISIN
 *   4  Type
 *   5  Quantity
 *   6  CCY
 *   7  Price/share
 *   8  Gross Amount
 *   9  FX Rate
 *  10  Fee
 *  11  Net Amt.
 *  12  Tax Amt.
 */

const crypto = require('crypto');
const iconv  = require('iconv-lite');

// Types we import (skip Conversion — internal currency exchanges)
const IMPORT_TYPES = new Set(['Buy', 'Sell', 'Dividend', 'Deposit', 'Withdrawal', 'Interest', 'Refund']);

function parseInvestmentCSV(buffer) {
  let content;
  try {
    content = iconv.decode(buffer, 'utf-8');
  } catch {
    content = iconv.decode(buffer, 'latin1');
  }

  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let header = null;
  const rows = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const fields = parseCommaCsvLine(trimmed);
    if (!header) { header = fields; continue; }
    rows.push(fields);
  }

  const parsed  = rows.map((r, i) => parseInvestmentRow(r, i));
  const valid   = parsed.filter((r) => r.valid);
  const invalid = parsed.filter((r) => !r.valid);

  // Summarise
  const tickers = [...new Set(valid.filter((r) => r.ticker).map((r) => r.ticker))];
  const dates   = valid.map((r) => r.date).sort();

  return {
    transactions: valid,
    errors:       invalid,
    summary: {
      totalRows:    rows.length,
      validCount:   valid.length,
      errorCount:   invalid.length,
      dateFrom:     dates[0] ?? null,
      dateTo:       dates[dates.length - 1] ?? null,
      tickers,
    },
  };
}

function parseCommaCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQ = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      fields.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields;
}

/**
 * Parse DD/MM/YYYY HH:MM:SS → { date: 'YYYY-MM-DD', datetime: 'YYYY-MM-DDTHH:MM:SS' }
 */
function parseDatetime(raw) {
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}:\d{2})$/);
  if (!m) return null;
  const [, dd, mm, yyyy, time] = m;
  return {
    date:     `${yyyy}-${mm}-${dd}`,
    datetime: `${yyyy}-${mm}-${dd}T${time}`,
  };
}

function parseAmt(raw) {
  if (!raw || raw === '') return 0;
  return parseFloat(raw.replace(/,/g, '')) || 0;
}

function parseInvestmentRow(fields, idx) {
  try {
    while (fields.length < 13) fields.push('');

    const rawDate  = fields[0];
    const ref      = fields[1];
    const ticker   = fields[2] || null;
    const isin     = fields[3] || null;
    const type     = fields[4];
    const quantity = fields[5] ? parseFloat(fields[5]) : null;
    const currency = fields[6] || 'EUR';
    const pricePS  = fields[7] ? parseAmt(fields[7]) : null;
    const gross    = parseAmt(fields[8]);
    const fxRate   = fields[9] ? parseAmt(fields[9]) : null;
    const fee      = parseAmt(fields[10]);
    const netAmt   = parseAmt(fields[11]);
    const taxAmt   = parseAmt(fields[12]);

    if (!rawDate || !type) {
      return { valid: false, row: idx, reason: 'Missing date or type', raw: fields };
    }

    // Skip Conversion rows — they are internal broker FX exchanges
    if (!IMPORT_TYPES.has(type)) {
      return { valid: false, row: idx, reason: `Skipped type: ${type}`, raw: fields, skipped: true };
    }

    const dt = parseDatetime(rawDate);
    if (!dt) {
      return { valid: false, row: idx, reason: `Bad date: ${rawDate}`, raw: fields };
    }

    const fingerprint = generateFingerprint(ref, dt.datetime, netAmt, type, ticker);

    return {
      valid: true,
      fingerprint,
      reference:     ref || null,
      date:          dt.date,
      datetime:      dt.datetime,
      ticker,
      isin,
      type,
      quantity,
      currency,
      pricePerShare: pricePS,
      grossAmount:   gross,
      fxRate,
      fee,
      netAmount:     netAmt,
      taxAmount:     taxAmt,
    };
  } catch (err) {
    return { valid: false, row: idx, reason: err.message, raw: fields };
  }
}

function generateFingerprint(ref, datetime, amount, type, ticker) {
  const key = ref
    ? `inv:${ref}`
    : `inv:${datetime}:${amount}:${type}:${ticker ?? ''}`;
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 32);
}

module.exports = { parseInvestmentCSV };
