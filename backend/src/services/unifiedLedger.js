/**
 * Unified bank + Revolut ledger for lists and analytics.
 * Analytics use effective_amount (Revolut shared expenses at 50%).
 */

const { getDb } = require('../db/database');
const { sanitizeDateParam } = require('../utils/dateParams');

/** Core UNION — all rows; filter exclude_from_analytics in analytics queries */
const UNIFIED_LEDGER_SQL = `
  SELECT
    'bank' AS source,
    t.id AS id,
    t.id AS bank_id,
    NULL AS revolut_id,
    t.date AS date,
    t.amount AS amount,
    t.amount AS effective_amount,
    NULL AS split_ratio,
    0 AS exclude_from_analytics,
    0 AS applies_shared_split,
    t.direction AS direction,
    COALESCE(NULLIF(TRIM(t.merchant), ''), t.beneficiary, '') AS merchant,
    t.beneficiary AS beneficiary,
    t.details AS details,
    t.currency AS currency,
    t.category_id AS category_id,
    t.notes AS notes,
    t.transfer_ref AS transfer_ref,
    t.transaction_type AS transaction_type,
    NULL AS revolut_type,
    NULL AS product
  FROM transactions t

  UNION ALL

  SELECT
    'revolut' AS source,
    ('r' || r.id) AS id,
    NULL AS bank_id,
    r.id AS revolut_id,
    r.date AS date,
    r.amount AS amount,
    COALESCE(r.effective_amount, r.amount) AS effective_amount,
    r.split_ratio AS split_ratio,
    COALESCE(r.exclude_from_analytics, 0) AS exclude_from_analytics,
    COALESCE(r.applies_shared_split, 0) AS applies_shared_split,
    CASE WHEN r.amount >= 0 THEN 'K' ELSE 'D' END AS direction,
    COALESCE(r.description, '') AS merchant,
    NULL AS beneficiary,
    r.description AS details,
    r.currency AS currency,
    COALESCE(
      r.category_id,
      (SELECT id FROM categories WHERE is_default = 1 LIMIT 1)
    ) AS category_id,
    r.notes AS notes,
    r.transfer_ref AS transfer_ref,
    r.revolut_type AS transaction_type,
    r.revolut_type AS revolut_type,
    r.product AS product
  FROM revolut_transactions r
`;

const ANALYTICS_LEDGER_SQL = `
  SELECT * FROM (${UNIFIED_LEDGER_SQL}) unified
  WHERE exclude_from_analytics = 0
`;

function wherePeriodUnified(dateFrom, dateTo, alias = 'u') {
  const from = sanitizeDateParam(dateFrom, 'dateFrom');
  const to = sanitizeDateParam(dateTo, 'dateTo');
  const parts = [];
  const col = `${alias}.date`;
  if (from) parts.push(`${col} >= '${from}'`);
  if (to) parts.push(`${col} <= '${to}'`);
  return parts.length ? `AND ${parts.join(' AND ')}` : '';
}

/**
 * List unified transactions with filters (includes funding rows for UI).
 */
function listUnifiedTransactions(options = {}) {
  const db = getDb();
  const {
    page = 1,
    limit = 50,
    search = '',
    category = '',
    direction = '',
    source = '',
    dateFrom = '',
    dateTo = '',
    tag = '',
    hasNotes = '',
    sortBy = 'date',
    sortDir = 'DESC',
  } = options;

  const conditions = [];
  const params = [];

  if (search) {
    conditions.push(
      `(u.merchant LIKE ? OR u.beneficiary LIKE ? OR u.details LIKE ? OR IFNULL(u.notes,'') LIKE ? OR u.product LIKE ?)`
    );
    const s = `%${search}%`;
    params.push(s, s, s, s, s);
  }
  if (category) {
    conditions.push('u.category_id = ?');
    params.push(parseInt(category, 10));
  }
  if (direction) {
    conditions.push('u.direction = ?');
    params.push(direction.toUpperCase());
  }
  if (source === 'bank' || source === 'revolut') {
    conditions.push('u.source = ?');
    params.push(source);
  }
  if (dateFrom) {
    conditions.push('u.date >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push('u.date <= ?');
    params.push(dateTo);
  }
  if (hasNotes === '1' || hasNotes === true) {
    conditions.push("(u.notes IS NOT NULL AND TRIM(u.notes) != '')");
  }
  if (tag) {
    const tagId = parseInt(tag, 10);
    conditions.push(`(
      (u.source = 'bank' AND EXISTS (
        SELECT 1 FROM transaction_tags tt WHERE tt.transaction_id = u.bank_id AND tt.tag_id = ?
      ))
      OR (u.source = 'revolut' AND EXISTS (
        SELECT 1 FROM revolut_transaction_tags rt WHERE rt.revolut_transaction_id = u.revolut_id AND rt.tag_id = ?
      ))
    )`);
    params.push(tagId, tagId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const allowedSort = ['date', 'amount', 'merchant', 'category_id', 'effective_amount'];
  const col = allowedSort.includes(sortBy) ? `u.${sortBy}` : 'u.date';
  const dir = String(sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const countRow = db
    .prepare(`SELECT COUNT(*) AS total FROM (${UNIFIED_LEDGER_SQL}) u ${where}`)
    .get(...params);

  const rows = db
    .prepare(
      `SELECT u.* FROM (${UNIFIED_LEDGER_SQL}) u
       ${where}
       ORDER BY ${col} ${dir}, u.source DESC, u.bank_id DESC, u.revolut_id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, parseInt(limit, 10), offset);

  const bankTagStmt = db.prepare(
    `SELECT tg.* FROM tags tg JOIN transaction_tags tt ON tt.tag_id = tg.id WHERE tt.transaction_id = ? ORDER BY tg.name`
  );
  const revTagStmt = db.prepare(
    `SELECT tg.* FROM tags tg JOIN revolut_transaction_tags rt ON rt.tag_id = tg.id WHERE rt.revolut_transaction_id = ? ORDER BY tg.name`
  );
  const catStmt = db.prepare('SELECT name, icon, color FROM categories WHERE id = ?');

  const data = rows.map((r) => {
    const tags =
      r.source === 'bank'
        ? bankTagStmt.all(r.bank_id)
        : revTagStmt.all(r.revolut_id);
    const cat = r.category_id ? catStmt.get(r.category_id) : null;
    return {
      ...r,
      category_name: cat?.name ?? null,
      category_icon: cat?.icon ?? null,
      category_color: cat?.color ?? null,
      tags,
    };
  });

  return {
    data,
    total: countRow.total,
    page: parseInt(page, 10),
    totalPages: Math.ceil(countRow.total / parseInt(limit, 10)),
  };
}

module.exports = {
  UNIFIED_LEDGER_SQL,
  ANALYTICS_LEDGER_SQL,
  wherePeriodUnified,
  listUnifiedTransactions,
};
