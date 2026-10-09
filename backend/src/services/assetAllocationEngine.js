/**
 * Pure asset allocation + buy-only rebalancing engine.
 * No DB access — callers pass holdings, strategy config, and mappings.
 */

const TARGET_SUM_TOLERANCE = 0.01;

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function round4(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

function holdingKeyOf(h) {
  if (h.holdingKey) return h.holdingKey;
  return `${h.broker}|${String(h.ticker || '').toUpperCase()}|${(h.currency || 'EUR').toUpperCase()}`;
}

function holdingValueEur(h) {
  const v = h.marketValueEur ?? h.marketValue ?? h.totalCostBasis ?? 0;
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

/**
 * @param {object} input
 * @param {Array}  input.holdings            open holdings with marketValueEur (may include synthetic brokerage cash)
 * @param {object} input.strategy            { includeBrokerCash, cashCategoryId }
 * @param {Array}  input.categories          { id, name, color, sortOrder }
 * @param {Array}  input.targets             { categoryId, targetPct }
 * @param {Array}  input.maps                { holdingKey, categoryId }
 * @param {number} [input.monthlyContribution]
 * @param {number} [input.brokerCashEur]     optional direct cash inject when strategy.includeBrokerCash
 *                                           Prefer a synthetic holding instead; pass 0 + includeBrokerCash:false
 *                                           to avoid double-counting with cash|BROKER_UNINVESTED|EUR.
 */
function calculateAssetAllocation({
  holdings = [],
  strategy = {},
  categories = [],
  targets = [],
  maps = [],
  monthlyContribution = null,
  brokerCashEur = 0,
} = {}) {
  const mapByKey = new Map(
    (maps || [])
      .filter((m) => m && m.holdingKey && m.categoryId != null)
      .map((m) => [String(m.holdingKey), Number(m.categoryId)])
  );

  const targetByCat = new Map(
    (targets || [])
      .filter((t) => t && t.categoryId != null)
      .map((t) => [Number(t.categoryId), Number(t.targetPct) || 0])
  );

  const sortedCats = [...(categories || [])].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name))
  );

  const valueByCat = new Map(sortedCats.map((c) => [Number(c.id), 0]));
  let unmappedValue = 0;
  let holdingsValue = 0;

  for (const h of holdings || []) {
    const value = holdingValueEur(h);
    if (value <= 0) continue;
    holdingsValue += value;
    const key = holdingKeyOf(h);
    const catId = mapByKey.get(key);
    if (catId != null && valueByCat.has(catId)) {
      valueByCat.set(catId, valueByCat.get(catId) + value);
    } else {
      unmappedValue += value;
    }
  }

  const includeCash = !!strategy.includeBrokerCash;
  const cashCatId = strategy.cashCategoryId != null ? Number(strategy.cashCategoryId) : null;
  const cashEur = includeCash ? Math.max(0, Number(brokerCashEur) || 0) : 0;
  if (cashEur > 0) {
    if (cashCatId != null && valueByCat.has(cashCatId)) {
      valueByCat.set(cashCatId, valueByCat.get(cashCatId) + cashEur);
    } else {
      unmappedValue += cashEur;
    }
  }

  const totalPortfolioEur = holdingsValue + cashEur;
  const targetSumPct = [...targetByCat.values()].reduce((s, v) => s + v, 0);
  const targetsValid =
    targetByCat.size === 0 || Math.abs(targetSumPct - 100) <= TARGET_SUM_TOLERANCE;

  const categoryRows = sortedCats.map((c) => {
    const id = Number(c.id);
    const valueEur = round2(valueByCat.get(id) || 0);
    const actualPct = totalPortfolioEur > 0 ? round4((valueEur / totalPortfolioEur) * 100) : 0;
    const targetPct = round4(targetByCat.get(id) ?? 0);
    const driftPct = round4(actualPct - targetPct);
    return {
      id,
      name: c.name,
      color: c.color || '#0ea5e9',
      sortOrder: c.sortOrder ?? 0,
      valueEur,
      actualPct,
      targetPct,
      driftPct,
    };
  });

  const unmapped = {
    valueEur: round2(unmappedValue),
    actualPct: totalPortfolioEur > 0 ? round4((unmappedValue / totalPortfolioEur) * 100) : 0,
  };

  const contribution = monthlyContribution != null
    ? Number(monthlyContribution)
    : (strategy.monthlyContribution != null ? Number(strategy.monthlyContribution) : 0);

  const depositPlan = buildBuyOnlyDepositPlan(categoryRows, totalPortfolioEur, contribution);

  return {
    totalPortfolioEur: round2(totalPortfolioEur),
    holdingsValueEur: round2(holdingsValue),
    brokerCashEur: round2(cashEur),
    categories: categoryRows,
    unmapped,
    targetSumPct: round4(targetSumPct),
    targetsValid,
    monthlyContribution: contribution > 0 ? round2(contribution) : 0,
    depositPlan: depositPlan.plan,
    depositNote: depositPlan.note,
  };
}

/**
 * Buy-only: distribute contribution across underweight categories proportional to € deficit.
 */
function buildBuyOnlyDepositPlan(categoryRows, totalPortfolioEur, contribution) {
  const amount = Number(contribution) || 0;
  if (amount <= 0) {
    return { plan: [], note: 'Set a monthly contribution to see a buy-only deposit plan.' };
  }

  const withTarget = categoryRows.filter((c) => (c.targetPct || 0) > 0);
  if (!withTarget.length) {
    return { plan: [], note: 'Add target percentages to categories to compute a deposit plan.' };
  }

  const total = Math.max(0, Number(totalPortfolioEur) || 0);
  const deficits = withTarget.map((c) => {
    const deficitPct = Math.max(0, (c.targetPct || 0) - (c.actualPct || 0));
    const deficitEur = (deficitPct / 100) * total;
    return { ...c, deficitPct, deficitEur };
  });

  const underweight = deficits.filter((d) => d.deficitEur > 0.0001 || d.deficitPct > 0.0001);
  let plan;

  if (underweight.length) {
    const deficitSum = underweight.reduce((s, d) => s + d.deficitEur, 0);
    // If portfolio is tiny / empty, fall back to deficit % weights
    const weightSum = deficitSum > 0.0001
      ? deficitSum
      : underweight.reduce((s, d) => s + d.deficitPct, 0);
    plan = underweight.map((d) => {
      const weight = deficitSum > 0.0001 ? d.deficitEur : d.deficitPct;
      const depositEur = round2((weight / weightSum) * amount);
      return {
        categoryId: d.id,
        name: d.name,
        color: d.color,
        depositEur,
        depositPct: amount > 0 ? round4((depositEur / amount) * 100) : 0,
        deficitPct: round4(d.deficitPct),
      };
    });
  } else {
    // All at/above target — equal-split among targeted categories to keep contributing
    const each = round2(amount / withTarget.length);
    plan = withTarget.map((c, i) => {
      const depositEur = i === withTarget.length - 1
        ? round2(amount - each * (withTarget.length - 1))
        : each;
      return {
        categoryId: c.id,
        name: c.name,
        color: c.color,
        depositEur,
        depositPct: amount > 0 ? round4((depositEur / amount) * 100) : 0,
        deficitPct: 0,
      };
    });
    return {
      plan,
      note: 'All targeted categories are at or above target — splitting the deposit evenly.',
    };
  }

  // Fix rounding so deposits sum exactly to contribution
  const sum = plan.reduce((s, p) => s + p.depositEur, 0);
  const delta = round2(amount - sum);
  if (plan.length && Math.abs(delta) >= 0.01) {
    plan[0].depositEur = round2(plan[0].depositEur + delta);
    plan[0].depositPct = amount > 0 ? round4((plan[0].depositEur / amount) * 100) : 0;
  }

  return {
    plan: plan.filter((p) => p.depositEur > 0),
    note: 'Buy-only: put new money into underweight categories; no sales suggested.',
  };
}

module.exports = {
  calculateAssetAllocation,
  buildBuyOnlyDepositPlan,
  holdingKeyOf,
  TARGET_SUM_TOLERANCE,
};
