/**
 * Fast duplicate detection for CSV imports (one query vs per-row SELECT).
 */

const ALLOWED_TABLES = new Set(['transactions', 'revolut_transactions', 'investment_transactions']);

function loadFingerprintSet(db, tableName) {
  if (!ALLOWED_TABLES.has(tableName)) {
    throw new Error(`Invalid fingerprint table: ${tableName}`);
  }
  const rows = db.prepare(`SELECT fingerprint FROM ${tableName}`).all();
  return new Set(rows.map((r) => r.fingerprint));
}

module.exports = { loadFingerprintSet };
