/**
 * LightYear broker CSV parser.
 * Format: comma-delimited, double-quoted, DD/MM/YYYY HH:MM:SS dates, standard decimal amounts.
 *
 * Columns (0-based):
 *   0  Date          DD/MM/YYYY HH:MM:SS
 *   1  Reference     OR-xxx, DD-xxx, DT-xxx, WL-xxx, CN-xxx, IN-xxx
 *   2  Ticker        VUSA, MSFT, etc.
 *   3  ISIN          IE00B3XXRP09
 *   4  Type          Buy|Sell|Dividend|Deposit|Withdrawal|Conversion|Interest|Refund
 *   5  Quantity
 *   6  CCY           EUR|USD|GBP
 *   7  Price/share
 *   8  Gross Amount
 *   9  FX Rate
 *  10  Fee
 *  11  Net Amt.
 *  12  Tax Amt.
 */

const iconv  = require('iconv-lite');
const { TX_TYPES, makeFingerprint, parseDecimal, normalizedTx } = require('./base');

const BROKER = 'lightyear';
const PARSER_VERSION = '1.1';

// Types to import — skip Conversion (internal FX exchanges)
const IMPORT_TYPES = new Set(['Buy', 'Sell', 'Dividend', 'Deposit', 'Withdrawal', 'Interest', 'Refund']);

function parseCSVLine(line) {
  const fields = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      fields.push(cur.trim()); cur = '';
    } else { cur += ch; }
  }
  fields.push(cur.trim());
  return fields;
}

function parseDatetime(raw) {
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}:\d{2})$/);
  if (!m) return null;
  const [, dd, mm, yyyy, time] = m;
  return { date: `${yyyy}-${mm}-${dd}`, datetime: `${yyyy}-${mm}-${dd}T${time}` };
}

function parseRow(fields) {
  while (fields.length < 13) fields.push('');

  const rawDate  = fields[0];
  const ref      = fields[1] || null;
  const ticker   = fields[2] || null;
  const isin     = fields[3] || null;
  const rawType  = fields[4];
  const quantity = fields[5] ? parseFloat(fields[5]) : null;
  const currency = fields[6] || 'EUR';
  const pricePS  = fields[7] ? parseDecimal(fields[7]) : null;
  const gross    = parseDecimal(fields[8]);
  const fxRate   = fields[9] ? parseDecimal(fields[9]) : null;
  const fee      = parseDecimal(fields[10]);
  const netAmt   = parseDecimal(fields[11]);
  const taxAmt   = parseDecimal(fields[12]);

  if (!rawDate || !rawType) return { valid: false, reason: 'Missing date or type' };

  if (!IMPORT_TYPES.has(rawType)) {
    return { valid: false, skipped: true, reason: `Skipped type: ${rawType}` };
  }

  const dt = parseDatetime(rawDate);
  if (!dt) return { valid: false, reason: `Bad date: ${rawDate}` };

  // Map to canonical type
  const typeMap = {
    Buy: TX_TYPES.BUY, Sell: TX_TYPES.SELL, Dividend: TX_TYPES.DIVIDEND,
    Deposit: TX_TYPES.DEPOSIT, Withdrawal: TX_TYPES.WITHDRAWAL,
    Interest: TX_TYPES.INTEREST, Refund: TX_TYPES.REFUND,
  };

  return normalizedTx({
    broker:       BROKER,
    fingerprint:  makeFingerprint(BROKER, ref, dt.datetime, netAmt, rawType, ticker),
    date:         dt.date,
    datetime:     dt.datetime,
    type:         typeMap[rawType] || rawType,
    currency,
    netAmount:    Math.abs(netAmt),
    ticker,
    isin,
    quantity,
    pricePerShare: pricePS,
    grossAmount:   Math.abs(gross),
    fxRate,
    fee:           Math.abs(fee),
    taxAmount:     Math.abs(taxAmt),
    reference:     ref,
    rawType,
  });
}

function parse(buffer) {
  let content;
  try { content = iconv.decode(buffer, 'utf-8'); }
  catch { content = iconv.decode(buffer, 'latin1'); }

  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let header = null;
  const transactions = [];
  const errors = [];
  let skipped = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const fields = parseCSVLine(trimmed);
    if (!header) { header = fields; continue; }

    const result = parseRow(fields);
    if (result.skipped) { skipped++; continue; }
    if (!result.valid)  { errors.push({ reason: result.reason, raw: fields }); continue; }
    transactions.push(result);
  }

  const tickers = [...new Set(transactions.filter((t) => t.ticker).map((t) => t.ticker))];
  const dates   = transactions.map((t) => t.date).sort();

  return {
    broker:        BROKER,
    brokerName:    'LightYear',
    parserVersion: PARSER_VERSION,
    transactions,
    errors,
    skipped,
    summary: {
      totalRows:   transactions.length + errors.length + skipped,
      validCount:  transactions.length,
      errorCount:  errors.length,
      skippedCount: skipped,
      dateFrom:    dates[0] ?? null,
      dateTo:      dates[dates.length - 1] ?? null,
      tickers,
    },
  };
}

module.exports = { parse, BROKER, PARSER_VERSION };
