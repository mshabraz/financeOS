/**
 * Per-ASPSP transaction history limits for Enable Banking sync.
 *
 * Many EU banks (including Swedbank EE) only expose ~90 days of transactions
 * via PSD2 without a separate "over 90 days" consent. Revolut typically allows
 * longer history through Enable Banking.
 *
 * @see https://enablebanking.com/docs/faq — "Why is only 90 days of transactions history available?"
 */

function isoDateOnly(d) {
  return d.toISOString().slice(0, 10);
}

/** Max days of transaction history per bank (null = use global backfill setting). */
function getAspspMaxTransactionDays(aspspName) {
  const name = aspspName || '';
  if (/swedbank/i.test(name)) return 90;
  if (/\bseb\b/i.test(name)) return 90;
  return null;
}

function getSyncBackfillDays(db) {
  try {
    const row = db.prepare(
      'SELECT value FROM app_settings WHERE key = ?',
    ).get('open_banking_sync_backfill_days');
    const n = parseInt(row?.value || '365', 10);
    if (Number.isFinite(n) && n > 0) return Math.min(n, 730);
  } catch {
    /* app_settings may not exist */
  }
  return 365;
}

function connectionHasStoredTransactions(db, connection, isRevolutConnection) {
  if (isRevolutConnection(connection)) {
    const product = connection.account_iban || connection.account_uid;
    const row = db.prepare(
      `SELECT COUNT(*) AS n FROM revolut_transactions
       WHERE product = ? OR product = ?`,
    ).get(product, connection.account_iban || '');
    return (row?.n ?? 0) > 0;
  }
  const account = connection.account_iban;
  if (account) {
    const row = db.prepare(
      'SELECT COUNT(*) AS n FROM transactions WHERE account = ?',
    ).get(account);
    return (row?.n ?? 0) > 0;
  }
  const row = db.prepare('SELECT COUNT(*) AS n FROM transactions').get();
  return (row?.n ?? 0) > 0;
}

function earliestAllowedDate(now, maxDays) {
  const d = new Date(now);
  d.setDate(d.getDate() - maxDays);
  return isoDateOnly(d);
}

function capDateFrom(dateFrom, maxDays, now = new Date()) {
  const cappedFrom = earliestAllowedDate(now, maxDays);
  if (dateFrom >= cappedFrom) {
    return { dateFrom, historyCapped: false };
  }
  return { dateFrom: cappedFrom, historyCapped: true };
}

function historyCapMessage(aspspName, maxDays) {
  return `${aspspName || 'This bank'} only exposes about ${maxDays} days of transactions via open banking — sync was limited to that period. For older history, import a bank CSV export.`;
}

/**
 * Resolve date_from / date_to for an Enable Banking transaction fetch.
 */
function resolveTransactionSyncRange(connection, db, options = {}, isRevolutConnection, now = new Date()) {
  let dateFrom;

  if (options.dateFrom) {
    dateFrom = options.dateFrom;
  } else if (options.fullBackfill || !connectionHasStoredTransactions(db, connection, isRevolutConnection)) {
    const d = new Date(now);
    d.setDate(d.getDate() - getSyncBackfillDays(db));
    dateFrom = isoDateOnly(d);
  } else if (connection.last_sync_at) {
    const d = new Date(connection.last_sync_at);
    if (!Number.isNaN(d.getTime())) {
      d.setDate(d.getDate() - 1);
      dateFrom = isoDateOnly(d);
    } else {
      const fallback = new Date(now);
      fallback.setDate(fallback.getDate() - 90);
      dateFrom = isoDateOnly(fallback);
    }
  } else {
    const d = new Date(now);
    d.setDate(d.getDate() - 90);
    dateFrom = isoDateOnly(d);
  }

  const maxTransactionDays = getAspspMaxTransactionDays(connection.aspsp_name);
  let historyCapped = false;
  if (maxTransactionDays != null) {
    const capped = capDateFrom(dateFrom, maxTransactionDays, now);
    dateFrom = capped.dateFrom;
    historyCapped = capped.historyCapped;
  }

  return {
    dateFrom,
    dateTo: isoDateOnly(now),
    maxTransactionDays,
    historyCapped,
    historyNote: historyCapped
      ? historyCapMessage(connection.aspsp_name, maxTransactionDays)
      : null,
  };
}

module.exports = {
  isoDateOnly,
  getAspspMaxTransactionDays,
  getSyncBackfillDays,
  resolveTransactionSyncRange,
  historyCapMessage,
};
