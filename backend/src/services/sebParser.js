/**
 * SEB Bank (Estonia) semicolon CSV export parser.
 *
 * Header: Account;Document No.;Date;Beneficiary's account;Beneficiary's name;...
 * Direction column: (D/C) — D = debit, C = credit (not LHV's K).
 */

const crypto = require('crypto');
const iconv = require('iconv-lite');
const { parseDate, parseAmount, normalizeMerchantName } = require('./csvParser');

const COL = {
  account: 0,
  documentNo: 1,
  date: 2,
  beneficiaryAccount: 3,
  beneficiaryName: 4,
  bic: 5,
  type: 6,
  direction: 7,
  amount: 8,
  referenceNo: 9,
  archiveId: 10,
  description: 11,
  commissionFee: 12,
  currency: 13,
};

function decodeContent(buffer) {
  try {
    const content = iconv.decode(buffer, 'utf-8');
    if (content.includes('\uFFFD')) throw new Error('Bad UTF-8');
    return content;
  } catch {
    return iconv.decode(buffer, 'latin1');
  }
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

function isSebCSV(buffer) {
  const content = decodeContent(buffer);
  const first = content.replace(/^\uFEFF/, '').split(/\r?\n/).find((l) => l.trim()) || '';
  const lower = first.toLowerCase();
  return lower.includes('archive id') && lower.includes('(d/c)') && lower.startsWith('account;');
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

function parseRow(fields, idx) {
  try {
    while (fields.length < 14) fields.push('');

    const rawDate = fields[COL.date];
    const rawAmount = fields[COL.amount];
    const direction = fields[COL.direction];

    if (!rawDate || !rawAmount || !direction) {
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

    const dir = direction.toUpperCase();
    if (dir !== 'D' && dir !== 'C') {
      return { valid: false, row: idx, reason: `Invalid direction: ${direction}`, raw: fields };
    }

    const amount = dir === 'C' ? absAmount : -absAmount;
    const beneficiary = fields[COL.beneficiaryName] || '';
    const details = fields[COL.description] || '';
    const merchant = extractSebMerchant(beneficiary, details);
    const archiveId = fields[COL.archiveId] || '';
    const documentNo = fields[COL.documentNo] || '';

    const fingerprint = generateFingerprint({
      archiveId,
      documentNo,
      date,
      amount: absAmount,
      direction: dir,
      beneficiary,
    });

    return {
      valid: true,
      fingerprint,
      account: fields[COL.account],
      date,
      beneficiary,
      merchant,
      details,
      amount,
      currency: fields[COL.currency] || 'EUR',
      direction: dir,
      transferRef: fields[COL.referenceNo] || archiveId || null,
      transactionType: fields[COL.type] || null,
      referenceNumber: fields[COL.referenceNo] || null,
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

  const rows = [];
  let headerSeen = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const fields = parseSemicolonLine(trimmed);
    if (!headerSeen) {
      headerSeen = true;
      continue;
    }
    rows.push(fields);
  }

  const parsed = rows.map((row, idx) => parseRow(row, idx));
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
