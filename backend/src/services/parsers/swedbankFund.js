/**
 * Swedbank Investment Fund Account CSV parser.
 *
 * Format: Same LHV-style semicolon-delimited CSV as the main bank account,
 *         but for the Swedbank investment/fund account (EE892...).
 *
 * Key differences from LHV bank CSV:
 *   - Transaction type M   = fund order (buy/sell)
 *   - Transaction type MK  = transfer (money in/out)
 *   - Transaction type MV  = market value / fund proceeds
 *   - Ticker extracted from Details text, not a separate column
 *   - Fund names, quantity, price embedded in Details for sell orders
 *
 * Column mapping (same as LHV bank):
 *   0  Client account     EE892200221082193921
 *   1  Row type           10 | 20 | 82 | 86
 *   2  Date               DD.MM.YYYY
 *   3  Beneficiary/Payer
 *   4  Details
 *   5  Amount             European decimal (comma)
 *   6  Currency
 *   7  Debit/Credit       D | K
 *   8  Transfer reference
 *   9  Transaction type   M | MK | MV | K2 | AS | LS
 *  10  Reference number
 *  11  Document number
 *
 * Fund tickers recognized (Swedbank Robur family):
 *   SWRGHDC  = Swedbank Robur Global High Dividend C
 *   SWRAEUC  = Swedbank Robur Access Edge Europa C
 *   SWBRUSAC = Swedbank Robur Access Edge USA C
 *   SWRAGLC  = Swedbank Robur Access Edge Global C
 *   SWRTECC  = Swedbank Robur Technology C
 *   SWBACASC = Swedbank Robur Access Asia C
 *   SWRMEDC  = Swedbank Robur Healthcare C
 */

const iconv  = require('iconv-lite');
const { TX_TYPES, makeFingerprint, parseEuropeanDecimal, normalizedTx } = require('./base');

const BROKER         = 'swedbank_fund';
const PARSER_VERSION = '1.0';
const TRANSACTION_ROW_TYPE = '20';

// Known fund ticker → canonical name map
const FUND_NAMES = {
  SWRGHDC:  'Swedbank Robur Global High Dividend C',
  SWRAEUC:  'Swedbank Robur Access Edge Europa C',
  SWBRUSAC: 'Swedbank Robur Access Edge USA C',
  SWRAGLC:  'Swedbank Robur Access Edge Global C',
  SWRTECC:  'Swedbank Robur Technology C',
  SWBACASC: 'Swedbank Robur Access Asia C',
  SWRMEDC:  'Swedbank Robur Healthcare C',
};

// List of all known fund tickers for quick membership test
const KNOWN_TICKERS = new Set(Object.keys(FUND_NAMES));

/**
 * Detect best encoding for this file.
 * Swedbank CSVs exported from Estonian banking UI are typically Windows-1252 (Latin-1 superset).
 * We validate by checking if the decoded result contains valid Estonian 'ü' characters.
 */
function decodeSwedbankBuffer(buffer) {
  // Try UTF-8 first — valid if all bytes decode cleanly (no replacement chars)
  const utf8 = iconv.decode(buffer, 'utf-8');
  // If no replacement character in typical Estonian words, UTF-8 is fine
  if (!utf8.includes('\uFFFD') && !utf8.includes('??')) return utf8;
  // Fall back to Windows-1252 which covers Estonian ü, õ, ä, ö correctly
  return iconv.decode(buffer, 'win1252');
}

function parseCSVLine(line) {
  const fields = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ';' && !inQ) {
      fields.push(cur.trim()); cur = '';
    } else { cur += ch; }
  }
  fields.push(cur.trim());
  return fields;
}

function parseDate(raw) {
  // DD.MM.YYYY
  const m = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return { date: `${yyyy}-${mm}-${dd}`, datetime: `${yyyy}-${mm}-${dd}T00:00:00` };
}

/**
 * Extract ticker and fund name from Details text.
 * Handles multiple historical formats:
 *   - "Fundorder 13617080 + SWRGHDC per.inv. 2916574"
 *   - "Fondi regulaarne investeerimine 16127067 SWRGHDC SWEDBANK ROBUR GL HIGH DIVID C"
 *   - "Fondi ostuorder 17191648 SWRTECC SWEDBANK ROBUR TECHNOLOGY C"
 *   - "Fondi müügiorder 16165331 SWRMEDC SWEDBANK ROBUR HEALTHCARE C -110.6176@13.12530737 SWEDBANK AS"
 */
function extractFundInfo(details) {
  let ticker   = null;
  let fundName = null;
  let orderId  = null;
  let quantity = null;
  let price    = null;

  // Pattern 1: "Fundorder NNNNN + TICKER ..."
  const p1 = details.match(/Fundorder\s+(\d+)\s+\+\s+(\w+)/i);
  if (p1) {
    orderId = p1[1];
    ticker  = p1[2];
  }

  // Pattern 2: "Fondi regulaarne investeerimine NNNN TICKER FUND NAME"
  const p2 = details.match(/investeerimine\s+(\d+)\s+(\w+)\s+(.+?)(?:\s+-[\d.]+@[\d.]+)?(?:\s+SWEDBANK AS)?$/i);
  if (p2) {
    orderId  = p2[1];
    ticker   = p2[2];
    fundName = p2[3].trim();
  }

  // Pattern 3: "Fondi ostuorder NNNN TICKER FUND NAME"
  const p3 = details.match(/ostuorder\s+(\d+)\s+(\w+)\s+(.+?)(?:\s+-[\d.]+@[\d.]+)?(?:\s+SWEDBANK AS)?$/i);
  if (p3 && !p2) {
    orderId  = p3[1];
    ticker   = p3[2];
    fundName = p3[3].trim();
  }

  // Pattern 4: "Fondi müügiorder NNNN TICKER FUND NAME -QTY@PRICE SWEDBANK AS"
  const p4 = details.match(/müügiorder\s+(\d+)\s+(\w+)\s+(.+?)\s+-([\d.]+)@([\d.]+)\s+SWEDBANK AS/i);
  if (p4) {
    orderId  = p4[1];
    ticker   = p4[2];
    fundName = p4[3].trim();
    quantity = parseFloat(p4[4]);
    price    = parseFloat(p4[5]);
  }

  // Look up canonical name if we have a ticker and no name yet
  if (ticker && !fundName && FUND_NAMES[ticker]) {
    fundName = FUND_NAMES[ticker];
  }

  // Fallback: scan details for any known ticker code (handles encoding issues with ü/ö/etc.)
  if (!ticker) {
    for (const t of KNOWN_TICKERS) {
      if (details.includes(t)) {
        ticker   = t;
        fundName = fundName || FUND_NAMES[t] || null;
        break;
      }
    }
    // Try to extract order ID and qty/price even without full regex match
    if (!orderId) {
      const mOrd = details.match(/(\d{7,})/);
      if (mOrd) orderId = mOrd[1];
    }
    if (!quantity) {
      const mQty = details.match(/-([\d.]+)@([\d.]+)/);
      if (mQty) { quantity = parseFloat(mQty[1]); price = parseFloat(mQty[2]); }
    }
  }

  return { ticker, fundName, orderId, quantity, price };
}

/**
 * Map Swedbank raw transaction type + direction + details → canonical TX_TYPE.
 */
function classifyTransaction(rawType, direction, details) {
  const det = details.toLowerCase();

  if (rawType === 'M') {
    if (direction === 'D') return TX_TYPES.BUY;    // fund purchase (debit = money out to buy)
    if (direction === 'K') return TX_TYPES.SELL;   // fund sale (credit = money in from sale)
  }

  if (rawType === 'MV') {
    // Market value / fund redemption proceeds
    if (direction === 'K') return TX_TYPES.SELL;
    if (direction === 'D') return TX_TYPES.FEE;
  }

  if (rawType === 'MK') {
    // Transfers between accounts
    if (direction === 'K') return TX_TYPES.DEPOSIT;
    if (direction === 'D') return TX_TYPES.WITHDRAWAL;
  }

  return rawType === 'K2' || rawType === 'AS' || rawType === 'LS'
    ? null  // balance rows, skip
    : TX_TYPES.TRANSFER;
}

function parseRow(fields) {
  if (fields.length < 10) return { valid: false, reason: 'Too few fields' };

  const accountId  = fields[0];
  const rowType    = fields[1];
  const rawDate    = fields[2];
  const details    = fields[4] || '';
  const rawAmount  = fields[5];
  const currency   = fields[6] || 'EUR';
  const direction  = fields[7];  // D or K
  const transferRef = fields[8] || null;
  const rawType    = fields[9];

  // Only import transaction rows (row type 20)
  if (rowType !== TRANSACTION_ROW_TYPE) {
    return { valid: false, skipped: true, reason: `Row type ${rowType} skipped` };
  }

  const dt = parseDate(rawDate);
  if (!dt) return { valid: false, reason: `Bad date: ${rawDate}` };

  const amount = parseEuropeanDecimal(rawAmount);
  const type   = classifyTransaction(rawType, direction, details);

  if (!type) return { valid: false, skipped: true, reason: `Type ${rawType}/${direction} not importable` };

  const fund = extractFundInfo(details);

  // Net amount: Buy = negative (cost), Sell/Deposit = positive (proceeds)
  // We store unsigned and use type to determine direction
  const netAmount = Math.abs(amount);

  return normalizedTx({
    broker:         BROKER,
    fingerprint:    makeFingerprint(BROKER, transferRef, dt.datetime, netAmount, rawType, fund.ticker),
    date:           dt.date,
    datetime:       dt.datetime,
    type,
    currency,
    netAmount,
    ticker:         fund.ticker,
    fundName:       fund.fundName,
    fundOrderId:    fund.orderId,
    quantity:       fund.quantity,
    pricePerShare:  fund.price,
    grossAmount:    netAmount,  // no separate gross for this format
    brokerAccountId: accountId,
    reference:      transferRef,
    rawDetails:     details,
    rawType,
  });
}

function parse(buffer) {
  const content = decodeSwedbankBuffer(buffer);

  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let header = null;
  const transactions = [];
  const errors   = [];
  let skipped    = 0;
  const warnings = [];

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

  // Extract account ID from first data row
  const accountId = transactions[0]?.brokerAccountId ?? null;
  if (accountId) warnings.push(`Detected account: ${accountId}`);

  return {
    broker:        BROKER,
    brokerName:    'Swedbank Investment',
    parserVersion: PARSER_VERSION,
    accountId,
    transactions,
    errors,
    skipped,
    warnings,
    summary: {
      totalRows:    transactions.length + errors.length + skipped,
      validCount:   transactions.length,
      errorCount:   errors.length,
      skippedCount: skipped,
      dateFrom:     dates[0] ?? null,
      dateTo:       dates[dates.length - 1] ?? null,
      tickers,
    },
  };
}

module.exports = { parse, BROKER, PARSER_VERSION, FUND_NAMES };
