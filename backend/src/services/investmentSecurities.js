/**
 * Security master, holdings bindings, search & auto-match.
 */

const yahoo = require('./marketData/yahooProvider');
const logger = require('./logger');

function holdingKey(broker, ticker, currency) {
  return `${broker}|${String(ticker).toUpperCase()}|${(currency || 'EUR').toUpperCase()}`;
}

function getBinding(db, broker, ticker, currency) {
  return db.prepare(
    `SELECT b.*, s.yahoo_symbol, s.name AS security_name, s.exchange, s.isin AS security_isin,
            s.quote_currency, s.security_type
     FROM holding_security_bindings b
     LEFT JOIN market_securities s ON s.id = b.security_id
     WHERE b.broker = ? AND b.ticker = ? AND b.currency = ?`
  ).get(broker, String(ticker).toUpperCase(), (currency || 'EUR').toUpperCase());
}

function upsertSecurity(db, fields) {
  const existing = fields.yahoo_symbol
    ? db.prepare('SELECT id FROM market_securities WHERE yahoo_symbol = ?').get(fields.yahoo_symbol)
    : null;

  if (existing) {
    db.prepare(
      `UPDATE market_securities SET
         name = COALESCE(?, name),
         exchange = COALESCE(?, exchange),
         isin = COALESCE(?, isin),
         quote_currency = COALESCE(?, quote_currency),
         security_type = COALESCE(?, security_type),
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      fields.name ?? null,
      fields.exchange ?? null,
      fields.isin ?? null,
      fields.quote_currency ?? null,
      fields.security_type ?? null,
      existing.id
    );
    return existing.id;
  }

  const r = db.prepare(
    `INSERT INTO market_securities
       (local_ticker, yahoo_symbol, name, exchange, isin, quote_currency, security_type, provider)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    fields.local_ticker ?? null,
    fields.yahoo_symbol,
    fields.name ?? fields.yahoo_symbol,
    fields.exchange ?? null,
    fields.isin ?? null,
    fields.quote_currency ?? 'USD',
    fields.security_type ?? null,
    fields.provider ?? yahoo.PROVIDER_ID
  );
  return r.lastInsertRowid;
}

function bindHolding(db, { broker, ticker, currency, isin, securityId, source = 'manual' }) {
  const key = holdingKey(broker, ticker, currency);
  const existing = db.prepare(
    'SELECT id FROM holding_security_bindings WHERE broker = ? AND ticker = ? AND currency = ?'
  ).get(broker, String(ticker).toUpperCase(), (currency || 'EUR').toUpperCase());

  if (existing) {
    db.prepare(
      `UPDATE holding_security_bindings SET
         security_id = ?, isin = COALESCE(?, isin), binding_source = ?, holding_key = ?,
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(securityId, isin ?? null, source, key, existing.id);
    return existing.id;
  }

  const r = db.prepare(
    `INSERT INTO holding_security_bindings
       (holding_key, broker, ticker, currency, isin, security_id, binding_source)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    key,
    broker,
    String(ticker).toUpperCase(),
    (currency || 'EUR').toUpperCase(),
    isin ?? null,
    securityId,
    source
  );
  return r.lastInsertRowid;
}

function clearBinding(db, broker, ticker, currency) {
  db.prepare(
    'DELETE FROM holding_security_bindings WHERE broker = ? AND ticker = ? AND currency = ?'
  ).run(broker, String(ticker).toUpperCase(), (currency || 'EUR').toUpperCase());
}

function setManualAvgCostPerShare(db, { broker, ticker, currency, avgCostPerShare }) {
  const t = String(ticker).toUpperCase();
  const ccy = (currency || 'EUR').toUpperCase();
  const parsed = avgCostPerShare == null || avgCostPerShare === '' ? null : parseFloat(avgCostPerShare);
  const avg = parsed != null && parsed > 0 ? parsed : null;
  const key = holdingKey(broker, t, ccy);

  const existing = db.prepare(
    'SELECT id FROM holding_security_bindings WHERE broker = ? AND ticker = ? AND currency = ?'
  ).get(broker, t, ccy);

  if (existing) {
    db.prepare(
      `UPDATE holding_security_bindings SET manual_avg_cost_per_share = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(avg, existing.id);
    return existing.id;
  }

  const r = db.prepare(
    `INSERT INTO holding_security_bindings
       (holding_key, broker, ticker, currency, manual_avg_cost_per_share, binding_source)
     VALUES (?, ?, ?, ?, ?, 'manual')`
  ).run(key, broker, t, ccy, avg);
  return r.lastInsertRowid;
}

function setManualQuantity(db, { broker, ticker, currency, quantity }) {
  const t = String(ticker).toUpperCase();
  const ccy = (currency || 'EUR').toUpperCase();
  const parsed = quantity == null || quantity === '' ? null : parseFloat(quantity);
  const qty = parsed != null && parsed > 0 ? parsed : null;
  const key = holdingKey(broker, t, ccy);

  const existing = db.prepare(
    'SELECT id FROM holding_security_bindings WHERE broker = ? AND ticker = ? AND currency = ?'
  ).get(broker, t, ccy);

  if (existing) {
    db.prepare(
      `UPDATE holding_security_bindings SET manual_quantity = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(qty, existing.id);
    return existing.id;
  }

  const r = db.prepare(
    `INSERT INTO holding_security_bindings
       (holding_key, broker, ticker, currency, manual_quantity, binding_source)
     VALUES (?, ?, ?, ?, ?, 'manual')`
  ).run(key, broker, t, ccy, qty);
  return r.lastInsertRowid;
}

/**
 * Auto-match: search Yahoo for exact ticker or ISIN hit.
 */
async function tryAutoMatch(db, { broker, ticker, isin, currency, fundName }) {
  const bound = getBinding(db, broker, ticker, currency);
  if (bound?.security_id) return { matched: true, binding: bound, source: 'existing' };

  if (ticker) {
    try {
      const resolved = await yahoo.resolveAndQuote({ ticker, isin, currency });
      if (resolved?.providerSymbol) {
        const secId = upsertSecurity(db, {
          local_ticker: ticker,
          yahoo_symbol: resolved.providerSymbol,
          name: resolved.name || resolved.providerSymbol,
          exchange: resolved.exchange ?? null,
          isin: isin || null,
          quote_currency: resolved.currency,
          security_type: 'ETF',
          provider: yahoo.PROVIDER_ID,
        });
        bindHolding(db, {
          broker,
          ticker,
          currency,
          isin,
          securityId: secId,
          source: 'auto',
        });
        return {
          matched: true,
          securityId: secId,
          yahooSymbol: resolved.providerSymbol,
          source: 'auto',
          via: resolved.matchedVia,
        };
      }
    } catch (err) {
      logger.warn(`[securities] resolveAndQuote ${ticker}: ${err.message}`);
    }
  }

  const query = isin || ticker || fundName;
  if (!query) return { matched: false };

  let hits = [];
  try {
    hits = await yahoo.searchSecurities(query, 10);
  } catch (err) {
    logger.warn(`[securities] search failed for ${query}: ${err.message}`);
    return { matched: false, error: err.message };
  }

  const tUp = String(ticker || '').toUpperCase();
  let pick = null;

  if (tUp) {
    pick = hits.find(
      (h) =>
        String(h.symbol).toUpperCase() === tUp ||
        String(h.providerSymbol).toUpperCase().split('.')[0] === tUp
    );
  }
  if (!pick && isin) {
    pick = hits.find((h) => String(h.name || '').toUpperCase().includes(isin.toUpperCase()));
  }
  if (!pick && hits.length === 1) pick = hits[0];

  if (!pick?.providerSymbol) return { matched: false, candidates: hits };

  const secId = upsertSecurity(db, {
    local_ticker: ticker,
    yahoo_symbol: pick.providerSymbol,
    name: pick.name,
    exchange: pick.exchange,
    isin: isin || null,
    quote_currency: pick.currency,
    security_type: pick.quoteType,
    provider: yahoo.PROVIDER_ID,
  });

  bindHolding(db, {
    broker,
    ticker,
    currency,
    isin,
    securityId: secId,
    source: 'auto',
  });

  return { matched: true, securityId: secId, yahooSymbol: pick.providerSymbol, source: 'auto' };
}

function bindFromSearchResult(db, { broker, ticker, currency, isin, providerSymbol, name, exchange, quoteCurrency }) {
  const secId = upsertSecurity(db, {
    local_ticker: ticker,
    yahoo_symbol: providerSymbol,
    name,
    exchange,
    isin,
    quote_currency: quoteCurrency,
    provider: yahoo.PROVIDER_ID,
  });
  bindHolding(db, { broker, ticker, currency, isin, securityId: secId, source: 'manual' });
  return { securityId: secId, yahooSymbol: providerSymbol };
}

function listUnboundOpenHoldings(db, openHoldings) {
  return openHoldings.filter((h) => {
    const b = getBinding(db, h.broker, h.ticker, h.currency);
    return !b?.security_id;
  });
}

module.exports = {
  holdingKey,
  getBinding,
  upsertSecurity,
  bindHolding,
  clearBinding,
  setManualQuantity,
  setManualAvgCostPerShare,
  tryAutoMatch,
  bindFromSearchResult,
  listUnboundOpenHoldings,
  searchSecurities: yahoo.searchSecurities,
};
