/**
 * Preview / commit Revolut CSV into revolut_transactions (isolated from main transactions).
 */

const { getDb } = require('../db/database');
const { parseRevolutCSV } = require('./revolutParser');
const { categorizeTransaction } = require('./categorizer');
const { loadFingerprintSet } = require('./importDedup');
const logger = require('./logger');

const PREVIEW_ROW_LIMIT = 100;

function previewRevolutImport(buffer, filename) {
  const { transactions, skipped, summary } = parseRevolutCSV(buffer);
  const db = getDb();
  const existing = loadFingerprintSet(db, 'revolut_transactions');

  let newCount = 0;
  let dupCount = 0;

  const previewed = transactions.map((tx) => {
    const isDuplicate = existing.has(tx.fingerprint);
    if (isDuplicate) dupCount++;
    else newCount++;

    const catResult = isDuplicate
      ? { categoryName: null, categoryId: null }
      : categorizeTransaction({
          merchant: tx.description,
          beneficiary: '',
          details: tx.description,
        });

    return {
      ...tx,
      isDuplicate,
      suggestedCategory: catResult.categoryName,
      suggestedCategoryId: catResult.categoryId,
    };
  });

  return {
    filename,
    source: 'revolut',
    preview: previewed.slice(0, PREVIEW_ROW_LIMIT),
    previewTruncated: previewed.length > PREVIEW_ROW_LIMIT,
    totalRows: previewed.length,
    skipped,
    summary: {
      ...summary,
      newCount,
      duplicateCount: dupCount,
      filename,
    },
  };
}

function commitRevolutImport(buffer, filename) {
  const { transactions, skipped, summary } = parseRevolutCSV(buffer);
  const db = getDb();

  let importedCount = 0;
  let duplicateCount = 0;

  const insertSession = db.prepare(`
    INSERT INTO revolut_import_sessions
      (filename, import_source, imported_count, duplicate_count, skipped_count, product, date_from, date_to)
    VALUES (@filename, 'revolut_csv', @imported_count, @duplicate_count, @skipped_count, @product, @date_from, @date_to)
  `);

  const insertTx = db.prepare(`
    INSERT OR IGNORE INTO revolut_transactions (
      fingerprint, revolut_type, product,
      started_datetime, completed_datetime, date, description,
      amount, effective_amount, split_ratio, exclude_from_analytics, applies_shared_split,
      fee, currency, state, balance_after, raw_balance,
      category_id, category_source,
      import_source, import_session_id
    ) VALUES (
      @fingerprint, @revolut_type, @product,
      @started_datetime, @completed_datetime, @date, @description,
      @amount, @effective_amount, @split_ratio, @exclude_from_analytics, @applies_shared_split,
      @fee, @currency, @state, @balance_after, @raw_balance,
      @category_id, @category_source,
      @import_source, @import_session_id
    )
  `);

  let sessionId;
  db.transaction(() => {
    sessionId = insertSession.run({
      filename,
      imported_count: 0,
      duplicate_count: 0,
      skipped_count: skipped.length,
      product: summary.account ?? null,
      date_from: summary.dateFrom ?? null,
      date_to: summary.dateTo ?? null,
    }).lastInsertRowid;

    for (const tx of transactions) {
      const catResult = categorizeTransaction({
        merchant: tx.description,
        beneficiary: '',
        details: tx.description,
      });
      const r = insertTx.run({
        fingerprint: tx.fingerprint,
        revolut_type: tx.revolut_type,
        product: tx.product,
        started_datetime: tx.started_datetime,
        completed_datetime: tx.completed_datetime,
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        effective_amount: tx.effective_amount,
        split_ratio: tx.split_ratio,
        exclude_from_analytics: tx.exclude_from_analytics,
        applies_shared_split: tx.applies_shared_split,
        fee: tx.fee,
        currency: tx.currency,
        state: tx.state,
        balance_after: tx.balance_after,
        raw_balance: tx.raw_balance,
        category_id: catResult.categoryId,
        category_source: catResult.source,
        import_source: tx.import_source,
        import_session_id: sessionId,
      });
      if (r.changes > 0) importedCount++;
      else duplicateCount++;
    }

    db.prepare(
      `UPDATE revolut_import_sessions
       SET imported_count = ?, duplicate_count = ?
       WHERE id = ?`
    ).run(importedCount, duplicateCount, sessionId);
  })();

  logger.info(`[RevolutImport] ${filename}: +${importedCount} new, ${duplicateCount} dupes, skipped ${skipped.length}`);

  return {
    sessionId,
    filename,
    source: 'revolut',
    importedCount,
    duplicateCount,
    skippedCount: skipped.length,
    summary: {
      ...summary,
      newCount: importedCount,
      duplicateCount,
    },
  };
}

module.exports = { previewRevolutImport, commitRevolutImport };
