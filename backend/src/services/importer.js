/**
 * Import pipeline: parse CSV → deduplicate → categorize → insert into DB.
 */

const { getDb } = require('../db/database');
const { parseBankCSV } = require('./bankCsvParser');
const { isRevolutCSV } = require('./revolutParser');
const { categorizeTransaction } = require('./categorizer');
const { loadFingerprintSet } = require('./importDedup');
const logger = require('./logger');

const PREVIEW_ROW_LIMIT = 100;

/**
 * Preview a CSV buffer: parse and check duplicates without writing to DB.
 * Returns full preview data including duplicate detection results.
 */
function previewImport(buffer, filename) {
  if (isRevolutCSV(buffer)) {
    const err = new Error(
      'This file is a Revolut statement. Import it from Transactions → Import / Export (Revolut CSV).'
    );
    err.code = 'REVOLUT_USE_DEDICATED';
    throw err;
  }

  const { transactions, errors, summary, openingBalance, closingBalance } = parseBankCSV(buffer);
  const db = getDb();
  const existing = loadFingerprintSet(db, 'transactions');

  let newCount = 0;
  let dupCount = 0;

  const previewed = transactions.map((tx) => {
    const isDuplicate = existing.has(tx.fingerprint);
    if (isDuplicate) dupCount++;
    else newCount++;

    const catResult = isDuplicate
      ? { categoryName: null, categoryId: null }
      : categorizeTransaction(tx);

    return {
      ...tx,
      isDuplicate,
      suggestedCategory: catResult.categoryName,
      suggestedCategoryId: catResult.categoryId,
    };
  });

  return {
    filename,
    preview: previewed.slice(0, PREVIEW_ROW_LIMIT),
    previewTruncated: previewed.length > PREVIEW_ROW_LIMIT,
    totalRows: previewed.length,
    errors,
    openingBalance,
    closingBalance,
    summary: {
      ...summary,
      newCount,
      duplicateCount: dupCount,
    },
  };
}

/**
 * Commit an import: insert only new (non-duplicate) transactions.
 * Returns import session summary.
 */
function commitImport(buffer, filename) {
  if (isRevolutCSV(buffer)) {
    const err = new Error(
      'This file is a Revolut statement. Import it from the Revolut page, not the bank import.'
    );
    err.code = 'REVOLUT_USE_DEDICATED';
    throw err;
  }

  const { transactions, errors, summary, openingBalance, closingBalance } = parseBankCSV(buffer);
  const db = getDb();

  let importedCount  = 0;
  let duplicateCount = 0;
  let errorCount     = errors.length;

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
        const catResult = categorizeTransaction(tx);

        const result = insertTx.run({
          ...tx,
          categoryId: catResult.categoryId,
          categorySource: catResult.source,
        });

        if (result.changes > 0) importedCount++;
        else duplicateCount++;
      } catch (err) {
        logger.error(`[Import] Failed row: ${err.message}`, { tx });
        errorCount++;
      }
    }
  });

  doImport();

  // Record the import session
  const sessionId = db.prepare(`
    INSERT INTO import_sessions
      (filename, imported_count, duplicate_count, skipped_count, error_count, account, date_from, date_to)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    filename,
    importedCount,
    duplicateCount,
    0,
    errorCount,
    summary.account,
    summary.dateFrom,
    summary.dateTo,
  ).lastInsertRowid;

  // Store opening and closing balances extracted from the CSV
  const storeBalance = db.prepare(`
    INSERT INTO account_balances (account, balance_type, amount, currency, balance_date, import_session_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  if (openingBalance?.date) {
    storeBalance.run(
      openingBalance.account, 'opening', openingBalance.amount,
      openingBalance.currency, openingBalance.date, sessionId
    );
  }
  if (closingBalance?.date) {
    storeBalance.run(
      closingBalance.account, 'closing', closingBalance.amount,
      closingBalance.currency, closingBalance.date, sessionId
    );
  }

  logger.info(`[Import] ${filename}: +${importedCount} new, ${duplicateCount} dupes, ${errorCount} errors`);

  return {
    sessionId,
    filename,
    importedCount,
    duplicateCount,
    errorCount,
    summary,
  };
}

module.exports = { previewImport, commitImport };
