/**
 * Load starting balances and contribution history from FinanceOS for the wealth planner.
 */
const { buildPortfolioValuation } = require('./investmentValuation');
const { computeAssetTotals } = require('./assetTotals');

function parseHoldingKeys(tickers = []) {
  return tickers.map((raw) => {
    const s = String(raw || '').trim();
    const idx = s.indexOf(':');
    if (idx === -1) {
      return { key: s.toUpperCase(), broker: '', ticker: s.toUpperCase() };
    }
    return {
      key: s,
      broker: s.slice(0, idx),
      ticker: s.slice(idx + 1).toUpperCase(),
    };
  });
}

function holdingKey(h) {
  return `${h.broker}:${String(h.ticker || '').toUpperCase()}`;
}

function mapOpenHolding(h) {
  const mv = h.marketValueEur ?? h.totalCostBasis ?? 0;
  return {
    broker: h.broker,
    ticker: h.ticker,
    currency: h.currency || 'EUR',
    quantity: h.effectiveQuantity ?? h.quantity ?? null,
    marketValueEur: Math.round(mv * 100) / 100,
    fundName: h.fundName || h.binding?.securityName || null,
    key: holdingKey(h),
  };
}

async function getPlannerBaseline(db, options = {}) {
  const { broker = '', tickers = [], excludeCash = false } = options;
  const holdingKeys = parseHoldingKeys(tickers);
  const keySet = holdingKeys.length ? new Set(holdingKeys.map((k) => k.key)) : null;

  const assets = await computeAssetTotals(db);

  let valuation = null;
  try {
    valuation = await buildPortfolioValuation(db, broker || '');
  } catch {
    valuation = { primary: {}, openHoldings: [], brokerCash: { totalEur: 0, rows: [] } };
  }

  const openHoldingsRaw = (valuation.openHoldings || []).filter(
    (h) => h.ticker && (h.marketValueEur > 0 || h.totalCostBasis > 0 || (h.effectiveQuantity ?? h.quantity) > 0)
  );
  const openHoldings = openHoldingsRaw.map(mapOpenHolding);

  const p = valuation.primary || {};
  let holdingsValue = p.holdingsValue ?? 0;
  let cashBalance = p.cashBalance ?? valuation.manualCash?.amountEur ?? 0;

  if (keySet && openHoldingsRaw.length) {
    holdingsValue = openHoldingsRaw
      .filter((h) => keySet.has(holdingKey(h)))
      .reduce((s, h) => s + (h.marketValueEur ?? h.totalCostBasis ?? 0), 0);
    cashBalance = 0;
  }

  const portfolioTotal = excludeCash
    ? holdingsValue
    : (p.totalPortfolio ?? holdingsValue + cashBalance);

  // Match Dashboard "Total assets" — never add portfolio on top of manual "investments" row
  const totalAssets = assets.totalAssets;
  const netWorth = totalAssets;

  const { queryMonthlyNetSavings, averagePositiveMonthlyNetSavings } = require('./netSavingsAnalytics');
  const netSavingsHistory = queryMonthlyNetSavings(db, { months: 36 });
  const contribHistory = netSavingsHistory.map((r) => ({
    month: r.month,
    contributed: r.netSavings,
  }));
  const avgMonthlyContribution = averagePositiveMonthlyNetSavings(db, 36);

  const dividendAnnual = db.prepare(`
    SELECT SUM(net_amount) AS total
    FROM investment_transactions
    WHERE type = 'Dividend' AND date >= date('now', '-12 months')
    ${broker ? 'AND broker = ?' : ''}
  `).get(...(broker ? [broker] : []))?.total ?? 0;

  const brokers = db.prepare(`
    SELECT DISTINCT broker FROM investment_transactions
    WHERE broker IS NOT NULL AND broker != ''
    ORDER BY broker
  `).all().map((r) => r.broker);

  const filteredHoldings = broker
    ? openHoldings.filter((h) => h.broker === broker)
    : openHoldings;

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
    openHoldings: filteredHoldings,
    brokers,
    openPositions: openHoldings.length,
    lastPriceUpdate: valuation.sync?.last_success_at ?? null,
  };
}

module.exports = { getPlannerBaseline };
