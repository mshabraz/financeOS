/**
 * SEB Bank (Estonia) semicolon CSV export parser.
 *
 * Amounts are always positive; (D/C) column is C = credit, D = debit.
 * Stored using app-wide convention: direction K/D, signed amount.
 */

const crypto = require('crypto');
const iconv = require('iconv-lite');
const { parseDate, parseAmount, normalizeMerchantName } = require('./csvParser');
const { normalizeBankDirection, signedAmountFromIndicator } = require('./bankDirection');

const HEADER_ALIASES = {
  account: ['account'],
  documentNo: ['document no.', 'document no'],
  date: ['date'],
  beneficiaryAccount: ["beneficiary's account", 'beneficiary account'],
  beneficiaryName: ["beneficiary's name", 'beneficiary name'],
  bic: ['bic/swift', 'bic'],
  type: ['type'],
  direction: ['(d/c)', 'd/c', 'debit/credit'],
  amount: ['amount'],
  referenceNo: ['reference no.', 'reference no', 'reference number'],
  archiveId: ['archive id'],
  description: ['description'],
  commissionFee: ['commission fee', 'fee'],
  currency: ['currency'],
};

const REQUIRED_KEYS = ['account', 'date', 'direction', 'amount'];

function decodeContent(buffer) {
  try {
    const content = iconv.decode(buffer, 'utf-8');
    if (content.includes('\uFFFD')) throw new Error('Bad UTF-8');
    return content;
  } catch {
    return iconv.decode(buffer, 'latin1');
  }
}

function normalizeToken(raw) {
  return String(raw || '')
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/\uFEFF/g, '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function parseSemicolonLine(line) {
  const fields = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
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

function buildHeaderMap(headerFields) {
  const normalized = headerFields.map((h) => normalizeToken(h));
  const map = {};

  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      const idx = normalized.indexOf(normalizeToken(alias));
      if (idx >= 0) {
        map[key] = idx;
        break;
      }
    }
  }

  return map;
}

function headerMapIsSeb(headerMap) {
  return REQUIRED_KEYS.every((k) => headerMap[k] !== undefined);
}

function isSebCSV(buffer) {
  const content = decodeContent(buffer);
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length || !lines[0].includes(';')) return false;

  const headerMap = buildHeaderMap(parseSemicolonLine(lines[0]));
  if (headerMapIsSeb(headerMap) && headerMap.direction !== undefined) {
    const headerNorm = normalizeToken(lines[0]);
    if (headerNorm.includes('(d/c)') || headerNorm.includes('archive id')) return true;
    if (headerNorm.includes('beneficiary')) return true;
  }

  const dataLine = lines.slice(1).find((l) => l.trim());
  if (!dataLine) return false;

  const fields = parseSemicolonLine(dataLine);
  const dir = (fields[headerMap.direction ?? 7] || '').toUpperCase();
  const col1 = fields[1] || '';
  if ((dir === 'C' || dir === 'D') && !/^(10|20|82|86)$/.test(col1)) return true;

  return false;
}

function extractSebMerchant(beneficiary, description) {
  if (beneficiary) return normalizeMerchantName(beneficiary);
  if (!description) return '';

  const cardMatch = description.match(/kaart\.\.\.\d+\s+([^/#]+)/i);
  if (cardMatch) return normalizeMerchantName(cardMatch[1]);

  return normalizeMerchantName(description);
}

function generateFingerprint({ archiveId, documentNo, date, amount, direction, beneficiary }) {
  const key = archiveId
    ? `seb:arch:${archiveId}`
    : documentNo
      ? `seb:doc:${documentNo}:${date}`
      : `seb:tx:${date}:${amount}:${direction}:${(beneficiary || '').toLowerCase()}`;

  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 32);
}

function parseRow(fields, idx, col) {
  try {
    const get = (key) => {
      const i = col[key];
      return i !== undefined ? (fields[i] ?? '').trim().replace(/^"|"$/g, '') : '';
    };

    const rawDate = get('date');
    const rawAmount = get('amount');
    const rawDirection = get('direction');

    if (!rawDate || !rawAmount || !rawDirection) {
      return { valid: false, row: idx, reason: 'Missing required fields', raw: fields };
    }

    const date = parseDate(rawDate);
    if (!date) {
      return { valid: false, row: idx, reason: `Invalid date: ${rawDate}`, raw: fields };
    }

    const absAmount = parseAmount(rawAmount);
    if (Number.isNaN(absAmount)) {
      return { valid: false, row: idx, reason: `Invalid amount: ${rawAmount}`, raw: fields };
    }

    const bankDirection = normalizeBankDirection(rawDirection);
    if (!bankDirection) {
      return { valid: false, row: idx, reason: `Invalid direction: ${rawDirection}`, raw: fields };
    }

    const amount = signedAmountFromIndicator(absAmount, rawDirection);
    const beneficiary = get('beneficiaryName') || '';
    const details = get('description') || '';
    const merchant = extractSebMerchant(beneficiary, details);
    const archiveId = get('archiveId') || '';
    const documentNo = get('documentNo') || '';

    const fingerprint = generateFingerprint({
      archiveId,
      documentNo,
      date,
      amount: absAmount,
      direction: bankDirection,
      beneficiary,
    });

    return {
      valid: true,
      fingerprint,
      account: get('account'),
      date,
      beneficiary,
      merchant,
      details,
      amount,
      currency: get('currency') || 'EUR',
      direction: bankDirection,
      transferRef: get('referenceNo') || archiveId || null,
      transactionType: get('type') || null,
      referenceNumber: get('referenceNo') || null,
      documentNumber: documentNo || null,
      bankSource: 'seb',
    };
  } catch (err) {
    return { valid: false, row: idx, reason: err.message, raw: fields };
  }
}

function parseSebCSV(buffer) {
  const content = decodeContent(buffer);
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  let headerMap = null;
  const rows = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const fields = parseSemicolonLine(trimmed);
    if (!headerMap) {
      headerMap = buildHeaderMap(fields);
      if (!headerMapIsSeb(headerMap)) {
        throw new Error('Not a SEB bank CSV — missing required columns');
      }
      continue;
    }
    rows.push(fields);
  }

  const parsed = rows.map((row, idx) => parseRow(row, idx, headerMap));
  const valid = parsed.filter((r) => r.valid);
  const invalid = parsed.filter((r) => !r.valid);
  const account = valid[0]?.account ?? null;
  const dates = valid.map((r) => r.date).sort();

  return {
    transactions: valid,
    errors: invalid,
    openingBalance: null,
    closingBalance: null,
    summary: {
      account,
      dateFrom: dates[0] ?? null,
      dateTo: dates[dates.length - 1] ?? null,
      totalRows: rows.length,
      transactionRows: rows.length,
      validCount: valid.length,
      errorCount: invalid.length,
      openingBalance: null,
      closingBalance: null,
      bankFormat: 'seb',
    },
  };
}

module.exports = { isSebCSV, parseSebCSV };
