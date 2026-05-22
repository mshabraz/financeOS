/**
 * Investment CSV commit (shared by manual upload and watched-folder import).
 */

const { getDb } = require('../db/database');
const { detect: detectBroker, parse: parseBrokerCSV } = require('./parsers');
const { runPriceSync } = require('./investmentPriceSync');
const {
  loadInvestmentDedupSets,
  isDuplicateInvestmentTx,
  refKey,
} = require('./investmentDedup');
const logger = require('./logger');

function commitInvestmentImport(buffer, filename) {
  const detection = detectBroker(buffer);
  if (detection.broker === 'unknown' || detection.broker === 'lhv_bank') {
    const err = new Error(
      detection.broker === 'lhv_bank'
        ? 'This file looks like a bank account CSV, not an investment export.'
        : 'Unsupported investment file format'
    );
    err.code = 'UNSUPPORTED_FORMAT';
    err.detection = detection;
    throw err;
  }

  const parsed = parseBrokerCSV(buffer);
  const db = getDb();
  let importedCount = 0;
  let duplicateCount = 0;
  const errorCount = parsed.errors.filter((e) => !e.skipped).length;

  const historyId = db
    .prepare(
      `INSERT INTO investment_file_history
        (filename, broker_key, broker_name, parser_version, detected_conf,
         skipped_count, error_count, date_from, date_to, warnings)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      filename,
      parsed.broker,
      parsed.brokerName,
      parsed.parserVersion,
      parsed.confidence,
      parsed.skipped,
      errorCount,
      parsed.summary.dateFrom,
      parsed.summary.dateTo,
      JSON.stringify(parsed.warnings ?? [])
    ).lastInsertRowid;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO investment_transactions
      (fingerprint, reference, datetime, date, ticker, isin, type,
       quantity, currency, price_per_share, gross_amount, fx_rate, fee, net_amount, tax_amount,
       broker, broker_account_id, fund_name, fund_order_id, raw_details, raw_type, file_history_id)
    VALUES
      (@fingerprint, @reference, @datetime, @date, @ticker, @isin, @type,
       @quantity, @currency, @pricePerShare, @grossAmount, @fxRate, @fee, @netAmount, @taxAmount,
       @broker, @brokerAccountId, @fundName, @fundOrderId, @rawDetails, @rawType, @fileHistoryId)
  `);

  const dedupSets = loadInvestmentDedupSets(db);

  const doImport = db.transaction(() => {
    for (const tx of parsed.transactions) {
      if (isDuplicateInvestmentTx(tx, dedupSets)) {
        duplicateCount++;
        continue;
      }
      const result = insert.run({ ...tx, fileHistoryId: historyId });
      if (result.changes > 0) {
        importedCount++;
        dedupSets.fingerprints.add(tx.fingerprint);
        const rk = refKey(tx.broker, tx.reference);
        if (rk) dedupSets.references.add(rk);
      } else {
        duplicateCount++;
      }
    }
  });

  doImport();

  db.prepare('UPDATE investment_file_history SET imported_count = ?, duplicate_count = ? WHERE id = ?')
    .run(importedCount, duplicateCount, historyId);

  setImmediate(() => {
    runPriceSync().catch((e) => logger.warn(`[investmentImporter] price sync: ${e.message}`));
  });

  return {
    historyId,
    broker: parsed.broker,
    brokerName: parsed.brokerName,
    parserType: parsed.broker,
    importedCount,
    duplicateCount,
    errorCount,
    skippedCount: parsed.skipped,
    summary: parsed.summary,
    warnings: parsed.warnings ?? [],
  };
}

module.exports = { commitInvestmentImport };
