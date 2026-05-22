/**
 * CSV Parser — tailored for LHV Bank (Estonian bank) semicolon-delimited export format.
 *
 * Format characteristics:
 *   - Delimiter: ; (semicolon)
 *   - Quote char: " (double quote)
 *   - Encoding: UTF-8 (with possible latin-1 fallback)
 *   - Date format: DD.MM.YYYY
 *   - Amount: European decimal (comma as separator, always positive)
 *   - Direction: separate "Debit/Credit" column — D=expense, K=income
 *   - Row types: 10=opening balance, 20=transaction, 82=turnover, 86=closing balance
 *   - Only row type "20" rows are actual transactions
 *
 * Columns (0-indexed):
 *   0  Client account
 *   1  Row type
 *   2  Date
 *   3  Beneficiary/Payer
 *   4  Details
 *   5  Amount
 *   6  Currency
 *   7  Debit/Credit
 *   8  Transfer reference
 *   9  Transaction type
 *   10 Reference number
 *   11 Document number
 */

const crypto = require('crypto');
const iconv = require('iconv-lite');

const COLUMN_MAP = {
  account:          0,
  rowType:          1,
  date:             2,
  beneficiary:      3,
  details:          4,
  amount:           5,
  currency:         6,
  direction:        7,
  transferRef:      8,
  transactionType:  9,
  referenceNumber:  10,
  documentNumber:   11,
};

const TRANSACTION_ROW_TYPE = '20';
const OPENING_ROW_TYPE     = '10';
const CLOSING_ROW_TYPE     = '86';

/**
 * Parse raw buffer/string content of a bank CSV file.
 * Returns { transactions, summary } where transactions is array of parsed rows
 * and summary has account/date range info.
 */
function parseCSV(buffer) {
  // Try UTF-8 first, fall back to latin-1 for older exports
  let content;
  try {
    content = iconv.decode(buffer, 'utf-8');
    if (content.includes('\uFFFD')) throw new Error('Bad UTF-8');
  } catch {
    content = iconv.decode(buffer, 'latin1');
  }

  // Normalize line endings
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  const rows = [];
  let headerLine = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseSemicolonLine(line);

    // First non-empty line is header
    if (headerLine === null) {
      headerLine = fields;
      continue;
    }

    // Pad short rows to avoid index errors
    while (fields.length < 12) fields.push('');

    rows.push(fields);
  }

  const transactionRows = rows.filter((r) => r[COLUMN_MAP.rowType] === TRANSACTION_ROW_TYPE);

  const parsed = transactionRows.map((row, idx) => parseRow(row, idx));
  const valid   = parsed.filter((r) => r.valid);
  const invalid = parsed.filter((r) => !r.valid);

  // Extract opening and closing balance rows (types 10 and 86)
  const openingRow = rows.find((r) => r[COLUMN_MAP.rowType] === OPENING_ROW_TYPE);
  const closingRow = rows.find((r) => r[COLUMN_MAP.rowType] === CLOSING_ROW_TYPE);

  const extractBalance = (row, type) => {
    if (!row) return null;
    const rawAmt = row[COLUMN_MAP.amount];
    const dir    = row[COLUMN_MAP.direction]; // K = credit balance
    const date   = parseDate(row[COLUMN_MAP.date]);
    const amount = parseAmount(rawAmt ?? '0');
    // Closing balance with direction K means positive bank balance
    return {
      balanceType: type,
      amount:      dir === 'D' ? -amount : amount,
      currency:    row[COLUMN_MAP.currency] || 'EUR',
      date,
      account:     row[COLUMN_MAP.account],
    };
  };

  const openingBalance = extractBalance(openingRow, 'opening');
  const closingBalance = extractBalance(closingRow, 'closing');

  // Extract account and date range from all valid rows
  const account = valid[0]?.account ?? openingBalance?.account ?? null;
  const dates = valid.map((r) => r.date).sort();

  return {
    transactions: valid,
    errors: invalid,
    openingBalance,
    closingBalance,
    summary: {
      account,
      dateFrom:        dates[0] ?? null,
      dateTo:          dates[dates.length - 1] ?? null,
      totalRows:       rows.length,
      transactionRows: transactionRows.length,
      validCount:      valid.length,
      errorCount:      invalid.length,
      openingBalance:  openingBalance?.amount ?? null,
      closingBalance:  closingBalance?.amount ?? null,
    },
  };
}

/**
 * Parse a single semicolon-delimited line, respecting double-quoted fields.
 */
function parseSemicolonLine(line) {
  const fields = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ';' && !inQuote) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  fields.push(current.trim());
  return fields;
}

/**
 * Parse a single transaction row into a structured object.
 */
function parseRow(fields, idx) {
  try {
    const rawDate   = fields[COLUMN_MAP.date];
    const rawAmount = fields[COLUMN_MAP.amount];
    const direction = fields[COLUMN_MAP.direction];
    const transferRef = fields[COLUMN_MAP.transferRef];

    // Validate required fields
    if (!rawDate || !rawAmount || !direction) {
      return { valid: false, row: idx, reason: 'Missing required fields', raw: fields };
    }

    const date = parseDate(rawDate);
    if (!date) {
      return { valid: false, row: idx, reason: `Invalid date: ${rawDate}`, raw: fields };
    }

    const absAmount = parseAmount(rawAmount);
    if (isNaN(absAmount)) {
      return { valid: false, row: idx, reason: `Invalid amount: ${rawAmount}`, raw: fields };
    }

    // Positive = income (K), negative = expense (D)
    const amount = direction === 'K' ? absAmount : -absAmount;

    const beneficiary = fields[COLUMN_MAP.beneficiary] || '';
    const details     = fields[COLUMN_MAP.details] || '';

    // For card transactions the Details field contains: '516737******1639 DD.MM.YY  MERCHANT_NAME...
    // Extract the clean merchant name
    const merchant = extractMerchant(beneficiary, details, fields[COLUMN_MAP.transactionType]);

    const fingerprint = generateFingerprint({
      transferRef,
      date,
      amount: absAmount,
      direction,
      beneficiary,
    });

    return {
      valid: true,
      fingerprint,
      account:         fields[COLUMN_MAP.account],
      date,
      beneficiary,
      merchant,
      details,
      amount,
      currency:        fields[COLUMN_MAP.currency] || 'EUR',
      direction,
      transferRef:     transferRef || null,
      transactionType: fields[COLUMN_MAP.transactionType] || null,
      referenceNumber: fields[COLUMN_MAP.referenceNumber] || null,
      documentNumber:  fields[COLUMN_MAP.documentNumber] || null,
    };
  } catch (err) {
    return { valid: false, row: idx, reason: err.message, raw: fields };
  }
}

/**
 * Parse Estonian date format DD.MM.YYYY → ISO YYYY-MM-DD
 */
function parseDate(raw) {
  const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parse European amount format: "2.426,66" or "109,17" → float
 * Handles both comma-only decimals and dot-thousands + comma-decimal formats.
 */
function parseAmount(raw) {
  // Remove currency symbols and spaces
  let s = raw.replace(/[€$£\s]/g, '');
  // European format: dot = thousands separator, comma = decimal
  // e.g. "2.426,66" → "2426.66", "109,17" → "109.17"
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  return parseFloat(s);
}

/**
 * Extract and normalize the merchant name.
 * Card transactions (type 'K') embed merchant name in the Details field.
 * Pattern: '516737******1639 DD.MM.YY  MERCHANT_NAME  CITY
 */
function extractMerchant(beneficiary, details, txType) {
  // Card transaction: extract from details
  if (details.startsWith("'") && details.includes('*')) {
    // Strip leading quote, card number mask, and date
    // Format: '516737******1639 30.04.26  BRISA AREAS...
    const cardPattern = /^'[\d*]+\s+\d{2}\.\d{2}\.\d{2}\s+(.+)$/;
    const match = details.match(cardPattern);
    if (match) {
      return normalizeMerchantName(match[1]);
    }
  }

  // Bank transfer: use beneficiary
  if (beneficiary) return normalizeMerchantName(beneficiary);

  return normalizeMerchantName(details);
}

/**
 * Normalize merchant name:
 * - Collapse excessive whitespace
 * - Remove trailing location/city info patterns
 * - Title-case where appropriate
 */
function normalizeMerchantName(raw) {
  if (!raw) return '';

  let name = raw
    .replace(/\s+/g, ' ')        // Collapse whitespace
    .replace(/\\/g, ' ')          // Replace backslashes with space
    .trim();

  // Remove trailing address patterns: "10119 TALLINN", "11415 HARJUMAA, TA"
  name = name.replace(/\s+\d{5}\s+[\w\s,]+$/, '').trim();

  // Remove trailing country/city codes like "1019GM AMSTERDAM"
  name = name.replace(/\s+\d+[A-Z]{2}\s+[A-Z]+$/, '').trim();

  return name;
}

/**
 * Generate a SHA-256 fingerprint for duplicate detection.
 * Uses transfer reference when available (most reliable), otherwise falls
 * back to date + amount + direction + beneficiary combo.
 */
function generateFingerprint({ transferRef, date, amount, direction, beneficiary }) {
  const key = transferRef
    ? `ref:${transferRef}`
    : `tx:${date}:${amount}:${direction}:${(beneficiary || '').toLowerCase()}`;

  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 32);
}

module.exports = { parseCSV, parseDate, parseAmount, normalizeMerchantName };
