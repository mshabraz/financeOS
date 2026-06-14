/**
 * Duplicate transaction detection with weighted confidence scoring.
 * Conservative matching — favors review over auto-deletion.
 */

const crypto = require('crypto');
const { merchantsLikelyMatch } = require('./crossLedgerDedup');

const CONFIDENCE_LEVELS = ['very_high', 'high', 'medium', 'low'];

function normalizeToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function daysBetween(a, b) {
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 999;
  return Math.abs(Math.round((db - da) / (24 * 60 * 60 * 1000)));
}

function absAmount(amount) {
  const n = Math.abs(parseFloat(amount));
  return Number.isFinite(n) ? n : 0;
}

function amountsMatch(a, b, tolerance = 0.01) {
  return Math.abs(absAmount(a) - absAmount(b)) <= tolerance;
}

function merchantText(row) {
  return row.merchant || row.beneficiary || row.details || '';
}

function pairIgnoreKey(a, b) {
  const ids = [a.unified_id, b.unified_id].sort();
  return `pair:${ids.join('|')}`;
}

function loadIgnoreRules(db) {
  const rules = new Set();
  try {
    const rows = db.prepare('SELECT key FROM duplicate_ignore_rules').all();
    for (const r of rows) rules.add(r.key);
  } catch {
    /* table may not exist yet */
  }
  return rules;
}

function scorePair(a, b) {
  const reasons = [];
  let score = 0;

  const amtA = parseFloat(a.amount);
  const amtB = parseFloat(b.amount);
  const zeroA = Math.abs(amtA) < 0.01;
  const zeroB = Math.abs(amtB) < 0.01;

  if (zeroA && zeroB) {
    return { score: 0, level: 'low', reasons: ['Both zero-amount'] };
  }

  // Zero + real amount pending→posted pattern
  if ((zeroA && !zeroB) || (zeroB && !zeroA)) {
    const real = zeroA ? b : a;
    const zero = zeroA ? a : b;
    if (merchantsLikelyMatch(real.merchant || real.details, zero)) {
      score += 75;
      reasons.push('Likely pending → posted (zero-amount placeholder)');
    } else {
      return { score: 0, level: 'low', reasons: [] };
    }
  }

  const refs = new Set(
    [a.transfer_ref, a.reference_number, a.document_number, b.transfer_ref, b.reference_number, b.document_number]
      .filter(Boolean)
      .map((r) => String(r).trim()),
  );
  if (
    a.transfer_ref && b.transfer_ref &&
    String(a.transfer_ref).trim() === String(b.transfer_ref).trim()
  ) {
    score += 45;
    reasons.push('Same bank transaction / reference ID');
  } else if (refs.size === 1 && a.transfer_ref && b.transfer_ref) {
    score += 45;
    reasons.push('Matching reference ID');
  }

  if (amountsMatch(a.amount, b.amount)) {
    score += 28;
    reasons.push('Same amount');
  } else {
    return { score: 0, level: 'low', reasons: [] };
  }

  const dayDiff = daysBetween(a.date, b.date);
  if (dayDiff === 0) {
    score += 18;
    reasons.push('Same booking date');
  } else if (dayDiff <= 3) {
    score += 10;
    reasons.push('Dates within 3 days (booking vs value date)');
  } else if (dayDiff > 7) {
    score -= 15;
  }

  const mA = merchantText(a);
  const mB = merchantText(b);
  if (merchantsLikelyMatch(mA, { merchant: mB, details: mB })) {
    score += 22;
    reasons.push('Similar merchant / description');
  } else {
    score -= 20;
  }

  if (a.ledger !== b.ledger) {
    score += 12;
    reasons.push('Cross-ledger mirror (bank + Revolut)');
  }

  if (a.ledger === b.ledger && a.fingerprint && a.fingerprint === b.fingerprint) {
    score += 40;
    reasons.push('Identical import fingerprint');
  }

  if (
    a.import_source && b.import_source &&
    a.import_source !== b.import_source
  ) {
    score += 15;
    reasons.push('CSV + bank sync overlap');
  }

  if (a.category_source === 'manual' && b.category_source === 'manual' &&
      a.category_id && b.category_id && a.category_id !== b.category_id) {
    score -= 40;
    reasons.push('Both manually categorized differently — review carefully');
  }

  // Same day, same amount, same merchant — could be two legitimate purchases
  if (dayDiff === 0 && amountsMatch(a.amount, b.amount) &&
      normalizeToken(mA) === normalizeToken(mB) && mA.length > 0) {
    const descDiff = normalizeToken(a.details) !== normalizeToken(b.details);
    if (descDiff && a.details && b.details) {
      score -= 12;
      reasons.push('Same-day repeat — may be separate purchases');
    }
  }

  score = Math.max(0, Math.min(100, score));

  let level = 'low';
  if (score >= 88) level = 'very_high';
  else if (score >= 72) level = 'high';
  else if (score >= 52) level = 'medium';

  return { score, level, reasons };
}

function groupIdForMembers(members) {
  const ids = members.map((m) => m.unified_id).sort();
  return crypto.createHash('sha256').update(ids.join('|')).digest('hex').slice(0, 16);
}

function loadScanRows(db, { dateFrom, dateTo }) {
  const bank = db.prepare(`
    SELECT
      'bank' AS ledger,
      t.id AS id,
      CAST(t.id AS TEXT) AS unified_id,
      t.date, t.amount, t.beneficiary, t.merchant, t.details, t.currency, t.direction,
      t.transfer_ref, t.reference_number, t.document_number, t.fingerprint,
      t.category_id, t.category_source, t.notes, t.account,
      t.transaction_type AS tx_type,
      NULL AS import_source,
      NULL AS revolut_type,
      NULL AS effective_amount,
      NULL AS product,
      t.created_at
    FROM transactions t
    WHERE t.date >= ? AND t.date <= ?
  `).all(dateFrom, dateTo);

  const revolut = db.prepare(`
    SELECT
      'revolut' AS ledger,
      r.id AS id,
      ('r' || r.id) AS unified_id,
      r.date, r.amount, NULL AS beneficiary, r.description AS merchant, r.description AS details,
      r.currency,
      CASE WHEN r.amount >= 0 THEN 'K' ELSE 'D' END AS direction,
      r.transfer_ref, NULL AS reference_number, NULL AS document_number, r.fingerprint,
      r.category_id, r.category_source, r.notes, r.product AS account,
      r.revolut_type AS tx_type,
      r.import_source, r.revolut_type, r.effective_amount, r.product,
      r.created_at
    FROM revolut_transactions r
    WHERE r.date >= ? AND r.date <= ?
  `).all(dateFrom, dateTo);

  return [...bank, ...revolut];
}

function enrichRow(db, row) {
  const tags = row.ledger === 'bank'
    ? db.prepare(
        `SELECT tg.id, tg.name, tg.color FROM tags tg
         JOIN transaction_tags tt ON tt.tag_id = tg.id
         WHERE tt.transaction_id = ?`,
      ).all(row.id)
    : db.prepare(
        `SELECT tg.id, tg.name, tg.color FROM tags tg
         JOIN revolut_transaction_tags rt ON rt.tag_id = tg.id
         WHERE rt.revolut_transaction_id = ?`,
      ).all(row.id);

  let category = null;
  if (row.category_id) {
    category = db.prepare(
      'SELECT id, name, icon, color FROM categories WHERE id = ?',
    ).get(row.category_id);
  }

  return {
    ...row,
    tags,
    category,
    import_method: row.import_source || (row.ledger === 'bank' ? 'bank_csv_or_ob' : 'revolut_csv_or_ob'),
    sync_source: row.import_source === 'open_banking' ? 'open_banking' : row.import_source || 'manual_import',
  };
}

function scanDuplicateGroups(db, options = {}) {
  const {
    mode = 'last30',
    minLevel = 'medium',
    search = '',
    merchant = '',
    amount = null,
    source = '',
  } = options;

  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);
  let dateFrom = '2000-01-01';
  let dateTo = isoToday;

  if (mode === 'last30') {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    dateFrom = d.toISOString().slice(0, 10);
  } else if (mode === 'new') {
    const d = new Date(today);
    d.setDate(d.getDate() - 14);
    dateFrom = d.toISOString().slice(0, 10);
  }

  const minIdx = CONFIDENCE_LEVELS.indexOf(minLevel);
  const ignore = loadIgnoreRules(db);
  const rows = loadScanRows(db, { dateFrom, dateTo });

  const buckets = new Map();
  for (const row of rows) {
    if (search) {
      const q = search.toLowerCase();
      const hay = `${merchantText(row)} ${row.details || ''} ${row.notes || ''}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    if (merchant && !merchantText(row).toLowerCase().includes(merchant.toLowerCase())) continue;
    if (amount != null && !amountsMatch(row.amount, amount)) continue;
    if (source === 'bank' && row.ledger !== 'bank') continue;
    if (source === 'revolut' && row.ledger !== 'revolut') continue;

    const key = `${absAmount(row.amount).toFixed(2)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }

  const groups = [];
  const seenPairs = new Set();

  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;

    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i];
        const b = bucket[j];

        const ignoreKey = pairIgnoreKey(a, b);
        if (ignore.has(ignoreKey)) continue;

        const { score, level, reasons } = scorePair(a, b);
        if (CONFIDENCE_LEVELS.indexOf(level) < minIdx) continue;

        const pairKey = `${a.unified_id}:${b.unified_id}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        const members = [enrichRow(db, a), enrichRow(db, b)];
        groups.push({
          groupId: groupIdForMembers(members),
          confidence: level,
          score,
          reasons,
          members,
          suggestedKeepId: suggestKeeper(members),
          moneyAtRisk: absAmount(a.amount),
        });
      }
    }
  }

  groups.sort((x, y) => y.score - x.score);

  const stats = {
    scanned: rows.length,
    groupsFound: groups.length,
    veryHigh: groups.filter((g) => g.confidence === 'very_high').length,
    high: groups.filter((g) => g.confidence === 'high').length,
    medium: groups.filter((g) => g.confidence === 'medium').length,
    low: groups.filter((g) => g.confidence === 'low').length,
    moneyAtRisk: groups.reduce((s, g) => s + g.moneyAtRisk, 0),
    dateFrom,
    dateTo,
    mode,
  };

  return { groups, stats };
}

/** Prefer manual category, Revolut ledger for card spend, newer sync, lower id. */
function suggestKeeper(members) {
  const scored = members.map((m) => {
    let s = 0;
    if (m.category_source === 'manual') s += 30;
    if (m.notes) s += 5;
    if (m.tags?.length) s += 5;
    if (m.ledger === 'revolut' && parseFloat(m.amount) < 0) s += 15;
    if (m.sync_source === 'open_banking') s += 8;
    if (Math.abs(parseFloat(m.amount)) >= 0.01) s += 10;
    return { id: m.unified_id, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored[0]?.id ?? members[0]?.unified_id;
}

module.exports = {
  CONFIDENCE_LEVELS,
  scanDuplicateGroups,
  pairIgnoreKey,
  suggestKeeper,
};
