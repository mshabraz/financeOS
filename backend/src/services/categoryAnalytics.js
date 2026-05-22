/**
 * Category types for analytics:
 * - expense: consumption (counts toward net spending)
 * - income: earnings
 * - savings: transfers to pension/investment portfolios (not consumption; counts toward net savings)
 * - transfer: internal moves (if used)
 */

const SAVINGS_CATEGORY_NAMES = ['pension', 'investments', 'investment'];

/** SQL predicate: true when category row is a savings transfer category */
function sqlIsSavingsCategory(cAlias = 'c') {
  const names = SAVINGS_CATEGORY_NAMES.map((n) => `'${n}'`).join(', ');
  return `(${cAlias}.type = 'savings' OR LOWER(${cAlias}.name) IN (${names}))`;
}

/** Exclude savings categories from expense-style aggregations */
function sqlExcludeSavingsCategories(cAlias = 'c') {
  return `NOT ${sqlIsSavingsCategory(cAlias)}`;
}

/**
 * Net consumption expense amount for one ledger row (after category join).
 * u = unified ledger alias, c = categories alias (may be NULL).
 */
function sqlExpenseAmountCase(uAlias = 'u', cAlias = 'c') {
  return `CASE
    WHEN ${cAlias}.id IS NOT NULL AND ${sqlIsSavingsCategory(cAlias)} THEN 0
    WHEN ${cAlias}.is_default = 0 AND ${cAlias}.type = 'income' AND ${uAlias}.direction = 'K' THEN 0
    WHEN ${cAlias}.is_default = 0 AND ${cAlias}.type = 'income' AND ${uAlias}.direction = 'D' THEN 0
    WHEN ${cAlias}.is_default = 0 AND ${cAlias}.type = 'expense' AND ${uAlias}.direction = 'D' THEN ABS(${uAlias}.effective_amount)
    WHEN ${cAlias}.is_default = 0 AND ${cAlias}.type = 'expense' AND ${uAlias}.direction = 'K' THEN -ABS(${uAlias}.effective_amount)
    WHEN (${cAlias}.id IS NULL OR ${cAlias}.is_default = 1) AND ${uAlias}.direction = 'D' THEN ABS(${uAlias}.effective_amount)
    ELSE 0
  END`;
}

function sqlIncomeAmountCase(uAlias = 'u', cAlias = 'c') {
  return `CASE
    WHEN ${cAlias}.is_default = 0 AND ${cAlias}.type = 'income' AND ${uAlias}.direction = 'K' THEN ABS(${uAlias}.effective_amount)
    WHEN ${cAlias}.is_default = 0 AND ${cAlias}.type = 'income' AND ${uAlias}.direction = 'D' THEN -ABS(${uAlias}.effective_amount)
    WHEN (${cAlias}.id IS NULL OR ${cAlias}.is_default = 1) AND ${uAlias}.direction = 'K' THEN ABS(${uAlias}.effective_amount)
    ELSE 0
  END`;
}

/** Outflows to savings portfolios (pension, investments) — positive number */
function sqlSavingsTransferCase(uAlias = 'u', cAlias = 'c') {
  return `CASE
    WHEN ${cAlias}.id IS NOT NULL AND ${sqlIsSavingsCategory(cAlias)} AND ${uAlias}.direction = 'D' THEN ABS(${uAlias}.effective_amount)
    WHEN ${cAlias}.id IS NOT NULL AND ${sqlIsSavingsCategory(cAlias)} AND ${uAlias}.direction = 'K' THEN -ABS(${uAlias}.effective_amount)
    ELSE 0
  END`;
}

module.exports = {
  SAVINGS_CATEGORY_NAMES,
  sqlIsSavingsCategory,
  sqlExcludeSavingsCategories,
  sqlExpenseAmountCase,
  sqlIncomeAmountCase,
  sqlSavingsTransferCase,
};
