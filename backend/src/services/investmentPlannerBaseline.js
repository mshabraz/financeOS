/**
 * Load starting balances and contribution history from FinanceOS for the wealth planner.
 */
const { computeHoldings } = require('./investmentHoldings');
const { buildPortfolioValuation } = require('./investmentValuation');

async function getPlannerBaseline(db, options = {}) {
  const { broker = '', tickers = [], excludeCash = false } = options;
  const tickerSet = tickers.length ? new Set(tickers.map((t) => String(t).toUpperCase())) : null;

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

  const portfolioTotal = excludeCash ? holdingsValue : (p.totalPortfolio ?? holdingsValue + cashBalance);

  const bankRow = db.prepare(
    `SELECT SUM(amount) AS total
     FROM account_balances ab1
     WHERE balance_type = 'closing'
       AND id = (
         SELECT id FROM account_balances ab2
         WHERE ab2.account = ab1.account AND ab2.balance_type = 'closing'
         ORDER BY balance_date DESC LIMIT 1
       )`
  ).get();

  const manuals = db.prepare(
    "SELECT key, amount, currency FROM manual_balances WHERE key != 'investment_cash'"
  ).all();
  const manualTotal = manuals.reduce((s, r) => s + (r.amount || 0), 0);
  const bankBalance = bankRow?.total ?? 0;
  const netWorth = bankBalance + manualTotal + portfolioTotal;

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
    netWorth: Math.round(netWorth * 100) / 100,
    bankBalance: Math.round(bankBalance * 100) / 100,
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
