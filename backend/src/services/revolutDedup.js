/**
 * Revolut transaction deduplication across CSV and Open Banking imports.
 */

const crypto = require('crypto');

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function refKey(product, transferRef) {
  const ref = String(transferRef || '').trim();
  if (!ref) return null;
  return `${product || 'Revolut'}:${ref}`;
}

function contentKey(row) {
  const absAmount = Math.abs(parseFloat(row.amount));
  const rounded = Number.isFinite(absAmount) ? absAmount.toFixed(2) : String(row.amount ?? '');
  return `${row.date}|${rounded}|${normalizeText(row.description)}`;
}

/** Canonical fingerprint shared by Revolut CSV and Open Banking. */
function canonicalRevolutFingerprint(tx) {
  const product = tx.product || 'Revolut';
  const transferRef = tx.transfer_ref || tx.transferRef;
  if (transferRef) {
    const key = `revolut:ref:${product}:${String(transferRef).trim()}`;
    return crypto.createHash('sha256').update(key).digest('hex').slice(0, 32);
  }

  const completedDatetime = tx.completed_datetime || tx.completedDatetime || '';
  const key = [
    tx.revolut_type || tx.revolutType || '',
    completedDatetime,
    tx.description || '',
    String(tx.amount),
    String(tx.fee ?? 0),
    tx.currency || 'EUR',
    tx.state || 'COMPLETED',
  ].join('|');
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 32);
}

function collectRefKeys(tx) {
  const product = tx.product || 'Revolut';
  const keys = [];
  const rk = refKey(product, tx.transfer_ref || tx.transferRef);
  if (rk) keys.push(rk);
  return keys;
}

function loadRevolutDedupSets(db) {
  const fingerprints = new Set();
  const refKeys = new Set();
  const contentKeys = new Set();

  const rows = db.prepare(`
    SELECT fingerprint, product, transfer_ref, date, amount, description
    FROM revolut_transactions
  `).all();

  for (const row of rows) {
    if (row.fingerprint) fingerprints.add(row.fingerprint);
    for (const rk of collectRefKeys(row)) refKeys.add(rk);
    contentKeys.add(contentKey(row));
  }

  return { fingerprints, refKeys, contentKeys };
}

function isDuplicateRevolutTx(tx, sets) {
  if (sets.fingerprints.has(tx.fingerprint)) return true;
  for (const rk of collectRefKeys(tx)) {
    if (sets.refKeys.has(rk)) return true;
  }
  if (sets.contentKeys.has(contentKey(tx))) return true;
  return false;
}

function registerRevolutTx(tx, sets) {
  if (tx.fingerprint) sets.fingerprints.add(tx.fingerprint);
  for (const rk of collectRefKeys(tx)) sets.refKeys.add(rk);
  sets.contentKeys.add(contentKey(tx));
}

/**
 * Remove duplicate Revolut rows (keeps lowest id). Normalizes fingerprints on survivors.
 * @returns {{ removed: number, fingerprintsUpdated: number }}
 */
function dedupeRevolutTransactions(db) {
  const rows = db.prepare(`
    SELECT id, fingerprint, product, transfer_ref, date, amount, description,
           revolut_type, completed_datetime, fee, currency, state
    FROM revolut_transactions
    ORDER BY id ASC
  `).all();

  const seenContent = new Map();
  const seenRef = new Map();
  let removed = 0;
  let fingerprintsUpdated = 0;

  const deleteStmt = db.prepare('DELETE FROM revolut_transactions WHERE id = ?');
  const updateFpStmt = db.prepare('UPDATE revolut_transactions SET fingerprint = ? WHERE id = ?');
  const copyTagsStmt = db.prepare(`
    INSERT OR IGNORE INTO revolut_transaction_tags (revolut_transaction_id, tag_id)
    SELECT ?, tag_id FROM revolut_transaction_tags WHERE revolut_transaction_id = ?
  `);

  const run = db.transaction(() => {
    for (const row of rows) {
      const ck = contentKey(row);
      let keeperId = seenContent.get(ck) ?? null;

      if (!keeperId) {
        for (const rk of collectRefKeys(row)) {
          if (seenRef.has(rk)) {
            keeperId = seenRef.get(rk);
            break;
          }
        }
      }

      if (keeperId != null && keeperId !== row.id) {
        copyTagsStmt.run(keeperId, row.id);
        deleteStmt.run(row.id);
        removed++;
        continue;
      }

      seenContent.set(ck, row.id);
      for (const rk of collectRefKeys(row)) seenRef.set(rk, row.id);
    }

    const survivors = db.prepare(`
      SELECT id, fingerprint, product, transfer_ref, date, amount, description,
             revolut_type, completed_datetime, fee, currency, state
      FROM revolut_transactions
      ORDER BY id ASC
    `).all();

    for (const row of survivors) {
      const fp = canonicalRevolutFingerprint(row);
      if (row.fingerprint !== fp) {
        updateFpStmt.run(fp, row.id);
        fingerprintsUpdated++;
      }
    }
  });

  run();
  return { removed, fingerprintsUpdated };
}

module.exports = {
  canonicalRevolutFingerprint,
  contentKey,
  refKey,
  loadRevolutDedupSets,
  isDuplicateRevolutTx,
  registerRevolutTx,
  dedupeRevolutTransactions,
};
