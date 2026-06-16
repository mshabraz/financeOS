/**
 * Income runway and essential vs variable expense analytics.
 */

const { computeAssetTotals } = require('./assetTotals');
const { ANALYTICS_LEDGER_SQL, wherePeriodUnified } = require('./unifiedLedger');
const { sqlExpenseAmountCase } = require('./categoryAnalytics');
const { applyDefaultExpenseTiers } = require('./essentialExpenseTiers');

const LOOKBACK_MONTHS = 3;

function ensureExpenseTierColumn(db) {
  const cols = db.prepare('PRAGMA table_info(categories)').all();
  if (!cols.some((c) => c.name === 'expense_tier')) {
    db.exec('ALTER TABLE categories ADD COLUMN expense_tier TEXT');
    applyDefaultExpenseTiers(db);
  }
}

function tierExpenseSumSql(tier) {
  const amt = sqlExpenseAmountCase('u', 'c');
  return `SUM(CASE
    WHEN c.type = 'expense' AND c.is_default = 0 AND c.expense_tier = '${tier}'
    THEN (${amt}) ELSE 0 END)`;
}

function unclassifiedExpenseSumSql() {
  const amt = sqlExpenseAmountCase('u', 'c');
  return `SUM(CASE
    WHEN c.type = 'expense' AND c.is_default = 0
      AND (c.expense_tier IS NULL OR c.expense_tier = '')
    THEN (${amt}) ELSE 0 END)`;
}

function monthlyEssentialTotals(db, months = LOOKBACK_MONTHS) {
  const rows = db.prepare(
    `SELECT
       strftime('%Y-%m', u.date) AS month,
       ${tierExpenseSumSql('essential')} AS essential
     FROM (${ANALYTICS_LEDGER_SQL}) u
     LEFT JOIN categories c ON c.id = u.category_id
     WHERE u.date >= date('now', '-' || ? || ' months')
     GROUP BY month
     HAVING essential > 0
     ORDER BY month DESC`,
  ).all(months);

  return rows.map((r) => ({
    month: r.month,
    essential: Math.round((r.essential || 0) * 100) / 100,
  }));
}

function averageMonthlyEssential(db, months = LOOKBACK_MONTHS) {
  const totals = monthlyEssentialTotals(db, months);
  if (!totals.length) return { average: 0, monthsUsed: 0, monthly: totals };
  const sum = totals.reduce((s, r) => s + r.essential, 0);
  return {
    average: Math.round((sum / totals.length) * 100) / 100,
    monthsUsed: totals.length,
    monthly: totals,
  };
}

function periodTierBreakdown(db, dateFrom, dateTo) {
  const filter = wherePeriodUnified(dateFrom, dateTo);
  const row = db.prepare(
    `SELECT
       ${tierExpenseSumSql('essential')} AS essential,
       ${tierExpenseSumSql('variable')} AS variable,
       ${unclassifiedExpenseSumSql()} AS unclassified
     FROM (${ANALYTICS_LEDGER_SQL}) u
     LEFT JOIN categories c ON c.id = u.category_id
     WHERE 1=1 ${filter}`,
  ).get();

  const essential = Math.round((row?.essential || 0) * 100) / 100;
  const variable = Math.round(((row?.variable || 0) + (row?.unclassified || 0)) * 100) / 100;
  const total = essential + variable;

  return {
    essential,
    variable,
    unclassified: Math.round((row?.unclassified || 0) * 100) / 100,
    total,
    essentialPct: total > 0 ? Math.round((essential / total) * 1000) / 10 : 0,
    variablePct: total > 0 ? Math.round((variable / total) * 1000) / 10 : 0,
  };
}

async function computeEssentialMetrics(db, { dateFrom = null, dateTo = null } = {}) {
  ensureExpenseTierColumn(db);
  const assets = await computeAssetTotals(db);
  const bank = assets.bankBalance ?? 0;
  const revolut = assets.revolutClosingBalance ?? 0;
  const portfolio = assets.investmentPortfolio?.totalPortfolio ?? 0;
  const liquidAssets = Math.round((bank + revolut + portfolio) * 100) / 100;

  const { average: monthlyEssentialExpenses, monthsUsed, monthly } = averageMonthlyEssential(db);

  const incomeRunwayMonths =
    monthlyEssentialExpenses > 0
      ? Math.round((liquidAssets / monthlyEssentialExpenses) * 10) / 10
      : null;

  const period = periodTierBreakdown(db, dateFrom, dateTo);

  const byCategory = db.prepare(
    `SELECT c.id, c.name, c.icon, c.color, c.expense_tier,
       SUM(${sqlExpenseAmountCase('u', 'c')}) AS total
     FROM (${ANALYTICS_LEDGER_SQL}) u
     JOIN categories c ON c.id = u.category_id
     WHERE c.type = 'expense' AND c.is_default = 0 ${wherePeriodUnified(dateFrom, dateTo)}
     GROUP BY c.id
     HAVING total > 0
     ORDER BY total DESC`,
  ).all();

  return {
    liquidAssets,
    bankBalance: bank,
    revolutBalance: revolut,
    investmentsTotal: portfolio,
    monthlyEssentialExpenses,
    lookbackMonths: monthsUsed,
    monthlyEssentialHistory: monthly,
    incomeRunwayMonths,
    period,
    byCategory: byCategory.map((r) => ({
      ...r,
      total: Math.round((r.total || 0) * 100) / 100,
    })),
    dateFrom,
    dateTo,
  };
}

module.exports = {
  LOOKBACK_MONTHS,
  averageMonthlyEssential,
  periodTierBreakdown,
  computeEssentialMetrics,
};
