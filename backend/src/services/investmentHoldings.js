/**
 * Shared holdings computation from investment_transactions.
 */

function computeHoldings(db, broker) {
  const params = broker ? [broker] : [];

  const rows = db.prepare(`
    SELECT
      broker, ticker, isin, fund_name, currency,
      SUM(CASE WHEN type='Buy'  THEN quantity ELSE 0 END) AS totalBought,
      SUM(CASE WHEN type='Sell' THEN quantity ELSE 0 END) AS totalSold,
      SUM(CASE WHEN type='Buy'  THEN net_amount ELSE 0 END) AS totalCostBasis,
      SUM(CASE WHEN type='Sell' THEN net_amount ELSE 0 END) AS totalProceeds,
      SUM(CASE WHEN type='Buy'  THEN fee ELSE 0 END) AS totalFees,
      COUNT(CASE WHEN type='Buy' AND quantity IS NOT NULL THEN 1 END) AS buyQtyCount,
      MAX(CASE WHEN type='Buy'  THEN date ELSE NULL END) AS lastBuyDate,
      MAX(CASE WHEN type='Sell' THEN date ELSE NULL END) AS lastSellDate,
      COUNT(CASE WHEN type='Buy'  THEN 1 END) AS buyCount,
      COUNT(CASE WHEN type='Sell' THEN 1 END) AS sellCount
    FROM investment_transactions
    WHERE ticker IS NOT NULL AND ticker != ''
    ${broker ? 'AND broker = ?' : ''}
    GROUP BY broker, ticker, isin, currency
    ORDER BY totalCostBasis DESC
  `).all(...params);

  return rows
    .filter((r) => (r.buyCount || 0) > 0 || (r.sellCount || 0) > 0)
    .map((r) => {
      const quantityBased = (r.buyQtyCount || 0) > 0;
      let netQty, avgCostPerShare, currentCostBasis, realizedPnL, fullyExited;

      if (quantityBased) {
        netQty = Math.max(0, (r.totalBought || 0) - (r.totalSold || 0));
        avgCostPerShare = r.totalBought > 0 ? r.totalCostBasis / r.totalBought : 0;
        currentCostBasis = netQty * avgCostPerShare;
        const soldCostBasis =
          r.totalSold > 0 && r.totalBought > 0
            ? (r.totalSold / r.totalBought) * r.totalCostBasis
            : 0;
        realizedPnL = (r.totalProceeds || 0) - soldCostBasis;
        fullyExited = netQty <= 0.000001;
      } else {
        const invested = r.totalCostBasis || 0;
        const proceeds = r.totalProceeds || 0;
        const coverage = invested > 0 ? proceeds / invested : 0;
        fullyExited = proceeds > 0 && coverage >= 0.80;
        netQty = null;
        avgCostPerShare = null;
        currentCostBasis = fullyExited ? 0 : Math.max(0, invested - proceeds);
        realizedPnL = fullyExited ? proceeds - invested : 0;
      }

      return {
        broker: r.broker,
        ticker: r.ticker,
        isin: r.isin,
        fundName: r.fund_name,
        currency: r.currency,
        quantityBased,
        quantity: netQty,
        avgCostPerShare,
        totalCostBasis: currentCostBasis,
        totalInvested: r.totalCostBasis || 0,
        realizedPnL,
        totalProceeds: r.totalProceeds || 0,
        lastBuyDate: r.lastBuyDate,
        lastSellDate: r.lastSellDate,
        buyCount: r.buyCount,
        sellCount: r.sellCount,
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
