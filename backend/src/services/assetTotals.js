/**
 * Single source of truth for total assets / net worth (matches Dashboard "Total assets").
 * Bank and Revolut balances prefer live Enable Banking figures; fall back to CSV-derived data.
 */
const { buildPortfolioValuation } = require('./investmentValuation');
const { getRevolutExpenseSplitRatio } = require('./revolutCalculations');
const { isRevolutConnection } = require('./openBanking/connectionBalances');

function latestBankBalance(db) {
  const bankRow = db.prepare(
    `SELECT SUM(amount) AS total
     FROM account_balances ab1
     WHERE balance_type = 'closing'
       AND id = (
         SELECT id FROM account_balances ab2
         WHERE ab2.account = ab1.account AND ab2.balance_type = 'closing'
         ORDER BY balance_date DESC LIMIT 1
       )`,
  ).get();
  return bankRow?.total ?? 0;
}

function sumOpenBankingBalances(db, { revolut }) {
  const rows = db.prepare(
    `SELECT aspsp_name, balance_amount, balance_as_of, balance_currency
     FROM bank_connections
     WHERE balance_amount IS NOT NULL`,
  ).all();

  let total = 0;
  let latestDate = null;
  let currency = 'EUR';
  let count = 0;

  for (const row of rows) {
    const isRev = isRevolutConnection(row);
    if (revolut !== isRev) continue;
    total += row.balance_amount;
    count += 1;
    if (row.balance_currency) currency = row.balance_currency;
    const d = row.balance_as_of?.slice(0, 10) || null;
    if (d && (!latestDate || d > latestDate)) latestDate = d;
  }

  return {
    total: Math.round(total * 100) / 100,
    date: latestDate,
    currency,
    count,
  };
}

function hasOpenBankingConnections(db, { revolut }) {
  const rows = db.prepare('SELECT aspsp_name FROM bank_connections').all();
  return rows.some((r) => isRevolutConnection(r) === revolut);
}

function latestRevolutStatementBalance(db) {
  const row = db.prepare(
    `SELECT balance_after, date, product, currency
     FROM revolut_transactions
     WHERE balance_after IS NOT NULL
     ORDER BY COALESCE(completed_datetime, date) DESC, id DESC
     LIMIT 1`,
  ).get();
  if (!row || row.balance_after == null) return null;
  return {
    amount: row.balance_after,
    date: row.date,
    product: row.product,
    currency: row.currency || 'EUR',
    source: 'revolut_statement',
  };
}

/**
 * @param {import('better-sqlite3').Database} db
 */
async function computeAssetTotals(db) {
  const splitRatio = getRevolutExpenseSplitRatio(db);

  const obBank = sumOpenBankingBalances(db, { revolut: false });
  const obRevolut = sumOpenBankingBalances(db, { revolut: true });
  const statementRevolut = latestRevolutStatementBalance(db);

  let bankBalance;
  let bankBalanceSource;
  let bankBalanceDate = null;
  if (obBank.count > 0) {
    bankBalance = obBank.total;
    bankBalanceSource = 'open_banking';
    bankBalanceDate = obBank.date;
  } else if (hasOpenBankingConnections(db, { revolut: false })) {
    bankBalance = 0;
    bankBalanceSource = 'open_banking_pending';
  } else {
    bankBalance = latestBankBalance(db);
    bankBalanceSource = 'csv';
  }

  let revolutClosingBalance = null;
  let revolutBalanceDate = null;
  let revolutProduct = null;
  let revolutBalanceSource = null;

  if (obRevolut.count > 0) {
    revolutClosingBalance = obRevolut.total;
    revolutBalanceDate = obRevolut.date;
    revolutBalanceSource = 'open_banking';
  } else if (hasOpenBankingConnections(db, { revolut: true })) {
    revolutClosingBalance = null;
    revolutBalanceSource = 'open_banking_pending';
  } else if (statementRevolut) {
    revolutClosingBalance = statementRevolut.amount;
    revolutBalanceDate = statementRevolut.date;
    revolutProduct = statementRevolut.product;
    revolutBalanceSource = statementRevolut.source;
  }

  // Net worth uses full bank balances (not the 50% expense split).
  const revolutBalanceForAssets = revolutClosingBalance ?? 0;

  const allManuals = db.prepare('SELECT key, label, icon, amount, currency FROM manual_balances').all();
  const manuals = allManuals.filter((r) => r.key !== 'investment_cash');

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
  const totalAssets = bankBalance + manualTotal + revolutBalanceForAssets;

  return {
    bankBalance: Math.round(bankBalance * 100) / 100,
    bankBalanceSource,
    bankBalanceDate,
    manualTotal: Math.round(manualTotal * 100) / 100,
    revolutClosingBalance:
      revolutClosingBalance != null ? Math.round(revolutClosingBalance * 100) / 100 : null,
    revolutSharedAsset:
      revolutClosingBalance != null ? Math.round(revolutClosingBalance * 100) / 100 : 0,
    revolutBalanceDate,
    revolutProduct,
    revolutBalanceSource,
    totalAssets: Math.round(totalAssets * 100) / 100,
    investmentPortfolio,
    manuals: manualsWithPortfolio,
    revolutSplitRatio: splitRatio,
  };
}

module.exports = { computeAssetTotals, latestBankBalance };
