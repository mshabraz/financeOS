/**
 * Shared holdings computation from investment_transactions.
 *
 * Positions are keyed by broker + ticker + currency (ISIN is metadata only).
 * That keeps reopen/import cases from splitting one fund into multiple rows
 * when some historical buys lack an ISIN and newer buys include one.
 *
 * Quantity tracking:
 *  - Pure quantity-based brokers (e.g. Lightyear): rolling open lot with reset on full exit.
 *  - Amount-only fund history (classic Swedbank CSV): cost from cash amounts; qty comes from binding.
 *  - Hybrid (amount-only history + later unit lots): keep one position; fold unit-lot cash into
 *    amount invested and leave displayed quantity to the binding / statement closing balance.
 */

function computeHoldings(db, broker) {
  const EPSILON = 0.000001;
  const params = broker ? [broker] : [];

  const rows = db.prepare(`
    SELECT
      id, broker, ticker, isin, fund_name, currency, type, quantity, net_amount, fee, date, datetime
    FROM investment_transactions
    WHERE ticker IS NOT NULL AND ticker != ''
    ${broker ? 'AND broker = ?' : ''}
    ORDER BY broker, ticker, currency, datetime, id
  `).all(...params);

  const groups = new Map();

  for (const row of rows) {
    const key = [row.broker, row.ticker, row.currency].join('|');
    if (!groups.has(key)) {
      groups.set(key, {
        broker: row.broker,
        ticker: row.ticker,
        isin: row.isin || null,
        fundName: row.fund_name || null,
        currency: row.currency,
        buyCount: 0,
        sellCount: 0,
        lastBuyDate: null,
        lastSellDate: null,
        amountOnlyBuyCount: 0,
        qtyBuyCount: 0,
        totalFees: 0,
        openQty: 0,
        openCostBasis: 0,
        cycleInvested: 0,
        cycleProceeds: 0,
        cycleRealizedPnL: 0,
        amountInvested: 0,
        amountProceeds: 0,
        lastClosedRealizedPnL: 0,
        lastClosedInvested: 0,
        lastClosedProceeds: 0,
      });
    }

    const g = groups.get(key);
    if (!g.fundName && row.fund_name) g.fundName = row.fund_name;
    if (!g.isin && row.isin) g.isin = row.isin;

    if (row.type === 'Buy') {
      g.buyCount += 1;
      g.lastBuyDate = row.date;
      g.totalFees += row.fee || 0;
      if (row.quantity != null) {
        g.qtyBuyCount += 1;
        g.openQty += row.quantity;
        g.openCostBasis += row.net_amount || 0;
        g.cycleInvested += row.net_amount || 0;
      } else {
        g.amountOnlyBuyCount += 1;
        g.amountInvested += row.net_amount || 0;
      }
      continue;
    }

    if (row.type === 'Sell') {
      g.sellCount += 1;
      g.lastSellDate = row.date;
      // Quantity-matched sell only when we still have open unit lots.
      // Classic Swedbank history often has amount-only buys and qty-tagged sells —
      // those must count as amount proceeds or the fund never marks as exited.
      if (row.quantity != null && g.openQty > EPSILON) {
        const prevQty = g.openQty;
        const sellQty = Math.abs(row.quantity || 0);
        const avgCostPerShare = prevQty > EPSILON ? (g.openCostBasis / prevQty) : 0;
        const matchedQty = Math.min(sellQty, prevQty);
        const matchedCostBasis = matchedQty * avgCostPerShare;

        g.cycleProceeds += row.net_amount || 0;
        g.cycleRealizedPnL += (row.net_amount || 0) - matchedCostBasis;
        g.openQty = Math.max(0, prevQty - sellQty);
        g.openCostBasis = Math.max(0, g.openCostBasis - matchedCostBasis);

        if (g.openQty <= EPSILON) {
          g.lastClosedRealizedPnL = g.cycleRealizedPnL;
          g.lastClosedInvested = g.cycleInvested;
          g.lastClosedProceeds = g.cycleProceeds;
          g.openQty = 0;
          g.openCostBasis = 0;
          g.cycleInvested = 0;
          g.cycleProceeds = 0;
          g.cycleRealizedPnL = 0;
        }
      } else {
        g.amountProceeds += row.net_amount || 0;
      }
    }
  }

  return [...groups.values()]
    .filter((g) => g.buyCount > 0 || g.sellCount > 0)
    .map((g) => {
      const hybrid = g.amountOnlyBuyCount > 0 && g.qtyBuyCount > 0;
      const quantityBased = !hybrid && g.qtyBuyCount > 0;

      let netQty;
      let avgCostPerShare;
      let currentCostBasis;
      let realizedPnL;
      let totalInvested;
      let totalProceeds;
      let fullyExited;

      if (hybrid) {
        // One fund position: cash from both amount-only and unit-lot buys.
        // Displayed share count comes from security binding / statement closing qty.
        const qtyInvested = g.openCostBasis || 0;
        const investedMerged = (g.amountInvested || 0) + qtyInvested;
        const proceeds = (g.amountProceeds || 0) + (g.cycleProceeds || 0);
        const coverage = investedMerged > 0 ? proceeds / investedMerged : 0;
        fullyExited = proceeds > 0 && coverage >= 0.80 && g.openQty <= EPSILON;
        netQty = null;
        avgCostPerShare = null;
        currentCostBasis = fullyExited ? 0 : Math.max(0, investedMerged - proceeds);
        realizedPnL = fullyExited ? proceeds - investedMerged : 0;
        totalInvested = investedMerged;
        totalProceeds = proceeds;
      } else if (quantityBased) {
        fullyExited = g.openQty <= EPSILON;
        netQty = fullyExited ? 0 : g.openQty;
        avgCostPerShare = !fullyExited && g.openQty > EPSILON
          ? g.openCostBasis / g.openQty
          : null;
        currentCostBasis = fullyExited ? 0 : g.openCostBasis;
        realizedPnL = fullyExited ? g.lastClosedRealizedPnL : g.cycleRealizedPnL;
        totalInvested = fullyExited ? g.lastClosedInvested : g.cycleInvested;
        totalProceeds = fullyExited ? g.lastClosedProceeds : g.cycleProceeds;
      } else {
        const invested = g.amountInvested || 0;
        const proceeds = g.amountProceeds || 0;
        const coverage = invested > 0 ? proceeds / invested : 0;
        fullyExited = proceeds > 0 && coverage >= 0.80;
        netQty = null;
        avgCostPerShare = null;
        currentCostBasis = fullyExited ? 0 : Math.max(0, invested - proceeds);
        realizedPnL = fullyExited ? proceeds - invested : 0;
        totalInvested = invested;
        totalProceeds = proceeds;
      }

      return {
        broker: g.broker,
        ticker: g.ticker,
        isin: g.isin,
        fundName: g.fundName,
        currency: g.currency,
        quantityBased,
        hybridAmountAndQuantity: hybrid,
        quantity: netQty,
        avgCostPerShare,
        totalCostBasis: currentCostBasis,
        totalInvested,
        realizedPnL,
        totalProceeds,
        lastBuyDate: g.lastBuyDate,
        lastSellDate: g.lastSellDate,
        buyCount: g.buyCount,
        sellCount: g.sellCount,
        fullyExited,
      };
    });
}

function computeCashByCurrency(db, broker) {
  const params = broker ? [broker] : [];
  return db.prepare(`
    SELECT broker, currency, SUM(net_amount) AS cashBalance
    FROM investment_transactions
    WHERE type NOT IN ('Conversion')
    ${broker ? 'AND broker = ?' : ''}
    GROUP BY broker, currency
    HAVING ABS(SUM(net_amount)) > 0.0001
  `).all(...params);
}

module.exports = { computeHoldings, computeCashByCurrency };
