/**
 * Revolut account statement CSV (comma-separated).
 *
 * English: Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
 * Portuguese (pt-PT): Tipo,Produto,Data de início,Data de Conclusão,Descrição,Montante,Comissão,Moeda,Estado,Saldo
 *
 * Completed Date is authoritative for booking date & dedup fingerprint.
 */

const iconv = require('iconv-lite');
const { computeRevolutAmountFields } = require('./revolutCalculations');
const { canonicalRevolutFingerprint } = require('./revolutDedup');

/** Canonical column keys → accepted header labels (any locale). */
const HEADER_ALIASES = {
  type: ['type', 'tipo'],
  product: ['product', 'produto'],
  'started date': ['started date', 'data de inicio', 'data de início'],
  'completed date': ['completed date', 'data de conclusao', 'data de conclusão'],
  description: ['description', 'descricao', 'descrição'],
  amount: ['amount', 'montante'],
  fee: ['fee', 'comissao', 'comissão'],
  currency: ['currency', 'moeda'],
  state: ['state', 'estado'],
  balance: ['balance', 'saldo'],
};

const CANONICAL_HEADERS = Object.keys(HEADER_ALIASES);

/** Row states treated as settled (import); accents ignored. */
const COMPLETED_STATE_ALIASES = new Set(['COMPLETED', 'CONCLUIDA']);

function decodeBuffer(buffer) {
  try {
    const utf = iconv.decode(buffer, 'utf-8');
    if (utf.includes('\uFFFD')) throw new Error('Bad UTF-8');
    return utf;
  } catch {
    return iconv.decode(buffer, 'latin1');
  }
}

function parseCsvLineComma(line) {
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
    } else if (ch === ',' && !inQuote) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/** First non-empty line of buffer (for detection). */
function peekFirstCsvLine(buffer) {
  const content = decodeBuffer(buffer);
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  return lines.map((l) => l.trim()).find((l) => l.length) || '';
}

function normalizeHeaderToken(raw) {
  return String(raw || '')
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/\uFEFF/g, '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function buildHeaderMap(headers) {
  const normalized = headers.map((h) => normalizeHeaderToken(h));
  const map = {};

  for (const canonical of CANONICAL_HEADERS) {
    const aliases = HEADER_ALIASES[canonical].map((a) => normalizeHeaderToken(a));
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx >= 0) map[canonical] = idx;
  }

  return map;
}

function headerMapIsComplete(headerMap) {
  return CANONICAL_HEADERS.every((h) => headerMap[h] !== undefined);
}

/**
 * True if CSV header matches a Revolut statement export (English or Portuguese).
 */
function isRevolutCSV(buffer) {
  const line = peekFirstCsvLine(buffer);
  if (!line || line.includes(';')) return false;

  const fields = parseCsvLineComma(line).map((h) => h.trim().replace(/^"|"$/g, ''));
  if (fields.length < CANONICAL_HEADERS.length) return false;

  return headerMapIsComplete(buildHeaderMap(fields));
}

function isCompletedRevolutState(rawState) {
  const key = normalizeHeaderToken(rawState).toUpperCase();
  return COMPLETED_STATE_ALIASES.has(key);
}

function parseRevolutDatetime(raw) {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^"|"$/g, '');
  // "2025-03-31 04:16:29" or date-only ...
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[\sT](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return {
    isoDate: `${y}-${mo}-${d}`,
    isoDatetime: trimmed.length >= 19 ? trimmed.slice(0, 19) : `${y}-${mo}-${d} 00:00:00`,
  };
}

/** Parse numeric; supports "1,234.56" and European "1.234,56" heuristic. */
function parseNumber(raw) {
  if (raw === undefined || raw === null || raw === '') return 0;
  let s = String(raw).trim().replace(/^"|"$/g, '').replace(/[€$£\s]/g, '');
  if (!s || s === '—' || s === '-') return 0;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Parse Revolut CSV buffer → { transactions, skipped, summary }
 * Only imports rows with State === COMPLETED (case-insensitive).
 */
function parseRevolutCSV(buffer) {
  const content = decodeBuffer(buffer);
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  let headerMap = null;
  const skipped = [];

  /** @type {Array<object>} */
  const transactions = [];
  let idx = -1;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim()) continue;

    const cells = parseCsvLineComma(rawLine.replace(/\t/g, ','));

    if (headerMap === null) {
      headerMap = buildHeaderMap(cells.map((c) => c.replace(/^"|"$/g, '')));
      const missing = CANONICAL_HEADERS.filter((h) => headerMap[h] === undefined);
      if (missing.length) {
        throw new Error(`Not a Revolut statement CSV — missing columns: ${missing.join(', ')}`);
      }
      continue;
    }

    while (cells.length < 10) cells.push('');
    idx++;

    const get = (h) => {
      const ix = headerMap[h];
      return ix !== undefined ? (cells[ix] ?? '').trim().replace(/^"|"$/g, '') : '';
    };

    const stateRaw = get('state');
    if (!isCompletedRevolutState(stateRaw)) {
      skipped.push({
        row: idx,
        reason: stateRaw ? `skipped state: ${stateRaw}` : 'missing state',
        raw: cells,
      });
      continue;
    }
    const state = normalizeHeaderToken(stateRaw).toUpperCase();

    const revolutType = get('type');
    const product = get('product');
    const startedRaw = get('started date');
    const completedRaw = get('completed date');
    const description = get('description');
    const amount = parseNumber(get('amount'));
    const fee = parseNumber(get('fee'));
    const currency = get('currency') || 'EUR';

    const completed = parseRevolutDatetime(completedRaw);
    if (!completed) {
      skipped.push({ row: idx, reason: `invalid completed date: ${completedRaw}`, raw: cells });
      continue;
    }
    const startedDt = parseRevolutDatetime(startedRaw);

    if (!Number.isFinite(amount)) {
      skipped.push({ row: idx, reason: `invalid amount: ${get('amount')}`, raw: cells });
      continue;
    }

    const balanceRaw = get('balance');
    const balanceAfter = parseNumber(balanceRaw);

    const fingerprint = canonicalRevolutFingerprint({
      product,
      revolut_type: revolutType,
      completed_datetime: completed.isoDatetime,
      description,
      amount,
      fee,
      currency,
      state,
    });

    const amountFields = computeRevolutAmountFields({
      amount,
      revolut_type: revolutType,
      description,
    });

    transactions.push({
      valid: true,
      fingerprint,
      revolut_type: revolutType,
      product,
      started_datetime: startedDt ? startedDt.isoDatetime : null,
      completed_datetime: completed.isoDatetime,
      date: completed.isoDate,
      description,
      amount,
      fee: Number.isFinite(fee) ? fee : 0,
      currency,
      state,
      balance_after: Number.isFinite(balanceAfter) ? balanceAfter : null,
      raw_balance: balanceRaw || null,
      import_source: 'revolut_csv',
      effective_amount: amountFields.effective_amount,
      split_ratio: amountFields.split_ratio,
      exclude_from_analytics: amountFields.exclude_from_analytics,
      applies_shared_split: amountFields.applies_shared_split,
    });
  }

  const dates = transactions.map((t) => t.date).sort();
  return {
    transactions,
    skipped,
    summary: {
      source: 'revolut',
      account: transactions[0]?.product ?? null,
      dateFrom: dates[0] ?? null,
      dateTo: dates[dates.length - 1] ?? null,
      totalParsed: transactions.length,
      skippedRows: skipped.length,
    },
  };
}

module.exports = {
  isRevolutCSV,
  peekFirstCsvLine,
  parseRevolutCSV,
  parseCsvLineComma,
};
