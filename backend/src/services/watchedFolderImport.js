/**
 * Watched-folder auto-import: scan, detect format, import via existing pipelines.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDb } = require('../db/database');
const { isRevolutCSV } = require('./revolutParser');
const { detect: detectBroker } = require('./parsers');
const { commitImport } = require('./importer');
const { commitRevolutImport } = require('./revolutImporter');
const { commitInvestmentImport } = require('./investmentImporter');
const { getWatchedFolderConfig } = require('./watchedFolderConfig');
const logger = require('./logger');

const STABLE_SCANS_REQUIRED = 2;
const SUPPORTED_EXT = new Set(['.csv']);
const MAX_NOTIFICATIONS = 50;

const KIND_LABELS = {
  bank: 'bank (LHV)',
  revolut: 'Revolut',
  investment: 'investment',
  unsupported: 'unsupported',
  skipped: 'skipped',
};

const PARSER_LABELS = {
  lhv_bank: 'LHV bank CSV',
  revolut_csv: 'Revolut CSV',
  lightyear: 'Lightyear',
  swedbank_fund: 'Swedbank funds',
  duplicate_file: 'duplicate file',
  unknown: 'unknown',
};

/** @typedef {'empty_file'|'duplicate_file'|'unsupported_format'|'no_new_transactions'|'no_rows_imported'|'import_failed'|'read_failed'} SkipReason */

function kindLabel(kind) {
  return KIND_LABELS[kind] || kind;
}

function parserLabel(parserType) {
  return PARSER_LABELS[parserType] || parserType;
}

/**
 * Build user-facing notification + DB error_message for an import outcome.
 */
function buildOutcome(ctx) {
  const {
    skipReason,
    fileName,
    importKind,
    parserType,
    priorFileName,
    newCount = 0,
    duplicateCount = 0,
    errorCount = 0,
    skippedCount = 0,
    errorText,
  } = ctx;

  if (skipReason === 'empty_file') {
    return {
      status: 'skipped',
      type: 'skipped',
      severity: 'info',
      skipReason,
      message: 'Skipped — file is empty',
      detail: `${fileName} has no data (0 bytes). Nothing to import.`,
    };
  }

  if (skipReason === 'duplicate_file') {
    return {
      status: 'skipped',
      type: 'skipped',
      severity: 'info',
      skipReason,
      message: 'Skipped — already imported',
      detail: priorFileName
        ? `Same file content as «${priorFileName}» (renamed or copied). No re-import.`
        : 'Identical file content was imported earlier. No re-import.',
    };
  }

  if (skipReason === 'unsupported_format') {
    return {
      status: 'unsupported',
      type: 'unsupported',
      severity: 'warning',
      skipReason,
      message: 'Skipped — unsupported format',
      detail:
        'Could not detect a supported CSV type. Expected: LHV bank (semicolon), Revolut (comma), Lightyear, or Swedbank funds export.',
    };
  }

  if (skipReason === 'read_failed') {
    return {
      status: 'failed',
      type: 'error',
      severity: 'error',
      skipReason,
      message: 'Failed — could not read file',
      detail: errorText || 'The file could not be opened or read from disk.',
    };
  }

  if (skipReason === 'import_failed') {
    return {
      status: 'failed',
      type: 'error',
      severity: 'error',
      skipReason,
      message: 'Import failed',
      detail: errorText || 'An error occurred while parsing or saving transactions.',
      importKind,
      parserType,
    };
  }

  const label = kindLabel(importKind);
  const parser = parserLabel(parserType);

  if (newCount > 0) {
    const parts = [`Added ${newCount} new ${label} transaction${newCount === 1 ? '' : 's'}`];
    if (duplicateCount > 0) parts.push(`${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'} skipped`);
    if (skippedCount > 0) parts.push(`${skippedCount} row${skippedCount === 1 ? '' : 's'} skipped by parser`);
    if (errorCount > 0) parts.push(`${errorCount} row${errorCount === 1 ? '' : 's'} with errors`);
    return {
      status: errorCount > 0 ? 'partial_success' : 'success',
      type: 'success',
      severity: 'success',
      message: `Imported ${newCount} new transaction${newCount === 1 ? '' : 's'}`,
      detail: `${parts.join(' · ')} · ${parser}`,
      newCount,
      duplicateCount,
      errorCount,
      skippedCount,
      importKind,
      parserType,
    };
  }

  if (duplicateCount > 0) {
    return {
      status: 'duplicate_only',
      type: 'duplicate_only',
      severity: 'warning',
      skipReason: 'no_new_transactions',
      message: 'No new transactions',
      detail: `All ${duplicateCount} row${duplicateCount === 1 ? '' : 's'} in this ${label} file are already in your database (${parser}).`,
      newCount,
      duplicateCount,
      errorCount,
      skippedCount,
      importKind,
      parserType,
    };
  }

  if (errorCount > 0) {
    return {
      status: 'failed',
      type: 'error',
      severity: 'error',
      skipReason: 'no_rows_imported',
      message: 'No new transactions — import errors',
      detail: `${errorCount} row${errorCount === 1 ? '' : 's'} failed during import (${parser}). Check the file format and try manual import for details.`,
      newCount,
      duplicateCount,
      errorCount,
      skippedCount,
      importKind,
      parserType,
    };
  }

  if (skippedCount > 0) {
    return {
      status: 'no_new',
      type: 'duplicate_only',
      severity: 'warning',
      skipReason: 'no_new_transactions',
      message: 'No new transactions',
      detail: `Parser skipped ${skippedCount} row${skippedCount === 1 ? '' : 's'} and found nothing new to add (${parser}).`,
      newCount,
      duplicateCount,
      errorCount,
      skippedCount,
      importKind,
      parserType,
    };
  }

  return {
    status: 'no_new',
    type: 'duplicate_only',
    severity: 'warning',
    skipReason: 'no_new_transactions',
    message: 'No new transactions',
    detail: `This ${label} file contained no rows to import (${parser}).`,
    newCount,
    duplicateCount,
    errorCount,
    skippedCount,
    importKind,
    parserType,
  };
}

function notifyOutcome(fileName, outcome) {
  pushNotification({
    fileName,
    ...outcome,
    errorMessage: outcome.detail,
  });
}

/** @type {Map<string, { size: number, mtimeMs: number, stableCount: number }>} */
const stability = new Map();

let scanInProgress = false;
let importQueue = Promise.resolve();
let intervalHandle = null;
let fsWatcher = null;
let lastScanAt = null;
let lastScanSummary = null;

/** @type {Array<object>} */
const notifications = [];

function pushNotification(entry) {
  notifications.unshift({ ...entry, at: new Date().toISOString() });
  if (notifications.length > MAX_NOTIFICATIONS) notifications.length = MAX_NOTIFICATIONS;
}

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function detectImportKind(buffer) {
  if (isRevolutCSV(buffer)) {
    return { kind: 'revolut', parserType: 'revolut_csv' };
  }
  const det = detectBroker(buffer);
  if (det.broker === 'lightyear' || det.broker === 'swedbank_fund') {
    return { kind: 'investment', parserType: det.broker };
  }
  if (det.broker === 'lhv_bank') {
    return { kind: 'bank', parserType: 'lhv_bank' };
  }
  return { kind: 'unknown', parserType: 'unknown' };
}

function listCsvFiles(folderPath) {
  let names = [];
  try {
    names = fs.readdirSync(folderPath);
  } catch (err) {
    throw new Error(`Cannot read folder: ${err.message}`);
  }
  return names
    .filter((name) => {
      const ext = path.extname(name).toLowerCase();
      return SUPPORTED_EXT.has(ext) && !name.startsWith('~') && !name.startsWith('.');
    })
    .map((name) => ({
      name,
      fullPath: path.join(folderPath, name),
    }));
}

function isFileStable(fullPath) {
  let stat;
  try {
    stat = fs.statSync(fullPath);
  } catch {
    stability.delete(fullPath);
    return false;
  }
  if (!stat.isFile()) return false;

  const prev = stability.get(fullPath);
  if (!prev || prev.size !== stat.size || prev.mtimeMs !== stat.mtimeMs) {
    stability.set(fullPath, { size: stat.size, mtimeMs: stat.mtimeMs, stableCount: 1 });
    return false;
  }
  const next = prev.stableCount + 1;
  stability.set(fullPath, { size: stat.size, mtimeMs: stat.mtimeMs, stableCount: next });
  return next >= STABLE_SCANS_REQUIRED;
}

function recordFileResult(db, row) {
  db.prepare(
    `INSERT INTO watched_import_files
       (file_name, file_path, file_hash, file_size, import_kind, parser_type, status,
        new_count, duplicate_count, error_count, skipped_count,
        session_table, session_id, error_message, warnings_json, processed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(file_hash) DO UPDATE SET
       file_name = excluded.file_name,
       file_path = excluded.file_path,
       file_size = excluded.file_size,
       import_kind = excluded.import_kind,
       parser_type = excluded.parser_type,
       status = excluded.status,
       new_count = excluded.new_count,
       duplicate_count = excluded.duplicate_count,
       error_count = excluded.error_count,
       skipped_count = excluded.skipped_count,
       session_table = excluded.session_table,
       session_id = excluded.session_id,
       error_message = excluded.error_message,
       warnings_json = excluded.warnings_json,
       processed_at = excluded.processed_at`
  ).run(
    row.fileName,
    row.filePath,
    row.fileHash,
    row.fileSize,
    row.importKind,
    row.parserType,
    row.status,
    row.newCount ?? 0,
    row.duplicateCount ?? 0,
    row.errorCount ?? 0,
    row.skippedCount ?? 0,
    row.sessionTable ?? null,
    row.sessionId ?? null,
    row.errorMessage ?? null,
    row.warningsJson ?? null
  );
}

function alreadyProcessedByHash(db, fileHash) {
  const row = db
    .prepare(
      `SELECT id, status, file_name FROM watched_import_files
       WHERE file_hash = ? AND status IN ('success', 'duplicate_only', 'skipped')`
    )
    .get(fileHash);
  return row || null;
}

async function processOneFile(fullPath, fileName) {
  const db = getDb();
  let buffer;
  try {
    buffer = fs.readFileSync(fullPath);
  } catch (err) {
    const outcome = buildOutcome({
      skipReason: 'read_failed',
      fileName,
      errorText: err.message,
    });
    recordFileResult(db, {
      fileName,
      filePath: fullPath,
      fileHash: hashBuffer(Buffer.from(`${fullPath}:${err.message}`)),
      fileSize: 0,
      importKind: 'unknown',
      parserType: 'unknown',
      status: outcome.status,
      errorMessage: outcome.detail,
    });
    notifyOutcome(fileName, outcome);
    return { status: 'failed', reason: 'read_failed' };
  }

  if (buffer.length === 0) {
    const outcome = buildOutcome({ skipReason: 'empty_file', fileName });
    recordFileResult(db, {
      fileName,
      filePath: fullPath,
      fileHash: hashBuffer(buffer),
      fileSize: 0,
      importKind: 'skipped',
      parserType: 'empty_file',
      status: outcome.status,
      errorMessage: outcome.detail,
    });
    notifyOutcome(fileName, outcome);
    return { status: 'skipped', reason: 'empty_file' };
  }

  const fileHash = hashBuffer(buffer);
  const fileSize = buffer.length;
  const prior = alreadyProcessedByHash(db, fileHash);
  if (prior) {
    const outcome = buildOutcome({
      skipReason: 'duplicate_file',
      fileName,
      priorFileName: prior.file_name,
    });
    recordFileResult(db, {
      fileName,
      filePath: fullPath,
      fileHash,
      fileSize,
      importKind: 'skipped',
      parserType: 'duplicate_file',
      status: outcome.status,
      errorMessage: outcome.detail,
    });
    notifyOutcome(fileName, outcome);
    return { status: 'skipped', reason: 'duplicate_file' };
  }

  const { kind, parserType } = detectImportKind(buffer);

  if (kind === 'unknown') {
    const outcome = buildOutcome({ skipReason: 'unsupported_format', fileName });
    recordFileResult(db, {
      fileName,
      filePath: fullPath,
      fileHash,
      fileSize,
      importKind: 'unsupported',
      parserType,
      status: outcome.status,
      errorMessage: outcome.detail,
    });
    notifyOutcome(fileName, outcome);
    return { status: 'unsupported', reason: 'unsupported_format' };
  }

  try {
    let result;
    let sessionTable = null;
    let sessionId = null;

    if (kind === 'bank') {
      result = commitImport(buffer, fileName);
      sessionTable = 'import_sessions';
      sessionId = result.sessionId;
    } else if (kind === 'revolut') {
      result = commitRevolutImport(buffer, fileName);
      sessionTable = 'revolut_import_sessions';
      sessionId = result.sessionId;
    } else if (kind === 'investment') {
      result = commitInvestmentImport(buffer, fileName);
      sessionTable = 'investment_file_history';
      sessionId = result.historyId;
    }

    const newCount = result.importedCount ?? 0;
    const duplicateCount = result.duplicateCount ?? 0;
    const errorCount = result.errorCount ?? 0;
    const skippedCount = result.skippedCount ?? 0;

    const outcome = buildOutcome({
      fileName,
      importKind: kind,
      parserType,
      newCount,
      duplicateCount,
      errorCount,
      skippedCount,
    });

    recordFileResult(db, {
      fileName,
      filePath: fullPath,
      fileHash,
      fileSize,
      importKind: kind,
      parserType,
      status: outcome.status,
      newCount,
      duplicateCount,
      errorCount,
      skippedCount,
      sessionTable,
      sessionId,
      errorMessage: outcome.detail,
      warningsJson: JSON.stringify(result.warnings ?? []),
    });

    notifyOutcome(fileName, outcome);

    logger.info(
      `[watchedImport] ${fileName} (${kind}): ${outcome.message} — ${outcome.detail}`
    );

    return { status: outcome.status, newCount, duplicateCount, kind, reason: outcome.skipReason };
  } catch (err) {
    const outcome = buildOutcome({
      skipReason: 'import_failed',
      fileName,
      importKind: kind,
      parserType,
      errorText: err.message,
    });
    recordFileResult(db, {
      fileName,
      filePath: fullPath,
      fileHash,
      fileSize,
      importKind: kind,
      parserType,
      status: outcome.status,
      errorMessage: outcome.detail,
    });
    notifyOutcome(fileName, outcome);
    logger.warn(`[watchedImport] ${fileName}: ${err.message}`);
    return { status: 'failed', error: err.message, reason: 'import_failed' };
  }
}

function enqueueImport(fn) {
  importQueue = importQueue.then(fn).catch((err) => {
    logger.warn(`[watchedImport] queue error: ${err.message}`);
  });
  return importQueue;
}

async function runScan(trigger = 'interval') {
  if (scanInProgress) return { skipped: true, reason: 'scan_in_progress' };

  const cfg = getWatchedFolderConfig();
  if (!cfg.enabled || !cfg.folderPath || !cfg.folderReadable) {
    return { skipped: true, reason: 'disabled_or_missing_folder' };
  }

  scanInProgress = true;
  const summary = {
    trigger,
    scanned: 0,
    stable: 0,
    processed: 0,
    success: 0,
    duplicateOnly: 0,
    failed: 0,
    unsupported: 0,
    skipped: 0,
  };

  try {
    const files = listCsvFiles(cfg.folderPath);
    summary.scanned = files.length;

    for (const { name, fullPath } of files) {
      if (!isFileStable(fullPath)) continue;
      summary.stable += 1;

      await enqueueImport(async () => {
        await new Promise((resolve) => setImmediate(resolve));
        const r = await processOneFile(fullPath, name);
        summary.processed += 1;
        if (r.status === 'success' || r.status === 'partial_success') summary.success += 1;
        else if (r.status === 'duplicate_only' || r.status === 'no_new') summary.duplicateOnly += 1;
        else if (r.status === 'failed') summary.failed += 1;
        else if (r.status === 'unsupported') summary.unsupported += 1;
        else summary.skipped += 1;
      });
    }

    await importQueue;
    lastScanAt = new Date().toISOString();
    lastScanSummary = summary;
    return summary;
  } catch (err) {
    logger.error('[watchedImport] scan failed', err);
    pushNotification({
      type: 'scan_error',
      severity: 'error',
      message: 'Folder scan failed',
      detail: err.message,
    });
    return { error: err.message };
  } finally {
    scanInProgress = false;
  }
}

function stopFsWatch() {
  if (fsWatcher) {
    try {
      fsWatcher.close();
    } catch {
      /* ignore */
    }
    fsWatcher = null;
  }
}

function startFsWatch() {
  stopFsWatch();
  const cfg = getWatchedFolderConfig();
  if (!cfg.enabled || !cfg.useFsWatch || !cfg.folderReadable) return;

  try {
    fsWatcher = fs.watch(cfg.folderPath, { persistent: false }, (event, filename) => {
      if (!filename || !String(filename).toLowerCase().endsWith('.csv')) return;
      setTimeout(() => runScan('fs_watch').catch(() => {}), 1500);
    });
    fsWatcher.on('error', (err) => {
      logger.warn(`[watchedImport] fs.watch error: ${err.message}`);
      stopFsWatch();
    });
  } catch (err) {
    logger.warn(`[watchedImport] fs.watch unavailable: ${err.message}`);
  }
}

function reschedule() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  stopFsWatch();

  const cfg = getWatchedFolderConfig();
  if (!cfg.enabled || !cfg.folderReadable) return;

  intervalHandle = setInterval(() => {
    runScan('interval').catch((e) => logger.warn(`[watchedImport] ${e.message}`));
  }, cfg.intervalMs);

  startFsWatch();
  setTimeout(() => runScan('startup').catch(() => {}), 3000);

  logger.info(
    `[watchedImport] Monitoring ${cfg.folderPath} every ${cfg.intervalSec}s` +
      (cfg.useFsWatch ? ' (+ fs events)' : '')
  );
}

function startWatchedFolderScheduler() {
  reschedule();
}

function getNotifications(limit = 20) {
  return notifications.slice(0, limit);
}

function getImportHistory(db = getDb(), limit = 50) {
  return db
    .prepare(
      `SELECT * FROM watched_import_files ORDER BY processed_at DESC, id DESC LIMIT ?`
    )
    .all(limit)
    .map((r) => ({
      ...r,
      warnings: r.warnings_json ? JSON.parse(r.warnings_json) : [],
      detail: r.error_message || null,
    }));
}

function getWatcherStatus() {
  const cfg = getWatchedFolderConfig();
  return {
    config: cfg,
    lastScanAt,
    lastScanSummary,
    scanInProgress,
    notificationCount: notifications.length,
  };
}

module.exports = {
  runScan,
  reschedule,
  startWatchedFolderScheduler,
  getNotifications,
  getImportHistory,
  getWatcherStatus,
  detectImportKind,
  hashBuffer,
};
