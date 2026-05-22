/**
 * Background price sync for open investment holdings.
 */

const { getDb } = require('../db/database');
const { computeHoldings } = require('./investmentHoldings');
const { getBinding } = require('./investmentSecurities');
const yahoo = require('./marketData/yahooProvider');
const logger = require('./logger');

let syncInProgress = false;
let intervalHandle = null;

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

function setSyncState(db, patch) {
  const row = db.prepare('SELECT id FROM investment_price_sync WHERE id = 1').get();
  if (!row) {
    db.prepare(
      `INSERT INTO investment_price_sync (id, status, last_started_at, last_success_at, last_error,
         securities_updated, holdings_checked)
       VALUES (1, ?, ?, ?, ?, ?, ?)`
    ).run(
      patch.status ?? 'idle',
      patch.last_started_at ?? null,
      patch.last_success_at ?? null,
      patch.last_error ?? null,
      patch.securities_updated ?? 0,
      patch.holdings_checked ?? 0
    );
    return;
  }
  const fields = [];
  const vals = [];
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'id') continue;
    fields.push(`${k} = ?`);
    vals.push(v);
  }
  if (!fields.length) return;
  vals.push(1);
  db.prepare(`UPDATE investment_price_sync SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
}

function cachePrice(db, securityId, quote, errMsg = null) {
  if (errMsg) {
    db.prepare(
      `INSERT INTO market_prices (security_id, price, currency, fetched_at, source, error)
       VALUES (?, 0, 'EUR', datetime('now'), ?, ?)
       ON CONFLICT(security_id) DO UPDATE SET error = excluded.error, fetched_at = excluded.fetched_at`
    ).run(securityId, yahoo.PROVIDER_ID, errMsg);
    return;
  }

  db.prepare(
    `INSERT INTO market_prices (security_id, price, currency, previous_close, change_amount, change_percent,
       dividend_yield, fetched_at, source, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, NULL)
     ON CONFLICT(security_id) DO UPDATE SET
       price = excluded.price,
       currency = excluded.currency,
       previous_close = excluded.previous_close,
       change_amount = excluded.change_amount,
       change_percent = excluded.change_percent,
       dividend_yield = COALESCE(excluded.dividend_yield, market_prices.dividend_yield),
       fetched_at = excluded.fetched_at,
       error = NULL`
  ).run(
    securityId,
    quote.price,
    quote.currency,
    quote.previousClose ?? null,
    quote.changeAmount ?? null,
    quote.changePercent ?? null,
    quote.dividendYield ?? null,
    yahoo.PROVIDER_ID
  );

  db.prepare(
    `INSERT INTO market_price_history (security_id, price, currency, price_date, fetched_at, source)
     VALUES (?, ?, ?, date('now'), datetime('now'), ?)
     ON CONFLICT(security_id, price_date) DO UPDATE SET
       price = excluded.price, fetched_at = excluded.fetched_at`
  ).run(securityId, quote.price, quote.currency, yahoo.PROVIDER_ID);
}

async function refreshSecurityMetadata(db, securityId, yahooSymbol) {
  const row = db.prepare('SELECT * FROM market_securities WHERE id = ?').get(securityId);
  if (row?.sector && row?.region) {
    const age = row.metadata_updated_at
      ? Date.now() - new Date(row.metadata_updated_at).getTime()
      : Infinity;
    if (age < 7 * 24 * 60 * 60 * 1000) return;
  }
  try {
    const { enrichSecurityMetadata } = require('./investmentMetadataEnrichment');
    await enrichSecurityMetadata(
      db,
      securityId,
      yahooSymbol,
      row?.exchange,
      row?.name,
      row?.security_type
    );
  } catch {
    /* non-fatal */
  }
}

async function syncSecurityQuote(db, securityId, yahooSymbol) {
  try {
    const quote = await yahoo.fetchQuote(yahooSymbol);
    if (!quote) {
      cachePrice(db, securityId, null, 'No quote returned');
      return false;
    }
    cachePrice(db, securityId, quote);
    await refreshSecurityMetadata(db, securityId, yahooSymbol);
    return true;
  } catch (err) {
    cachePrice(db, securityId, null, err.message);
    return false;
  }
}

/**
 * Sync all open holdings with manual bindings — refresh cached prices.
 * @returns {Promise<{ ok: boolean, updated: number, checked: number, error?: string }>}
 */
async function runPriceSync() {
  if (syncInProgress) {
    return { ok: false, skipped: true, reason: 'sync already running' };
  }

  syncInProgress = true;
  const db = getDb();
  const now = new Date().toISOString();

  setSyncState(db, {
    status: 'running',
    last_started_at: now,
    last_error: null,
  });

  let updated = 0;
  let checked = 0;

  try {
    const open = computeHoldings(db).filter((h) => !h.fullyExited);

    for (const h of open) {
      checked += 1;
      const binding = getBinding(db, h.broker, h.ticker, h.currency);
      if (!binding?.security_id || !binding.yahoo_symbol) continue;

      const ok = await syncSecurityQuote(db, binding.security_id, binding.yahoo_symbol);
      if (ok) updated += 1;

      await new Promise((r) => setTimeout(r, 120));
    }

    setSyncState(db, {
      status: 'ok',
      last_success_at: new Date().toISOString(),
      last_error: null,
      securities_updated: updated,
      holdings_checked: checked,
    });

    try {
      const { buildPortfolioValuation } = require('./investmentValuation');
      const val = await buildPortfolioValuation(db);
      const holdingsOnly = val.primary?.holdingsValue ?? 0;
      db.prepare(
        "UPDATE manual_balances SET amount = ?, updated_at = datetime('now') WHERE key = 'investments'"
      ).run(holdingsOnly);
    } catch (e) {
      logger.warn(`[priceSync] dashboard investments update: ${e.message}`);
    }

    return { ok: true, updated, checked };
  } catch (err) {
    logger.error('[priceSync]', err);
    setSyncState(db, {
      status: 'error',
      last_error: err.message,
      holdings_checked: checked,
      securities_updated: updated,
    });
    return { ok: false, error: err.message, updated, checked };
  } finally {
    syncInProgress = false;
  }
}

function startPriceSyncScheduler(intervalMs = DEFAULT_INTERVAL_MS) {
  if (intervalHandle) return;

  setTimeout(() => {
    runPriceSync().catch((e) => logger.warn(`[priceSync] initial: ${e.message}`));
  }, 5000);

  intervalHandle = setInterval(() => {
    runPriceSync().catch((e) => logger.warn(`[priceSync] scheduled: ${e.message}`));
  }, intervalMs);

  logger.info(`[priceSync] Scheduler started (every ${Math.round(intervalMs / 60000)} min)`);
}

function stopPriceSyncScheduler() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

function isSyncRunning() {
  return syncInProgress;
}

module.exports = {
  runPriceSync,
  startPriceSyncScheduler,
  stopPriceSyncScheduler,
  isSyncRunning,
  setSyncState,
};
