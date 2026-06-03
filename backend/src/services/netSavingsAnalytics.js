/**
 * Net savings = net income − net expenses (Analytics / Dashboard).
 * Pension & investment category transfers are excluded from both sides.
 */
const { ANALYTICS_LEDGER_SQL } = require('./unifiedLedger');
const { sqlExpenseAmountCase, sqlIncomeAmountCase } = require('./categoryAnalytics');
const { sanitizeDateParam } = require('../utils/dateParams');

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Monthly rows: { month, income, expenses, netSavings }
 */
function queryMonthlyNetSavings(db, { dateFrom = null, dateTo = null, months = null } = {}) {
  const from = sanitizeDateParam(dateFrom, 'dateFrom');
  const to = sanitizeDateParam(dateTo, 'dateTo');
  const parts = [];
  if (from) parts.push(`u.date >= '${from}'`);
  if (to) parts.push(`u.date <= '${to}'`);
  const where = parts.length ? `WHERE ${parts.join(' AND ')}` : '';

  const limitClause =
    !from && !to && months
      ? `LIMIT ${Math.min(parseInt(months, 10) || 36, 120)}`
      : '';

  const expenseCase = sqlExpenseAmountCase('u', 'c');
  const incomeCase = sqlIncomeAmountCase('u', 'c');

  const rows = db.prepare(
    `SELECT
       strftime('%Y-%m', u.date) AS month,
       MAX(0, SUM(${incomeCase})) AS income,
       MAX(0, SUM(${expenseCase})) AS expenses
     FROM (${ANALYTICS_LEDGER_SQL}) u
     LEFT JOIN categories c ON c.id = u.category_id
     ${where}
     GROUP BY month
     ORDER BY month DESC
     ${limitClause}`
  ).all();

  return rows
    .map((r) => ({
      month: r.month,
      income: round2(r.income || 0),
      expenses: round2(r.expenses || 0),
      netSavings: round2((r.income || 0) - (r.expenses || 0)),
    }))
    .reverse();
}

/** Map YYYY-MM → net savings for each month in range (inclusive). */
function getMonthlyNetSavingsMap(db, fromMonth, toMonth) {
  const rows = queryMonthlyNetSavings(db, {
    dateFrom: `${fromMonth}-01`,
    dateTo: `${toMonth}-31`,
  });
  const map = new Map();
  for (const r of rows) {
    if (r.month >= fromMonth && r.month <= toMonth) {
      map.set(r.month, r.netSavings);
    }
  }
  return map;
}

function sumNetSavingsInMap(map, monthKeys) {
  return round2(monthKeys.reduce((s, m) => s + (map.get(m) || 0), 0));
}

function averageNetSavings(map, monthKeys) {
  if (!monthKeys.length) return 0;
  return round2(sumNetSavingsInMap(map, monthKeys) / monthKeys.length);
}

/** Average net savings over months with positive net savings (matches planner baseline intent). */
function averagePositiveMonthlyNetSavings(db, monthsBack = 36) {
  const rows = queryMonthlyNetSavings(db, { months: monthsBack });
  const positive = rows.filter((r) => r.netSavings > 0);
  if (!positive.length) return 0;
  const sum = positive.reduce((s, r) => s + r.netSavings, 0);
  return round2(sum / positive.length);
}

module.exports = {
  queryMonthlyNetSavings,
  getMonthlyNetSavingsMap,
  sumNetSavingsInMap,
  averageNetSavings,
  averagePositiveMonthlyNetSavings,
};
