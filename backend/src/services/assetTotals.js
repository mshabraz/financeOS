/**
 * Single source of truth for total assets / net worth (matches Dashboard "Total assets").
 */
const { buildPortfolioValuation } = require('./investmentValuation');
const { getRevolutExpenseSplitRatio } = require('./revolutCalculations');

function latestBankBalance(db) {
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
  return bankRow?.total ?? 0;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @returns {Promise<{
 *   bankBalance: number,
 *   manualTotal: number,
 *   revolutSharedAsset: number,
 *   totalAssets: number,
 *   investmentPortfolio: object|null,
 *   manuals: Array,
 * }>}
 */
async function computeAssetTotals(db) {
  const bankBalance = latestBankBalance(db);

  const allManuals = db.prepare('SELECT key, label, icon, amount, currency FROM manual_balances').all();
  const manuals = allManuals.filter((r) => r.key !== 'investment_cash');

  const revolutLatest = db.prepare(
    `SELECT balance_after, date, product, currency
     FROM revolut_transactions
     WHERE balance_after IS NOT NULL
     ORDER BY COALESCE(completed_datetime, date) DESC, id DESC
     LIMIT 1`
  ).get();

  const splitRatio = getRevolutExpenseSplitRatio(db);
  const revolutClosingBalance = revolutLatest?.balance_after ?? null;
  const revolutSharedAsset =
    revolutClosingBalance != null ? Math.round(revolutClosingBalance * splitRatio * 100) / 100 : 0;

  let investmentPortfolio = null;
  try {
    const val = await buildPortfolioValuation(db);
    const p = val.primary || {};
    investmentPortfolio = {
      holdingsValue: p.holdingsValue ?? 0,
      cashBalance: p.cashBalance ?? val.manualCash?.amountEur ?? 0,
      totalPortfolio: p.totalPortfolio ?? (p.holdingsValue ?? 0) + (p.cashBalance ?? 0),
    };
  } catch {
    investmentPortfolio = null;
  }

  const manualsWithPortfolio = manuals.map((row) => {
    if (row.key !== 'investments' || !investmentPortfolio) return row;
    return {
      ...row,
      amount: investmentPortfolio.totalPortfolio,
      computed: true,
    };
  });

  const manualTotal = manualsWithPortfolio.reduce((s, r) => s + (r.amount || 0), 0);
  const totalAssets = bankBalance + manualTotal + revolutSharedAsset;

  return {
    bankBalance: Math.round(bankBalance * 100) / 100,
    manualTotal: Math.round(manualTotal * 100) / 100,
    revolutSharedAsset: Math.round(revolutSharedAsset * 100) / 100,
    totalAssets: Math.round(totalAssets * 100) / 100,
    investmentPortfolio,
    manuals: manualsWithPortfolio,
    revolutClosingBalance,
    revolutSplitRatio: splitRatio,
  };
}

module.exports = { computeAssetTotals, latestBankBalance };
