const express = require('express');
const { getDb } = require('../db/database');
const { ANALYTICS_LEDGER_SQL, wherePeriodUnified } = require('../services/unifiedLedger');
const {
  sqlExpenseAmountCase,
  sqlIncomeAmountCase,
  sqlSavingsTransferCase,
  sqlExcludeSavingsCategories,
  sqlIsSavingsCategory,
} = require('../services/categoryAnalytics');

const router = express.Router();

function resolvePeriod(periodType, periodValue) {
  if (!periodType || periodType === 'all') {
    return { dateFrom: null, dateTo: null };
  }

  if (periodType === 'month') {
    const [y, m] = (periodValue || '').split('-');
    if (!y || !m) return { dateFrom: null, dateTo: null };
    const from = `${y}-${m}-01`;
    const to = new Date(parseInt(y), parseInt(m), 0).toISOString().slice(0, 10);
    return { dateFrom: from, dateTo: to };
  }

  if (periodType === 'quarter') {
    const match = (periodValue || '').match(/^(\d{4})-Q(\d)$/);
    if (!match) return { dateFrom: null, dateTo: null };
    const y = parseInt(match[1]);
    const q = parseInt(match[2]);
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const from = `${y}-${String(startMonth).padStart(2, '0')}-01`;
    const to = new Date(y, endMonth, 0).toISOString().slice(0, 10);
    return { dateFrom: from, dateTo: to };
  }

  if (periodType === 'year') {
    const y = periodValue || new Date().getFullYear();
    return { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` };
  }

  return { dateFrom: null, dateTo: null };
}

// GET /api/dashboard/summary?periodType=month&periodValue=2026-05
router.get('/summary', (req, res) => {
  const db = getDb();
  const { periodType = 'month', periodValue } = req.query;

  const { dateFrom, dateTo } = resolvePeriod(periodType, periodValue);
  const filter = wherePeriodUnified(dateFrom, dateTo);

  const expenseCase = sqlExpenseAmountCase('u', 'c');
  const incomeCase = sqlIncomeAmountCase('u', 'c');
  const savingsCase = sqlSavingsTransferCase('u', 'c');

  const totals = db.prepare(
    `SELECT
       MAX(0, SUM(${incomeCase})) AS totalIncome,
       MAX(0, SUM(${expenseCase})) AS totalExpenses,
       MAX(0, SUM(${savingsCase})) AS totalSavings,
       COUNT(*) AS transactionCount
     FROM (${ANALYTICS_LEDGER_SQL}) u
     LEFT JOIN categories c ON c.id = u.category_id
     WHERE 1=1 ${filter}`
  ).get();

  const netBalance = (totals.totalIncome || 0) - (totals.totalExpenses || 0);

  res.json({
    ...totals,
    netBalance,
    periodType,
    periodValue: periodValue ?? 'all',
    dateFrom,
    dateTo,
  });
});

// GET /api/dashboard/by-category
router.get('/by-category', (req, res) => {
  const db = getDb();
  const { periodType, periodValue, type = 'expense',
    dateFrom: rawFrom, dateTo: rawTo } = req.query;

  let dateFrom;
  let dateTo;
  if (rawFrom || rawTo) {
    dateFrom = rawFrom || null;
    dateTo = rawTo || null;
  } else {
    ({ dateFrom, dateTo } = resolvePeriod(periodType || 'all', periodValue));
  }

  const filter = wherePeriodUnified(dateFrom, dateTo);

  const amountExpr = type === 'expense'
    ? `CASE
         WHEN c.is_default = 0 THEN
           (SUM(CASE WHEN u.direction = 'D' THEN ABS(u.effective_amount) ELSE 0 END) -
            SUM(CASE WHEN u.direction = 'K' THEN ABS(u.effective_amount) ELSE 0 END))
         ELSE
           SUM(CASE WHEN u.direction = 'D' THEN ABS(u.effective_amount) ELSE 0 END)
       END`
    : type === 'income'
      ? `CASE
           WHEN c.is_default = 0 THEN
             (SUM(CASE WHEN u.direction = 'K' THEN ABS(u.effective_amount) ELSE 0 END) -
              SUM(CASE WHEN u.direction = 'D' THEN ABS(u.effective_amount) ELSE 0 END))
           ELSE
             SUM(CASE WHEN u.direction = 'K' THEN ABS(u.effective_amount) ELSE 0 END)
         END`
      : `(SUM(CASE WHEN u.direction = 'D' THEN ABS(u.effective_amount) ELSE 0 END) -
          SUM(CASE WHEN u.direction = 'K' THEN ABS(u.effective_amount) ELSE 0 END))`;

  const typeFilter =
    type === 'expense'
      ? `AND (c.type = 'expense' OR c.is_default = 1) AND ${sqlExcludeSavingsCategories('c')}`
      : type === 'income'
        ? `AND (c.type = 'income' OR c.is_default = 1)`
        : type === 'savings'
          ? `AND ${sqlIsSavingsCategory('c')}`
          : '';

  const rows = db.prepare(
    `SELECT
       c.id, c.name, c.icon, c.color, c.type,
       COUNT(u.id) AS txCount,
       ${amountExpr} AS total
     FROM (${ANALYTICS_LEDGER_SQL}) u
     JOIN categories c ON c.id = u.category_id
     WHERE 1=1 ${filter} ${typeFilter}
     GROUP BY c.id
     HAVING total > 0.0001
     ORDER BY total DESC`
  ).all();

  res.json(rows);
});

// GET /api/dashboard/monthly-trend
router.get('/monthly-trend', (req, res) => {
  const db = getDb();
  const { dateFrom, dateTo, months } = req.query;

  const parts = [];
  if (dateFrom) parts.push(`u.date >= '${dateFrom}'`);
  if (dateTo) parts.push(`u.date <= '${dateTo}'`);
  const where = parts.length ? `WHERE ${parts.join(' AND ')}` : '';

  const limitClause = !dateFrom && !dateTo
    ? `LIMIT ${Math.min(parseInt(months || 12), 120)}`
    : '';

  const expenseCase = sqlExpenseAmountCase('u', 'c');
  const incomeCase = sqlIncomeAmountCase('u', 'c');
  const savingsCase = sqlSavingsTransferCase('u', 'c');

  const rows = db.prepare(
    `SELECT
       strftime('%Y-%m', u.date) AS month,
       MAX(0, SUM(${incomeCase})) AS income,
       MAX(0, SUM(${expenseCase})) AS expenses,
       MAX(0, SUM(${savingsCase})) AS savings
     FROM (${ANALYTICS_LEDGER_SQL}) u
     LEFT JOIN categories c ON c.id = u.category_id
     ${where}
     GROUP BY month
     ORDER BY month DESC
     ${limitClause}`
  ).all();

  res.json(rows.reverse());
});

// GET /api/dashboard/quarterly-trend?year=2026
router.get('/quarterly-trend', (req, res) => {
  const db = getDb();
  const year = req.query.year || new Date().getFullYear();

  const expenseCase = sqlExpenseAmountCase('u', 'c');
  const incomeCase = sqlIncomeAmountCase('u', 'c');
  const savingsCase = sqlSavingsTransferCase('u', 'c');

  const rows = db.prepare(
    `SELECT
       ((cast(strftime('%m', u.date) as integer) - 1) / 3 + 1) AS quarter,
       strftime('%Y', u.date) AS year,
       MAX(0, SUM(${incomeCase})) AS income,
       MAX(0, SUM(${expenseCase})) AS expenses,
       MAX(0, SUM(${savingsCase})) AS savings
     FROM (${ANALYTICS_LEDGER_SQL}) u
     LEFT JOIN categories c ON c.id = u.category_id
     WHERE strftime('%Y', u.date) = '${year}'
     GROUP BY quarter
     ORDER BY quarter`
  ).all();

  const result = [1, 2, 3, 4].map((q) => {
    const found = rows.find((r) => r.quarter === q);
    return found ?? { quarter: q, year, income: 0, expenses: 0 };
  });

  res.json(result);
});

// GET /api/dashboard/yearly-trend?years=3
router.get('/yearly-trend', (req, res) => {
  const db = getDb();
  const years = Math.min(parseInt(req.query.years || 3), 10);

  const expenseCase = sqlExpenseAmountCase('u', 'c');
  const incomeCase = sqlIncomeAmountCase('u', 'c');
  const savingsCase = sqlSavingsTransferCase('u', 'c');

  const rows = db.prepare(
    `SELECT
       strftime('%Y', u.date) AS year,
       MAX(0, SUM(${incomeCase})) AS income,
       MAX(0, SUM(${expenseCase})) AS expenses,
       MAX(0, SUM(${savingsCase})) AS savings
     FROM (${ANALYTICS_LEDGER_SQL}) u
     LEFT JOIN categories c ON c.id = u.category_id
     GROUP BY year
     ORDER BY year DESC
     LIMIT ?`
  ).all(years);

  res.json(rows.reverse());
});

// GET /api/dashboard/top-merchants
router.get('/top-merchants', (req, res) => {
  const db = getDb();
  const { periodType = 'month', periodValue, dateFrom: df, dateTo: dt, limit = 10 } = req.query;

  let dateFrom;
  let dateTo;
  if (df || dt) {
    dateFrom = df || null;
    dateTo = dt || null;
  } else {
    ({ dateFrom, dateTo } = resolvePeriod(periodType, periodValue));
  }
  const filter = wherePeriodUnified(dateFrom, dateTo);

  const rows = db.prepare(
    `SELECT
       u.merchant,
       COUNT(*) AS txCount,
       SUM(ABS(u.effective_amount)) AS total
     FROM (${ANALYTICS_LEDGER_SQL}) u
     LEFT JOIN categories c ON c.id = u.category_id
     WHERE u.direction = 'D' AND u.merchant != ''
       AND ${sqlExcludeSavingsCategories('c')}
       ${filter}
     GROUP BY u.merchant
     ORDER BY total DESC
     LIMIT ?`
  ).all(parseInt(limit, 10));

  res.json(rows);
});

// GET /api/dashboard/recurring
router.get('/recurring', (req, res) => {
  const db = getDb();
  const { dateFrom, dateTo } = req.query;
  const filter = wherePeriodUnified(dateFrom, dateTo, 'u');

  const rows = db.prepare(
    `SELECT
       u.merchant,
       COUNT(DISTINCT strftime('%Y-%m', u.date)) AS monthCount,
       AVG(ABS(u.effective_amount)) AS avgAmount,
       MIN(ABS(u.effective_amount)) AS minAmount,
       MAX(ABS(u.effective_amount)) AS maxAmount,
       COUNT(*) AS txCount
     FROM (${ANALYTICS_LEDGER_SQL}) u
     LEFT JOIN categories c ON c.id = u.category_id
     WHERE u.direction = 'D' AND u.merchant != ''
       AND ${sqlExcludeSavingsCategories('c')}
       ${filter}
     GROUP BY u.merchant
     HAVING monthCount >= 2
     ORDER BY monthCount DESC, avgAmount DESC
     LIMIT 30`
  ).all();

  res.json(rows);
});

// GET /api/dashboard/bank-balance
router.get('/bank-balance', (req, res) => {
  const db = getDb();

  const latest = db.prepare(
    `SELECT account, amount, currency, balance_date
     FROM account_balances
     WHERE balance_type = 'closing'
     ORDER BY balance_date DESC, id DESC
     LIMIT 1`
  ).get();

  const allAccounts = db.prepare(
    `SELECT account, amount, currency, balance_date
     FROM account_balances ab1
     WHERE balance_type = 'closing'
       AND id = (
         SELECT id FROM account_balances ab2
         WHERE ab2.account = ab1.account AND ab2.balance_type = 'closing'
         ORDER BY balance_date DESC LIMIT 1
       )
     ORDER BY balance_date DESC`
  ).all();

  res.json({ latest, accounts: allAccounts });
});

router.get('/manual-balances', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM manual_balances ORDER BY id').all();
  res.json(rows);
});

router.put('/manual-balances/:key', (req, res) => {
  const db = getDb();
  const { amount } = req.body;
  const { key } = req.params;

  if (amount == null || isNaN(parseFloat(amount))) {
    return res.status(400).json({ error: 'amount is required' });
  }

  const existing = db.prepare('SELECT id FROM manual_balances WHERE key = ?').get(key);
  if (!existing) {
    return res.status(404).json({ error: `Balance key '${key}' not found` });
  }

  db.prepare(
    "UPDATE manual_balances SET amount = ?, updated_at = datetime('now') WHERE key = ?"
  ).run(parseFloat(amount), key);

  res.json(db.prepare('SELECT * FROM manual_balances WHERE key = ?').get(key));
});

router.post('/manual-balances', (req, res) => {
  const db = getDb();
  const { key, label, icon = '💰', amount = 0 } = req.body;
  if (!key || !label) return res.status(400).json({ error: 'key and label required' });

  try {
    const result = db.prepare(
      'INSERT INTO manual_balances (key, label, icon, amount) VALUES (?, ?, ?, ?)'
    ).run(key, label, icon, parseFloat(amount));
    res.json(db.prepare('SELECT * FROM manual_balances WHERE id = ?').get(result.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/manual-balances/:key', (req, res) => {
  const db = getDb();
  const { key } = req.params;
  if (['pension', 'investments', 'investment_cash'].includes(key)) {
    return res.status(400).json({ error: 'Cannot delete built-in balance slots' });
  }
  db.prepare('DELETE FROM manual_balances WHERE key = ?').run(key);
  res.json({ ok: true });
});

router.get('/assets', async (req, res) => {
  const db = getDb();
  const { computeAssetTotals } = require('../services/assetTotals');

  const totals = await computeAssetTotals(db);
  const {
    bankBalance,
    manualTotal,
    revolutSharedAsset,
    totalAssets,
    investmentPortfolio: portfolioBase,
    manuals: manualsWithPortfolio,
    revolutClosingBalance,
    revolutSplitRatio: splitRatio,
  } = totals;

  let investmentPortfolio = null;
  if (portfolioBase) {
    try {
      const { buildPortfolioValuation } = require('../services/investmentValuation');
      const val = await buildPortfolioValuation(db);
      const p = val.primary || {};
      let unrealizedPnLEur = 0;
      let totalCostBasisEur = 0;
      for (const h of val.openHoldings || []) {
        if (h.unrealizedPnLEur != null) unrealizedPnLEur += h.unrealizedPnLEur;
        if (h.costBasisEur != null) totalCostBasisEur += h.costBasisEur;
      }
      const unrealizedPnLPct =
        totalCostBasisEur > 0 ? (unrealizedPnLEur / totalCostBasisEur) * 100 : null;

      let sparkline = [];
      let allocationSnapshot = [];
      try {
        const { buildPortfolioAnalytics } = require('../services/investmentPortfolioAnalytics');
        const analytics = await buildPortfolioAnalytics(db, { period: '3M' });
        sparkline = analytics.sparkline || [];
        allocationSnapshot = (analytics.allocations?.assetClass || []).slice(0, 6);
      } catch {
        /* optional enrichment */
      }

      investmentPortfolio = {
        currency: 'EUR',
        holdingsValue: portfolioBase.holdingsValue,
        cashBalance: portfolioBase.cashBalance,
        totalPortfolio: portfolioBase.totalPortfolio,
        byCurrency: val.byCurrency || [],
        lastPriceUpdate: val.sync?.last_success_at ?? null,
        syncStatus: val.sync?.status ?? 'idle',
        syncError: val.sync?.last_error ?? null,
        unboundCount: val.unboundCount ?? 0,
        openPositions: val.openHoldings?.length ?? 0,
        pricedPositions: val.openHoldings?.filter((h) => h.priceStatus === 'ok').length ?? 0,
        needsQuantityCount: val.needsQuantityCount ?? 0,
        unrealizedPnLEur: Math.round(unrealizedPnLEur * 100) / 100,
        unrealizedPnLPct:
          unrealizedPnLPct != null ? Math.round(unrealizedPnLPct * 100) / 100 : null,
        sparkline,
        allocationSnapshot,
      };
    } catch (e) {
      investmentPortfolio = {
        currency: 'EUR',
        ...portfolioBase,
      };
    }
  }

  const manualsEnriched = manualsWithPortfolio.map((row) => {
    if (row.key !== 'investments' || !investmentPortfolio) return row;
    return { ...row, portfolio: investmentPortfolio };
  });

  const { getPerEurRates, convertFromEur, FALLBACK_PER_EUR } = require('../services/fxRates');
  let perEur = { EUR: 1, PKR: FALLBACK_PER_EUR.PKR };
  let fxPkrDate = null;
  let fxPkrStale = true;
  try {
    const fx = await getPerEurRates(['PKR']);
    perEur = { ...perEur, ...fx.perEur, EUR: 1 };
    fxPkrDate = fx.date;
    fxPkrStale = fx.stale || !fx.perEur?.PKR;
  } catch (e) {
    require('../services/logger').warn(`[dashboard/assets] PKR rate fallback: ${e.message}`);
  }
  const eurToPkrRate = perEur.PKR ?? FALLBACK_PER_EUR.PKR;
  const totalAssetsPkr =
    convertFromEur(totalAssets, 'PKR', perEur) ??
    Math.round(totalAssets * eurToPkrRate * 100) / 100;

  const revolutLatest = db.prepare(
    `SELECT balance_after, date, product, currency
     FROM revolut_transactions
     WHERE balance_after IS NOT NULL
     ORDER BY COALESCE(completed_datetime, date) DESC, id DESC
     LIMIT 1`
  ).get();

  res.json({
    bankBalance,
    manuals: manualsEnriched,
    manualTotal,
    investmentPortfolio,
    revolutClosingBalance,
    revolutSharedAsset,
    revolutSplitRatio: splitRatio,
    revolutBalanceDate: revolutLatest?.date ?? null,
    revolutProduct: revolutLatest?.product ?? null,
    totalAssets,
    totalAssetsPkr,
    eurToPkrRate,
    fxPkrDate,
    fxPkrStale,
  });
});

// GET /api/dashboard/budgets?month=2026-05
router.get('/budgets', (req, res) => {
  const db = getDb();
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'month required (YYYY-MM)' });

  const rows = db.prepare(
    `SELECT
       b.id, b.month, b.amount AS budgeted,
       c.id AS category_id, c.name, c.icon, c.color,
       MAX(0, COALESCE(
         SUM(CASE WHEN u.direction = 'D' THEN ABS(u.effective_amount) ELSE 0 END) -
         SUM(CASE WHEN u.direction = 'K' THEN ABS(u.effective_amount) ELSE 0 END),
         0
       )) AS spent
     FROM budgets b
     JOIN categories c ON c.id = b.category_id
     LEFT JOIN (${ANALYTICS_LEDGER_SQL}) u
       ON u.category_id = b.category_id
       AND strftime('%Y-%m', u.date) = b.month
     WHERE b.month = ?
     GROUP BY b.id`
  ).all(month);

  res.json(rows);
});

router.put('/budgets', (req, res) => {
  const db = getDb();
  const { categoryId, month, amount } = req.body;
  if (!categoryId || !month || amount == null) {
    return res.status(400).json({ error: 'categoryId, month, amount required' });
  }

  db.prepare(
    'INSERT OR REPLACE INTO budgets (category_id, month, amount) VALUES (?, ?, ?)'
  ).run(parseInt(categoryId), month, parseFloat(amount));

  res.json({ ok: true });
});

router.get('/available-years', (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT DISTINCT strftime('%Y', date) AS year FROM (
       SELECT date FROM transactions
       UNION ALL
       SELECT date FROM revolut_transactions
     ) ORDER BY year DESC`
  ).all();
  res.json(rows.map((r) => r.year));
});

module.exports = router;
