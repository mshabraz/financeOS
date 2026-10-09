/**
 * Investment CSV commit (manual upload).
 */

const { getDb } = require('../db/database');
const { detect: detectBroker, parse: parseBrokerCSV } = require('./parsers');
const { runPriceSync } = require('./investmentPriceSync');
const {
  loadInvestmentDedupSets,
  isDuplicateInvestmentTx,
  refKey,
} = require('./investmentDedup');
const { setManualQuantity } = require('./investmentSecurities');
const { ISIN_TO_TICKER } = require('./parsers/swedbankFund');
const logger = require('./logger');

function backfillSwedbankIsins(db) {
  let updated = 0;
  const stmt = db.prepare(
    `UPDATE investment_transactions
        SET isin = ?
      WHERE broker = 'swedbank_fund'
        AND ticker = ?
        AND (isin IS NULL OR TRIM(isin) = '')`
  );
  for (const [isin, ticker] of Object.entries(ISIN_TO_TICKER)) {
    const r = stmt.run(isin, ticker);
    updated += r.changes || 0;
  }
  return updated;
}

function applyPositionSnapshots(db, broker, snapshots = []) {
  let updated = 0;
  for (const snap of snapshots) {
    if (!snap?.ticker || snap.closingBalance == null || !(snap.closingBalance > 0)) continue;
    setManualQuantity(db, {
      broker,
      ticker: snap.ticker,
      currency: snap.currency || 'EUR',
      quantity: snap.closingBalance,
    });
    if (snap.isin) {
      db.prepare(
        `UPDATE holding_security_bindings
            SET isin = COALESCE(isin, ?)
          WHERE broker = ? AND ticker = ? AND currency = ?`
      ).run(snap.isin, broker, String(snap.ticker).toUpperCase(), (snap.currency || 'EUR').toUpperCase());
    }
    updated += 1;
  }
  return updated;
}

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
  const warnings = [...(parsed.warnings ?? [])];

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
      JSON.stringify(warnings)
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
  let positionQtyUpdated = 0;
  let isinsBackfilled = 0;

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

    if (parsed.broker === 'swedbank_fund') {
      isinsBackfilled = backfillSwedbankIsins(db);
      positionQtyUpdated = applyPositionSnapshots(db, parsed.broker, parsed.positionSnapshots || []);
    }
  });

  doImport();

  if (isinsBackfilled > 0) warnings.push(`Backfilled ISIN on ${isinsBackfilled} Swedbank transaction(s)`);
  if (positionQtyUpdated > 0) {
    warnings.push(`Synced share quantity for ${positionQtyUpdated} fund position(s) from statement closing balance`);
  }

  db.prepare('UPDATE investment_file_history SET imported_count = ?, duplicate_count = ?, warnings = ? WHERE id = ?')
    .run(importedCount, duplicateCount, JSON.stringify(warnings), historyId);

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
    warnings,
    positionQtyUpdated,
    isinsBackfilled,
  };
}

module.exports = {
  commitInvestmentImport,
  backfillSwedbankIsins,
  applyPositionSnapshots,
};
