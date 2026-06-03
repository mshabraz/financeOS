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
