/**
 * Open banking sync orchestration — connections CRUD and transaction import.
 */

const { getDb } = require('../../db/database');
const { resolveImportCategory } = require('../manualCategoryLocks');
const {
  loadBankDedupSets,
  isDuplicateBankTx,
  registerBankTx,
} = require('../bankDedup');
const logger = require('../logger');
const { encrypt, decrypt } = require('./sessionCrypto');
const {
  authorizeSession,
  deleteSession,
  fetchAllTransactions,
  defaultValidUntil,
  reqMetaFromExpress,
} = require('./enableBankingClient');
const { normalizeTransactions } = require('./transactionNormalizer');
const { normalizeObToRevolutBatch } = require('./revolutObNormalizer');
const { importRevolutRows } = require('../revolutImporter');
const { applyAllRulesToExisting } = require('../categorizer');
const { reapplyManualCategoryLocks } = require('../manualCategoryLocks');
const { REDIRECT_URL } = require('./openBankingConfig');

const { refreshConnectionBalance, isRevolutConnection } = require('./connectionBalances');
const {
  removeBankRowsMatchingRevolutCharges,
} = require('../crossLedgerDedup');

function listConnections(db) {
  return db
    .prepare(
      `SELECT id, aspsp_name, aspsp_country, account_uid, account_iban, account_name,
              valid_until, last_sync_at, created_at,
              balance_amount, balance_currency, balance_as_of, balance_updated_at
       FROM bank_connections
       ORDER BY created_at DESC`,
    )
    .all();
}

function getConnection(db, id) {
  return db.prepare('SELECT * FROM bank_connections WHERE id = ?').get(id);
}

function saveConnectionsFromSession(db, sessionData, aspspName, aspspCountry) {
  const accounts = sessionData?.accounts || [];
  const sessionId = sessionData?.session_id;
  const validUntil = sessionData?.access?.valid_until || defaultValidUntil();
  const encryptedSession = encrypt(sessionId);

  const upsert = db.prepare(`
    INSERT INTO bank_connections
      (aspsp_name, aspsp_country, account_uid, account_iban, account_name, session_id, valid_until)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(aspsp_name, aspsp_country, account_uid) DO UPDATE SET
      account_iban = excluded.account_iban,
      account_name = excluded.account_name,
      session_id = excluded.session_id,
      valid_until = excluded.valid_until
  `);

  const saved = [];
  for (const acct of accounts) {
    const uid = acct.uid;
    if (!uid) continue;
    const iban = acct.account_id?.iban || acct.iban || null;
    const name = acct.name || acct.details || iban || uid;
    upsert.run(aspspName, aspspCountry, uid, iban, name, encryptedSession, validUntil);
    const row = db
      .prepare(
        'SELECT id, aspsp_name, aspsp_country, account_uid, account_iban, account_name, valid_until, last_sync_at, created_at FROM bank_connections WHERE aspsp_name = ? AND aspsp_country = ? AND account_uid = ?',
      )
      .get(aspspName, aspspCountry, uid);
    if (row) saved.push(row);
  }
  return saved;
}

async function completeAuthorization(code, pending, reqMeta) {
  const sessionData = await authorizeSession(code, reqMeta);
  const aspsp = sessionData?.aspsp || {};
  const aspspName = pending?.aspspName || aspsp.name;
  const aspspCountry = pending?.aspspCountry || aspsp.country;
  return { sessionData, aspspName, aspspCountry };
}

function isoDateOnly(d) {
  return d.toISOString().slice(0, 10);
}

function syncDateFrom(connection) {
  if (connection.last_sync_at) {
    const d = new Date(connection.last_sync_at);
    if (!Number.isNaN(d.getTime())) {
      d.setDate(d.getDate() - 1);
      return isoDateOnly(d);
    }
  }
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return isoDateOnly(d);
}

function importTransactions(db, transactions, label) {
  const existing = loadBankDedupSets(db);
  let importedCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  const insertTx = db.prepare(`
    INSERT OR IGNORE INTO transactions
      (fingerprint, account, date, beneficiary, merchant, details,
       amount, currency, direction, transfer_ref, transaction_type,
       reference_number, document_number, category_id, category_source)
    VALUES
      (@fingerprint, @account, @date, @beneficiary, @merchant, @details,
       @amount, @currency, @direction, @transferRef, @transactionType,
       @referenceNumber, @documentNumber, @categoryId, @categorySource)
  `);

  const doImport = db.transaction(() => {
    for (const tx of transactions) {
      try {
        if (isDuplicateBankTx(tx, existing)) {
          duplicateCount++;
          continue;
        }
        const catResult = resolveImportCategory(db, 'bank', tx);
        const result = insertTx.run({
          ...tx,
          categoryId: catResult.categoryId,
          categorySource: catResult.source,
        });
        if (result.changes > 0) {
          importedCount++;
          registerBankTx(tx, existing);
        } else {
          duplicateCount++;
        }
      } catch (err) {
        logger.error('[OpenBanking] Import row failed', { err: err.message, tx });
        errorCount++;
      }
    }
  });

  doImport();

  let rulesRecategorized = 0;
  let manualCategoriesRestored = 0;
  try {
    const rulesApplied = applyAllRulesToExisting();
    rulesRecategorized = rulesApplied.updated || 0;
    const manualRestored = reapplyManualCategoryLocks(db);
    manualCategoriesRestored = manualRestored.bankUpdated + manualRestored.revolutUpdated;
  } catch (err) {
    logger.warn('[OpenBanking] Post-import categorization failed', { err: err.message });
  }

  const dates = transactions.map((t) => t.date).filter(Boolean).sort();
  const sessionId = db.prepare(`
    INSERT INTO import_sessions
      (filename, imported_count, duplicate_count, skipped_count, error_count, account, date_from, date_to)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    label,
    importedCount,
    duplicateCount,
    0,
    errorCount,
    transactions[0]?.account || null,
    dates[0] || null,
    dates[dates.length - 1] || null,
  ).lastInsertRowid;

  return {
    sessionId,
    importedCount,
    duplicateCount,
    errorCount,
    rulesRecategorized,
    manualCategoriesRestored,
  };
}

function collectBankRefValues(transactions) {
  const refs = new Set();
  for (const tx of transactions || []) {
    for (const field of [
      tx.transferRef,
      tx.transfer_ref,
      tx.referenceNumber,
      tx.reference_number,
      tx.document_number,
      tx.archiveId,
      tx.documentNo,
    ]) {
      if (field) refs.add(String(field).trim());
    }
  }
  return [...refs];
}

function removeLegacyBankRowsByTransferRef(db, transactionsOrRefs) {
  const refs = Array.isArray(transactionsOrRefs)
    ? collectBankRefValues(transactionsOrRefs)
    : [...new Set((transactionsOrRefs || []).filter(Boolean))];
  if (!refs.length) return 0;
  const placeholders = refs.map(() => '?').join(',');
  return db.prepare(
    `DELETE FROM transactions
     WHERE transfer_ref IN (${placeholders})
        OR reference_number IN (${placeholders})
        OR document_number IN (${placeholders})`,
  ).run(...refs, ...refs, ...refs).changes;
}

function importRevolutObTransactions(db, transactions, label, product) {
  const removedByRef = removeLegacyBankRowsByTransferRef(db, transactions);
  const removedByMatch = removeBankRowsMatchingRevolutCharges(db, transactions);
  const removedBankRows = removedByRef + removedByMatch;

  const dates = transactions.map((t) => t.date).filter(Boolean).sort();
  const { sessionId, importedCount, duplicateCount } = importRevolutRows(db, transactions, {
    filename: label,
    importSource: 'open_banking',
    product,
    dateFrom: dates[0] || null,
    dateTo: dates[dates.length - 1] || null,
    skippedCount: 0,
  });

  let rulesRecategorized = 0;
  let manualCategoriesRestored = 0;
  try {
    const rulesApplied = applyAllRulesToExisting();
    rulesRecategorized = rulesApplied.updated || 0;
    const manualRestored = reapplyManualCategoryLocks(db);
    manualCategoriesRestored = manualRestored.bankUpdated + manualRestored.revolutUpdated;
  } catch (err) {
    logger.warn('[OpenBanking] Post-import categorization failed', { err: err.message });
  }

  return {
    sessionId,
    importedCount,
    duplicateCount,
    errorCount: 0,
    removedBankRows,
    rulesRecategorized,
    manualCategoriesRestored,
    ledger: 'revolut',
  };
}

async function syncConnection(db, connection, reqMeta) {
  const sessionId = decrypt(connection.session_id);
  if (!sessionId) {
    const err = new Error('Stored session is invalid — reconnect the bank');
    err.code = 'SESSION_INVALID';
    throw err;
  }

  if (connection.valid_until && Date.parse(connection.valid_until) < Date.now()) {
    const err = new Error('Bank connection expired — reconnect to continue syncing');
    err.code = 'SESSION_EXPIRED';
    throw err;
  }

  const dateFrom = syncDateFrom(connection);
  const dateTo = isoDateOnly(new Date());

  const rawTxs = await fetchAllTransactions(
    connection.account_uid,
    { dateFrom, dateTo },
    reqMeta,
  );

  const label = `open-banking:${connection.aspsp_name}:${connection.account_iban || connection.account_uid}`;
  let result = {};
  let importError = null;

  try {
    if (isRevolutConnection(connection)) {
      const { transactions, errors } = normalizeObToRevolutBatch(
        rawTxs,
        connection.account_iban,
        db,
      );
      result = importRevolutObTransactions(
        db,
        transactions,
        label,
        connection.account_iban || connection.account_uid,
      );
      result.parseErrors = errors.length;
    } else {
      const { transactions, errors } = normalizeTransactions(rawTxs, connection.account_iban);
      result = importTransactions(db, transactions, label);
      result.parseErrors = errors.length;
      result.ledger = 'bank';
    }

    db.prepare(
      `UPDATE bank_connections SET last_sync_at = datetime('now') WHERE id = ?`,
    ).run(connection.id);
  } catch (err) {
    importError = err;
    logger.error('[OpenBanking] Transaction import failed', {
      connectionId: connection.id,
      err: err.message,
    });
  }

  let balance = null;
  try {
    balance = await refreshConnectionBalance(db, getConnection(db, connection.id), reqMeta);
  } catch (err) {
    logger.warn('[OpenBanking] Balance refresh failed', {
      connectionId: connection.id,
      err: err.message,
    });
  }

  if (importError) throw importError;

  return {
    connectionId: connection.id,
    accountIban: connection.account_iban,
    fetched: rawTxs.length,
    balanceAmount: balance?.amount ?? null,
    balanceCurrency: balance?.currency ?? null,
    balanceAsOf: balance?.asOf ?? null,
    balanceType: balance?.balanceType ?? null,
    ...result,
  };
}

async function syncConnections(db, { connectionId } = {}, req) {
  const reqMeta = reqMetaFromExpress(req);
  const results = [];

  if (connectionId) {
    const conn = getConnection(db, connectionId);
    if (!conn) {
      const err = new Error('Connection not found');
      err.status = 404;
      throw err;
    }
    results.push(await syncConnection(db, conn, reqMeta));
    return { results };
  }

  const connections = db.prepare('SELECT * FROM bank_connections').all();
  for (const conn of connections) {
    try {
      results.push(await syncConnection(db, conn, reqMeta));
    } catch (err) {
      results.push({
        connectionId: conn.id,
        accountIban: conn.account_iban,
        error: err.message,
        code: err.code,
      });
    }
  }
  return { results };
}

async function disconnectConnection(db, connectionId, req) {
  const conn = getConnection(db, connectionId);
  if (!conn) {
    const err = new Error('Connection not found');
    err.status = 404;
    throw err;
  }

  const sessionId = decrypt(conn.session_id);
  if (sessionId) {
    try {
      await deleteSession(sessionId, reqMetaFromExpress(req));
    } catch (err) {
      logger.warn('[OpenBanking] Remote session delete failed', { err: err.message });
    }
  }

  db.prepare('DELETE FROM bank_connections WHERE id = ?').run(connectionId);
  return { ok: true };
}

module.exports = {
  listConnections,
  getConnection,
  saveConnectionsFromSession,
  completeAuthorization,
  syncConnections,
  disconnectConnection,
  REDIRECT_URL,
  isRevolutConnection,
};
