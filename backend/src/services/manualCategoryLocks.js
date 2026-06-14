/**
 * Permanent manual category assignments — survive re-import, sync, and rule re-apply.
 * Keys: bank fingerprint, revolut fingerprint, and shared transfer_ref.
 *
 * Note: do not import categorizer at top level (circular dependency).
 */

const PREFIX = {
  BANK_FP: 'fp:bank:',
  REVOLUT_FP: 'fp:revolut:',
  TRANSFER_REF: 'ref:',
};

function keysFromBankRow(row) {
  const keys = [];
  if (row?.fingerprint) keys.push(PREFIX.BANK_FP + row.fingerprint);
  if (row?.transfer_ref) keys.push(PREFIX.TRANSFER_REF + row.transfer_ref);
  return keys;
}

function keysFromRevolutRow(row) {
  const keys = [];
  if (row?.fingerprint) keys.push(PREFIX.REVOLUT_FP + row.fingerprint);
  if (row?.transfer_ref) keys.push(PREFIX.TRANSFER_REF + row.transfer_ref);
  return keys;
}

function keysForImport(ledger, { fingerprint, transferRef, transfer_ref } = {}) {
  const ref = transferRef || transfer_ref;
  const keys = [];
  if (ledger === 'bank' && fingerprint) keys.push(PREFIX.BANK_FP + fingerprint);
  if (ledger === 'revolut' && fingerprint) keys.push(PREFIX.REVOLUT_FP + fingerprint);
  if (ref) keys.push(PREFIX.TRANSFER_REF + ref);
  return keys;
}

function recordManualCategoryLocks(db, keys, categoryId) {
  if (!categoryId || !keys?.length) return 0;
  const upsert = db.prepare(`
    INSERT INTO manual_category_locks (key, category_id, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      category_id = excluded.category_id,
      updated_at = datetime('now')
  `);
  let n = 0;
  for (const key of keys) {
    if (!key) continue;
    upsert.run(key, categoryId);
    n += 1;
  }
  return n;
}

function resolveCategoryFromLocks(db, keys) {
  if (!keys?.length) return null;
  const placeholders = keys.map(() => '?').join(',');
  const row = db.prepare(
    `SELECT category_id FROM manual_category_locks WHERE key IN (${placeholders}) LIMIT 1`,
  ).get(...keys);
  return row?.category_id ?? null;
}

function hasManualCategoryLock(db, keys) {
  return resolveCategoryFromLocks(db, keys) != null;
}

function recordManualCategoryForBankRow(db, row, categoryId) {
  return recordManualCategoryLocks(db, keysFromBankRow(row), categoryId);
}

function recordManualCategoryForRevolutRow(db, row, categoryId) {
  return recordManualCategoryLocks(db, keysFromRevolutRow(row), categoryId);
}

/**
 * Import-time category: manual lock wins over rules and auto.
 */
function resolveImportCategory(db, ledger, tx) {
  const keys = keysForImport(ledger, tx);
  const locked = resolveCategoryFromLocks(db, keys);
  if (locked != null) {
    return { categoryId: locked, source: 'manual' };
  }

  if (ledger === 'revolut') {
    const desc = tx.description || '';
    const { categorizeTransaction } = require('./categorizer');
    return categorizeTransaction({
      merchant: desc,
      beneficiary: desc,
      details: desc,
    });
  }

  const { categorizeTransaction } = require('./categorizer');
  return categorizeTransaction(tx);
}

/** Apply stored locks onto current transaction rows (after import or rule re-apply). */
function reapplyManualCategoryLocks(db) {
  const locks = db.prepare('SELECT key, category_id FROM manual_category_locks').all();
  let bankUpdated = 0;
  let revolutUpdated = 0;

  const updateBank = db.prepare(
    `UPDATE transactions SET category_id = ?, category_source = 'manual' WHERE fingerprint = ?`,
  );
  const updateBankRef = db.prepare(
    `UPDATE transactions SET category_id = ?, category_source = 'manual' WHERE transfer_ref = ?`,
  );
  const updateRev = db.prepare(
    `UPDATE revolut_transactions SET category_id = ?, category_source = 'manual' WHERE fingerprint = ?`,
  );
  const updateRevRef = db.prepare(
    `UPDATE revolut_transactions SET category_id = ?, category_source = 'manual' WHERE transfer_ref = ?`,
  );

  const run = db.transaction(() => {
    for (const lock of locks) {
      const { key, category_id } = lock;
      if (key.startsWith(PREFIX.BANK_FP)) {
        bankUpdated += updateBank.run(category_id, key.slice(PREFIX.BANK_FP.length)).changes;
      } else if (key.startsWith(PREFIX.REVOLUT_FP)) {
        revolutUpdated += updateRev.run(category_id, key.slice(PREFIX.REVOLUT_FP.length)).changes;
      } else if (key.startsWith(PREFIX.TRANSFER_REF)) {
        const ref = key.slice(PREFIX.TRANSFER_REF.length);
        bankUpdated += updateBankRef.run(category_id, ref).changes;
        revolutUpdated += updateRevRef.run(category_id, ref).changes;
      }
    }
  });
  run();
  return { bankUpdated, revolutUpdated };
}

function backfillManualLocksFromRows(db) {
  const bankRows = db.prepare(
    `SELECT fingerprint, transfer_ref, category_id FROM transactions WHERE category_source = 'manual'`,
  ).all();
  const revRows = db.prepare(
    `SELECT fingerprint, transfer_ref, category_id FROM revolut_transactions WHERE category_source = 'manual'`,
  ).all();

  let keysWritten = 0;
  const run = db.transaction(() => {
    for (const row of bankRows) {
      keysWritten += recordManualCategoryForBankRow(db, row, row.category_id);
    }
    for (const row of revRows) {
      keysWritten += recordManualCategoryForRevolutRow(db, row, row.category_id);
    }
  });
  run();
  return { bankRows: bankRows.length, revolutRows: revRows.length, keysWritten };
}

module.exports = {
  PREFIX,
  keysFromBankRow,
  keysFromRevolutRow,
  keysForImport,
  recordManualCategoryLocks,
  recordManualCategoryForBankRow,
  recordManualCategoryForRevolutRow,
  resolveCategoryFromLocks,
  hasManualCategoryLock,
  resolveImportCategory,
  reapplyManualCategoryLocks,
  backfillManualLocksFromRows,
};
