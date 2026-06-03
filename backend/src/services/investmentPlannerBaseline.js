/**
 * Load starting balances and contribution history from FinanceOS for the wealth planner.
 */
const { buildPortfolioValuation } = require('./investmentValuation');
const { computeAssetTotals } = require('./assetTotals');

async function getPlannerBaseline(db, options = {}) {
  const { broker = '', tickers = [], excludeCash = false } = options;
  const tickerSet = tickers.length ? new Set(tickers.map((t) => String(t).toUpperCase())) : null;

  const assets = await computeAssetTotals(db);

  let valuation = null;
  try {
    valuation = await buildPortfolioValuation(db, broker || '');
  } catch {
    valuation = { primary: {}, openHoldings: [], brokerCash: { totalEur: 0, rows: [] } };
  }

  const p = valuation.primary || {};
  let holdingsValue = p.holdingsValue ?? 0;
  let cashBalance = p.cashBalance ?? valuation.manualCash?.amountEur ?? 0;

  if (tickerSet && valuation.openHoldings) {
    holdingsValue = valuation.openHoldings
      .filter((h) => tickerSet.has(String(h.ticker || '').toUpperCase()))
      .reduce((s, h) => s + (h.marketValueEur ?? h.totalCostBasis ?? 0), 0);
    cashBalance = 0;
  }

  const portfolioTotal = excludeCash
    ? holdingsValue
    : (p.totalPortfolio ?? holdingsValue + cashBalance);

  // Match Dashboard "Total assets" — never add portfolio on top of manual "investments" row
  const totalAssets = assets.totalAssets;
  const netWorth = totalAssets;

  const contribHistory = db.prepare(`
    SELECT strftime('%Y-%m', date) AS month,
           SUM(CASE WHEN type IN ('Buy','Deposit') THEN ABS(net_amount) ELSE 0 END) AS contributed
    FROM investment_transactions
    ${broker ? 'WHERE broker = ?' : ''}
    GROUP BY month
    ORDER BY month DESC
    LIMIT 36
  `).all(...(broker ? [broker] : []));

  const avgMonthlyContribution = (() => {
    const rows = contribHistory.filter((r) => r.contributed > 0);
    if (!rows.length) return 0;
    const sum = rows.reduce((s, r) => s + r.contributed, 0);
    return Math.round((sum / rows.length) * 100) / 100;
  })();

  const dividendAnnual = db.prepare(`
    SELECT SUM(net_amount) AS total
    FROM investment_transactions
    WHERE type = 'Dividend' AND date >= date('now', '-12 months')
    ${broker ? 'AND broker = ?' : ''}
  `).get(...(broker ? [broker] : []))?.total ?? 0;

  const tickersList = db.prepare(`
    SELECT DISTINCT broker, ticker, currency
    FROM investment_transactions
    WHERE ticker IS NOT NULL AND ticker != ''
    ${broker ? 'AND broker = ?' : ''}
    ORDER BY ticker
  `).all(...(broker ? [broker] : []));

  const brokers = db.prepare(`
    SELECT DISTINCT broker FROM investment_transactions ORDER BY broker
  `).all().map((r) => r.broker);

  return {
    currency: 'EUR',
    portfolioTotal: Math.round(portfolioTotal * 100) / 100,
    holdingsValue: Math.round(holdingsValue * 100) / 100,
    cashBalance: Math.round(cashBalance * 100) / 100,
    totalAssets,
    netWorth,
    bankBalance: assets.bankBalance,
    manualAssetsTotal: assets.manualTotal,
    revolutSharedAsset: assets.revolutSharedAsset,
    avgMonthlyContribution,
    dividendTrailing12m: Math.round(dividendAnnual * 100) / 100,
    contributionHistory: contribHistory.reverse(),
    tickers: tickersList,
    brokers,
    openPositions: valuation.openHoldings?.length ?? 0,
    lastPriceUpdate: valuation.sync?.last_success_at ?? null,
  };
}

module.exports = { getPlannerBaseline };
