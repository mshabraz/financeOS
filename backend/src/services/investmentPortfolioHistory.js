/**
 * Portfolio value over time: price history backfill + quantity-aware valuation.
 */

const yahoo = require('./marketData/yahooProvider');
const { convertToEur } = require('./fxRates');
const { getBinding } = require('./investmentSecurities');
function periodStartDateBase(period) {
  const now = new Date();
  if (period === 'ALL') return null;
  if (period === 'YTD') return `${now.getFullYear()}-01-01`;
  const days = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365 }[period] || 365;
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function periodMinHistoryDays(period) {
  return { '1M': 15, '3M': 45, '6M': 90, 'YTD': 60, '1Y': 200, ALL: 400 }[period] || 200;
}

function periodStartDate(period, db) {
  if (period !== 'ALL') return periodStartDateBase(period);
  const firstTx = db
    .prepare(`SELECT MIN(date) AS d FROM investment_transactions WHERE date IS NOT NULL`)
    .get()?.d;
  const d = new Date();
  d.setDate(d.getDate() - 900);
  const cap = d.toISOString().slice(0, 10);
  if (firstTx && firstTx < cap) return firstTx;
  return cap;
}

function getHistoryCoverage(db, securityId, periodStart) {
  const stats = db
    .prepare(
      `SELECT COUNT(*) AS c, MIN(price_date) AS minD, MAX(price_date) AS maxD
       FROM market_price_history WHERE security_id = ?`
    )
    .get(securityId);
  if (!stats?.c || stats.c < 5) return { sufficient: false, count: stats?.c || 0 };
  if (periodStart && stats.minD && stats.minD > periodStart) {
    return { sufficient: false, count: stats.c, minD: stats.minD };
  }
  return { sufficient: true, count: stats.c, minD: stats.minD, maxD: stats.maxD };
}

async function backfillPriceHistory(db, securityId, yahooSymbol, period) {
  const start = periodStartDate(period, db);
  const minDays = periodMinHistoryDays(period);
  const cov = getHistoryCoverage(db, securityId, start);

  if (cov.sufficient && cov.count >= minDays) return;

  const rows = await yahoo.fetchHistoricalPrices(yahooSymbol, period);
  if (!rows.length) return;

  const stmt = db.prepare(
    `INSERT INTO market_price_history (security_id, price, currency, price_date, fetched_at, source)
     VALUES (?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT(security_id, price_date) DO UPDATE SET
       price = excluded.price,
       currency = excluded.currency,
       fetched_at = excluded.fetched_at`
  );

  for (const row of rows) {
    stmt.run(securityId, row.price, row.currency, row.priceDate, yahoo.PROVIDER_ID);
  }
}

async function ensurePriceHistories(db, openHoldings, period) {
  const seen = new Set();
  for (const h of openHoldings) {
    const binding = getBinding(db, h.broker, h.ticker, h.currency);
    const securityId = binding?.security_id ?? h.binding?.securityId;
    const yahooSymbol = binding?.yahoo_symbol ?? h.binding?.yahooSymbol;
    const qty =
      h.effectiveQuantity ??
      binding?.manual_quantity ??
      (h.quantityBased && h.quantity > 0 ? h.quantity : null);

    if (!securityId || !yahooSymbol) continue;
    if (!qty && !(h.marketValueEur > 0)) continue;
    if (seen.has(securityId)) continue;
    seen.add(securityId);

    try {
      await backfillPriceHistory(db, securityId, yahooSymbol, period);
      await new Promise((r) => setTimeout(r, 150));
    } catch {
      /* continue */
    }
  }
}

function quantityOnDate(db, broker, ticker, currency, asOfDate, manualQty) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(
         CASE WHEN type = 'Buy' THEN quantity
              WHEN type = 'Sell' THEN -quantity
              ELSE 0 END
       ), 0) AS qty
       FROM investment_transactions
       WHERE broker = ? AND ticker = ? AND currency = ?
         AND date <= ? AND quantity IS NOT NULL AND quantity > 0`
    )
    .get(broker, ticker, currency, asOfDate);

  const q = Number(row?.qty) || 0;
  if (q > 0.000001) return q;
  if (manualQty != null && manualQty > 0) return manualQty;
  return null;
}

function priceOnOrBefore(rows, date) {
  if (!rows?.length) return null;
  let last = null;
  for (const r of rows) {
    if (r.price_date > date) break;
    last = r;
  }
  return last;
}

function buildDateRange(startDate, endDate) {
  const out = [];
  const d = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function holdingValueOnDate(h, ctx, priceRow, latestPriceRow, perEur) {
  if (!priceRow?.price) return 0;
  const priceEur = convertToEur(priceRow.price, priceRow.currency, perEur);
  if (priceEur == null || priceEur <= 0) return 0;

  if (ctx.quantity != null && ctx.quantity > 0) {
    return ctx.quantity * priceEur;
  }

  const latestNative = latestPriceRow?.price ?? h.latestPriceNative ?? h.latestPrice;
  const latestEur = convertToEur(latestNative, priceRow.currency || h.priceCurrency, perEur);
  const mv = h.marketValueEur ?? 0;
  if (mv > 0 && latestEur > 0) {
    return mv * (priceEur / latestEur);
  }
  return 0;
}

function buildPortfolioHistory(db, openHoldings, period, cashEur, perEur) {
  const today = new Date().toISOString().slice(0, 10);
  const start = periodStartDate(period, db);

  const priced = openHoldings.filter((h) => {
    const binding = getBinding(db, h.broker, h.ticker, h.currency);
    const securityId = binding?.security_id ?? h.binding?.securityId;
    const hasValue = (h.marketValueEur ?? 0) > 0 || h.priceStatus === 'ok';
    return securityId && hasValue;
  });

  if (!priced.length) return [];

  const histories = {};
  const latestBySecurity = {};
  const holdingCtx = new Map();

  for (const h of priced) {
    const binding = getBinding(db, h.broker, h.ticker, h.currency);
    const sid = binding?.security_id ?? h.binding?.securityId;
    if (!sid || histories[sid]) continue;

    const rows = start
      ? db
          .prepare(
            `SELECT price_date, price, currency FROM market_price_history
             WHERE security_id = ? AND price_date >= ? ORDER BY price_date`
          )
          .all(sid, start)
      : db
          .prepare(
            `SELECT price_date, price, currency FROM market_price_history
             WHERE security_id = ? ORDER BY price_date`
          )
          .all(sid);

    histories[sid] = rows;
    latestBySecurity[sid] = rows.length ? rows[rows.length - 1] : null;

    const manualQty = binding?.manual_quantity ?? null;
    holdingCtx.set(`${h.broker}:${h.ticker}:${h.currency}`, {
      securityId: sid,
      manualQty,
      binding,
    });
  }

  const hasEnoughPrices = Object.values(histories).some((r) => r.length >= 5);
  if (!hasEnoughPrices) {
    let marketNow = 0;
    let costNow = 0;
    for (const h of priced) {
      marketNow += h.marketValueEur ?? 0;
      costNow += h.costBasisEur ?? 0;
    }
    const startD =
      start ||
      (() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().slice(0, 10);
      })();
    return [
      {
        date: startD,
        portfolioValue: Math.round((costNow + cashEur) * 100) / 100,
        holdingsValue: Math.round(costNow * 100) / 100,
        investedCapital: Math.round(costNow * 100) / 100,
        cash: cashEur,
      },
      {
        date: today,
        portfolioValue: Math.round((marketNow + cashEur) * 100) / 100,
        holdingsValue: Math.round(marketNow * 100) / 100,
        investedCapital: Math.round(costNow * 100) / 100,
        cash: cashEur,
      },
    ];
  }

  const effectiveStart =
    start ||
    Object.values(histories)
      .map((r) => r[0]?.price_date)
      .filter(Boolean)
      .sort()[0] ||
    today;

  const dates = buildDateRange(effectiveStart, today);
  if (dates.length > 400) {
    // Downsample to ~3 points per week for very long ranges
    const step = Math.ceil(dates.length / 260);
    const sampled = dates.filter((_, i) => i % step === 0 || i === dates.length - 1);
    dates.length = 0;
    dates.push(...sampled);
  }

  const investedByMonth = db
    .prepare(
      `SELECT strftime('%Y-%m', date) AS month,
              SUM(CASE WHEN type='Buy' THEN net_amount ELSE 0 END) AS bought
       FROM investment_transactions
       GROUP BY month ORDER BY month`
    )
    .all();

  let cumulativeInvested = 0;
  let idx = 0;

  return dates.map((date) => {
    const month = date.slice(0, 7);
    while (idx < investedByMonth.length && investedByMonth[idx].month <= month) {
      cumulativeInvested += investedByMonth[idx].bought || 0;
      idx += 1;
    }

    let holdingsValueEur = 0;
    for (const h of priced) {
      const key = `${h.broker}:${h.ticker}:${h.currency}`;
      const ctx = holdingCtx.get(key);
      if (!ctx) continue;

      const rows = histories[ctx.securityId] || [];
      const priceRow = priceOnOrBefore(rows, date);
      if (!priceRow) continue;

      const qty = quantityOnDate(
        db,
        h.broker,
        h.ticker,
        h.currency,
        date,
        null
      );

      const isAmountBasedFund = !h.quantityBased && (h.marketValueEur ?? 0) > 0;
      if (qty != null && qty > 0) {
        holdingsValueEur += holdingValueOnDate(
          h,
          { ...ctx, quantity: qty },
          priceRow,
          latestBySecurity[ctx.securityId],
          perEur
        );
      } else if (isAmountBasedFund) {
        holdingsValueEur += holdingValueOnDate(
          h,
          { ...ctx, quantity: null },
          priceRow,
          latestBySecurity[ctx.securityId],
          perEur
        );
      } else if (ctx.manualQty > 0) {
        holdingsValueEur += holdingValueOnDate(
          h,
          { ...ctx, quantity: ctx.manualQty },
          priceRow,
          latestBySecurity[ctx.securityId],
          perEur
        );
      }
    }

    return {
      date,
      portfolioValue: Math.round((holdingsValueEur + cashEur) * 100) / 100,
      holdingsValue: Math.round(holdingsValueEur * 100) / 100,
      investedCapital: Math.round(cumulativeInvested * 100) / 100,
      cash: cashEur,
    };
  });
}

module.exports = {
  ensurePriceHistories,
  buildPortfolioHistory,
  backfillPriceHistory,
  periodStartDate,
};
