/**
 * Investment transaction deduplication.
 * Lightyear (and Swedbank) rows have stable broker reference IDs — dedupe by reference
 * as well as fingerprint so re-imports after fingerprint algorithm changes stay safe.
 */

const crypto = require('crypto');

function refKey(broker, reference) {
  const ref = String(reference || '').trim();
  if (!ref) return null;
  return `${broker}:${ref}`;
}

/** Canonical fingerprint: broker + reference when reference exists. */
function canonicalFingerprint(broker, reference, datetime, amount, type, ticker) {
  const key = refKey(broker, reference);
  if (key) {
    return crypto.createHash('sha256').update(key).digest('hex').slice(0, 32);
  }
  return crypto
    .createHash('sha256')
    .update(`${broker}:${datetime}:${amount}:${type}:${ticker ?? ''}`)
    .digest('hex')
    .slice(0, 32);
}

function loadInvestmentDedupSets(db) {
  const fingerprints = new Set();
  const references = new Set();

  const rows = db
    .prepare(
      `SELECT broker, reference, fingerprint FROM investment_transactions
       WHERE fingerprint IS NOT NULL`
    )
    .all();

  for (const r of rows) {
    if (r.fingerprint) fingerprints.add(r.fingerprint);
    const rk = refKey(r.broker, r.reference);
    if (rk) references.add(rk);
  }

  return { fingerprints, references };
}

function isDuplicateInvestmentTx(tx, sets) {
  if (sets.fingerprints.has(tx.fingerprint)) return true;
  const rk = refKey(tx.broker, tx.reference);
  if (rk && sets.references.has(rk)) return true;
  return false;
}

/**
 * Remove duplicate rows sharing the same broker+reference (keeps lowest id).
 * Normalizes fingerprints to canonical broker:reference form.
 * @returns {{ removed: number, fingerprintsUpdated: number }}
 */
function dedupeInvestmentTransactionsByReference(db) {
  const rows = db
    .prepare(
      `SELECT id, broker, reference, fingerprint
       FROM investment_transactions
       WHERE reference IS NOT NULL AND TRIM(reference) != ''
       ORDER BY id ASC`
    )
    .all();

  const seen = new Map();
  let removed = 0;
  let fingerprintsUpdated = 0;

  const deleteStmt = db.prepare('DELETE FROM investment_transactions WHERE id = ?');
  const updateFpStmt = db.prepare('UPDATE investment_transactions SET fingerprint = ? WHERE id = ?');

  const run = db.transaction(() => {
    // Pass 1: drop duplicate broker+reference rows (keep earliest id)
    for (const row of rows) {
      const rk = refKey(row.broker, row.reference);
      if (!rk) continue;
      if (seen.has(rk)) {
        deleteStmt.run(row.id);
        removed++;
      } else {
        seen.set(rk, row.id);
      }
    }

    // Pass 2: normalize fingerprints on survivors (safe after duplicates removed)
    for (const [rk, id] of seen) {
      const [broker, reference] = rk.split(/:(.+)/);
      const fp = canonicalFingerprint(broker, reference);
      const row = db.prepare('SELECT fingerprint FROM investment_transactions WHERE id = ?').get(id);
      if (row && row.fingerprint !== fp) {
        updateFpStmt.run(fp, id);
        fingerprintsUpdated++;
      }
    }
  });

  run();
  return { removed, fingerprintsUpdated };
}

module.exports = {
  refKey,
  canonicalFingerprint,
  loadInvestmentDedupSets,
  isDuplicateInvestmentTx,
  dedupeInvestmentTransactionsByReference,
};
