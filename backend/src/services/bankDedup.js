/**
 * Bank transaction deduplication across CSV (LHV/SEB) and Open Banking imports.
 * Fingerprints alone are insufficient when import paths use different key schemes.
 */

const crypto = require('crypto');

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function refKey(account, ref) {
  const key = String(ref || '').trim();
  if (!key) return null;
  return `${account || ''}:${key}`;
}

function contentKey(row) {
  const absAmount = Math.abs(parseFloat(row.amount));
  const rounded = Number.isFinite(absAmount) ? absAmount.toFixed(2) : String(row.amount ?? '');
  return `${row.date}|${rounded}|${row.direction || ''}|${normalizeText(row.beneficiary)}`;
}

function pickBankRef(tx) {
  return tx.transferRef
    || tx.transfer_ref
    || tx.archiveId
    || tx.documentNo
    || tx.referenceNumber
    || tx.reference_number
    || tx.document_number
    || null;
}

/** Canonical fingerprint shared by LHV CSV, SEB CSV, and Open Banking. */
function canonicalBankFingerprint(tx) {
  const account = tx.account || '';
  const ref = pickBankRef(tx);
  const key = ref
    ? `bank:ref:${account}:${String(ref).trim()}`
    : `bank:tx:${tx.date}:${Math.abs(parseFloat(tx.amount))}:${tx.direction}:${normalizeText(tx.beneficiary)}`;
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 32);
}

function collectRefKeys(tx) {
  const account = tx.account || '';
  const keys = [];
  for (const field of [
    tx.transferRef,
    tx.transfer_ref,
    tx.archiveId,
    tx.documentNo,
    tx.referenceNumber,
    tx.reference_number,
    tx.document_number,
  ]) {
    const rk = refKey(account, field);
    if (rk) keys.push(rk);
  }
  return keys;
}

function loadBankDedupSets(db) {
  const fingerprints = new Set();
  const refKeys = new Set();
  const contentKeys = new Set();

  const rows = db.prepare(`
    SELECT fingerprint, account, transfer_ref, reference_number, document_number,
           date, amount, direction, beneficiary
    FROM transactions
  `).all();

  for (const row of rows) {
    if (row.fingerprint) fingerprints.add(row.fingerprint);
    for (const rk of collectRefKeys(row)) refKeys.add(rk);
    contentKeys.add(contentKey(row));
  }

  return { fingerprints, refKeys, contentKeys };
}

function isDuplicateBankTx(tx, sets) {
  if (sets.fingerprints.has(tx.fingerprint)) return true;
  for (const rk of collectRefKeys(tx)) {
    if (sets.refKeys.has(rk)) return true;
  }
  if (sets.contentKeys.has(contentKey(tx))) return true;
  return false;
}

function registerBankTx(tx, sets) {
  if (tx.fingerprint) sets.fingerprints.add(tx.fingerprint);
  for (const rk of collectRefKeys(tx)) sets.refKeys.add(rk);
  sets.contentKeys.add(contentKey(tx));
}

/**
 * Remove duplicate bank rows (keeps lowest id). Normalizes fingerprints on survivors.
 * @returns {{ removed: number, fingerprintsUpdated: number }}
 */
function dedupeBankTransactions(db) {
  const rows = db.prepare(`
    SELECT id, fingerprint, account, transfer_ref, reference_number, document_number,
           date, amount, direction, beneficiary
    FROM transactions
    ORDER BY id ASC
  `).all();

  const seenContent = new Map();
  const seenRef = new Map();
  let removed = 0;
  let fingerprintsUpdated = 0;

  const deleteStmt = db.prepare('DELETE FROM transactions WHERE id = ?');
  const updateFpStmt = db.prepare('UPDATE transactions SET fingerprint = ? WHERE id = ?');
  const copyTagsStmt = db.prepare(`
    INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id)
    SELECT ?, tag_id FROM transaction_tags WHERE transaction_id = ?
  `);

  const run = db.transaction(() => {
    for (const row of rows) {
      const ck = contentKey(row);
      let keeperId = seenContent.get(ck) ?? null;

      if (!keeperId) {
        for (const field of [row.transfer_ref, row.reference_number, row.document_number]) {
          const rk = refKey(row.account, field);
          if (rk && seenRef.has(rk)) {
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
      for (const field of [row.transfer_ref, row.reference_number, row.document_number]) {
        const rk = refKey(row.account, field);
        if (rk) seenRef.set(rk, row.id);
      }
    }

    const survivors = db.prepare(`
      SELECT id, fingerprint, account, transfer_ref, reference_number, document_number,
             date, amount, direction, beneficiary
      FROM transactions
      ORDER BY id ASC
    `).all();

    for (const row of survivors) {
      const fp = canonicalBankFingerprint(row);
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
  canonicalBankFingerprint,
  contentKey,
  refKey,
  loadBankDedupSets,
  isDuplicateBankTx,
  registerBankTx,
  dedupeBankTransactions,
};
