/**
 * Compound interest & wealth projection engine.
 * Month-step simulation for contributions, growth, inflation, fees, and extras.
 */

const COMPOUNDING_PERIODS = {
  yearly: 1,
  quarterly: 4,
  monthly: 12,
  daily: 365,
  continuous: -1,
};

const GOAL_TYPES = new Set([
  'final_value',
  'net_worth',
  'passive_income',
  'fire',
  'savings_milestone',
  'coast_fire',
  'fi_date',
]);

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function effectiveAnnualReturn(nominalPct, inflationPct, taxDragPct, feeDragPct) {
  const nominal = nominalPct / 100;
  const inflation = inflationPct / 100;
  const tax = taxDragPct / 100;
  const fee = feeDragPct / 100;
  const afterDrag = nominal * (1 - tax) * (1 - fee);
  const real = inflation > -0.99 ? (1 + afterDrag) / (1 + inflation) - 1 : afterDrag;
  return { nominal: afterDrag, real };
}

function monthlyRateFromAnnual(annualRate, compounding) {
  if (compounding === 'continuous') {
    return Math.exp(annualRate / 12) - 1;
  }
  const n = COMPOUNDING_PERIODS[compounding] || 12;
  return Math.pow(1 + annualRate, 1 / n) - 1;
  // For monthly steps we apply growth each month using equivalent monthly rate
}

function monthsFromTime({ years = 0, months = 0, targetAge = null, currentAge = null, endDate = null }) {
  if (endDate) {
    const end = new Date(endDate);
    const now = new Date();
    const diff = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
    return Math.max(1, diff);
  }
  if (targetAge != null && currentAge != null) {
    const y = Math.max(0, targetAge - currentAge);
    return Math.max(1, Math.round(y * 12) + months);
  }
  return Math.max(1, Math.round(years * 12) + months);
}

/**
 * @param {Object} input
 * @returns {Object} projection result
 */
function runProjection(input) {
  const {
    principal = 0,
    monthlyContribution = 0,
    yearlyContribution = 0,
    contributionGrowthRate = 0,
    annualReturn = 7,
    inflationRate = 2,
    taxDrag = 0,
    feeDrag = 0,
    years = 20,
    months: extraMonths = 0,
    targetAge = null,
    currentAge = null,
    endDate = null,
    compounding = 'monthly',
    useRealReturns = false,
    extraContributions = [],
    withdrawalMonthly = 0,
    withdrawalStartMonth = null,
    dividendReinvest = true,
  } = input;

  const totalMonths = monthsFromTime({ years, months: extraMonths, targetAge, currentAge, endDate });
  const { nominal, real } = effectiveAnnualReturn(annualReturn, inflationRate, taxDrag, feeDrag);
  const annual = useRealReturns ? real : nominal;
  const monthlyRate = monthlyRateFromAnnual(annual, compounding);

  const extrasByMonth = new Map();
  for (const e of extraContributions || []) {
    const m = Math.max(0, Math.min(totalMonths - 1, Number(e.month) || 0));
    extrasByMonth.set(m, (extrasByMonth.get(m) || 0) + (Number(e.amount) || 0));
  }

  let balance = principal;
  let totalContributed = principal;
  let monthlyContrib = monthlyContribution;
  const timeline = [];
  const yearlyTable = [];

  for (let m = 0; m <= totalMonths; m++) {
    const inflationFactor = Math.pow(1 + inflationRate / 100, m / 12);
    const realBalance = balance / inflationFactor;

    if (m % 12 === 0 || m === totalMonths) {
      yearlyTable.push({
        year: m / 12,
        month: m,
        balance: round2(balance),
        realBalance: round2(realBalance),
        totalContributed: round2(totalContributed),
        gains: round2(balance - totalContributed),
      });
    }

    timeline.push({
      month: m,
      year: round2(m / 12),
      balance: round2(balance),
      realBalance: round2(realBalance),
      contributed: round2(totalContributed),
      gains: round2(balance - totalContributed),
    });

    if (m >= totalMonths) break;

    if (m > 0 && m % 12 === 0) {
      monthlyContrib *= 1 + contributionGrowthRate / 100;
      if (yearlyContribution) {
        balance += yearlyContribution;
        totalContributed += yearlyContribution;
      }
    }

    balance += monthlyContrib;
    totalContributed += monthlyContrib;
    balance += extrasByMonth.get(m) || 0;
    if (extrasByMonth.get(m)) totalContributed += extrasByMonth.get(m);

    if (withdrawalStartMonth != null && m >= withdrawalStartMonth && withdrawalMonthly > 0) {
      balance = Math.max(0, balance - withdrawalMonthly);
    }

    if (monthlyRate !== 0) {
      balance *= 1 + monthlyRate;
    }
    if (!dividendReinvest && monthlyRate > 0) {
      /* no-op: drag could be modeled separately; reinvest flag reserved for UI */
    }
  }

  const final = timeline[timeline.length - 1];
  const gains = final.balance - totalContributed;
  const gainPct = totalContributed > 0 ? (gains / totalContributed) * 100 : 0;
  const contributionShare = final.balance > 0 ? (totalContributed / final.balance) * 100 : 0;

  return {
    finalValue: final.balance,
    finalValueReal: final.realBalance,
    totalContributed: round2(totalContributed),
    totalGains: round2(gains),
    gainPctOfFinal: round2(100 - contributionShare),
    contributionSharePct: round2(contributionShare),
    months: totalMonths,
    years: round2(totalMonths / 12),
    timeline,
    yearlyTable,
    monthlyRate: round4(monthlyRate * 100),
    effectiveAnnualReturn: round2(annual * 100),
  };
}

function solveForContribution(input, targetValue) {
  let lo = 0;
  let hi = Math.max(targetValue, input.monthlyContribution || 0, 10000);
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const r = runProjection({ ...input, monthlyContribution: mid });
    if (r.finalValue >= targetValue) hi = mid;
    else lo = mid;
  }
  return round2(hi);
}

function solveForYears(input, targetValue, maxYears = 80) {
  let lo = 0.5;
  let hi = maxYears;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const r = runProjection({ ...input, years: mid });
    if (r.finalValue >= targetValue) hi = mid;
    else lo = mid;
  }
  return round2(hi);
}

function solveForReturn(input, targetValue) {
  let lo = -50;
  let hi = 50;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const r = runProjection({ ...input, annualReturn: mid });
    if (r.finalValue >= targetValue) hi = mid;
    else lo = mid;
  }
  return round2(hi);
}

function solveForPrincipal(input, targetValue) {
  let lo = 0;
  let hi = targetValue;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const r = runProjection({ ...input, principal: mid });
    if (r.finalValue >= targetValue) hi = mid;
    else lo = mid;
  }
  return round2(hi);
}

/**
 * Passive income target: portfolio * SWR = monthly income
 */
function passiveIncomeFromPortfolio(portfolio, swr = 4) {
  return (portfolio * (swr / 100)) / 12;
}

function portfolioForPassiveIncome(monthlyIncome, swr = 4) {
  if (swr <= 0) return 0;
  return (monthlyIncome * 12) / (swr / 100);
}

function runGoalSolver(input) {
  const {
    goalType = 'final_value',
    targetValue = 1000000,
    targetMonthlyIncome = null,
    safeWithdrawalRate = 4,
    solveFor = 'contribution',
  } = input;

  let effectiveTarget = targetValue;
  if (goalType === 'passive_income' || goalType === 'fire') {
    effectiveTarget = portfolioForPassiveIncome(
      targetMonthlyIncome ?? targetValue / 12,
      safeWithdrawalRate
    );
  }

  const base = runProjection(input);
  const result = { goalType, targetValue: effectiveTarget, projection: base };

  if (solveFor === 'contribution') {
    result.requiredMonthlyContribution = solveForContribution(input, effectiveTarget);
    result.projectionAtRequired = runProjection({
      ...input,
      monthlyContribution: result.requiredMonthlyContribution,
    });
  } else if (solveFor === 'years') {
    result.requiredYears = solveForYears(input, effectiveTarget);
    result.projectionAtRequired = runProjection({ ...input, years: result.requiredYears });
  } else if (solveFor === 'return') {
    result.requiredAnnualReturn = solveForReturn(input, effectiveTarget);
    result.projectionAtRequired = runProjection({
      ...input,
      annualReturn: result.requiredAnnualReturn,
    });
  } else if (solveFor === 'principal') {
    result.requiredStartingCapital = solveForPrincipal(input, effectiveTarget);
    result.projectionAtRequired = runProjection({
      ...input,
      principal: result.requiredStartingCapital,
    });
  }

  if (goalType === 'coast_fire') {
    const yearsToTarget = result.requiredYears ?? input.years;
    const coastPrincipal = input.principal || 0;
    const coastGrowth = runProjection({
      ...input,
      monthlyContribution: 0,
      years: yearsToTarget,
      principal: coastPrincipal,
    });
    result.coastFire = {
      growTo: coastGrowth.finalValue,
      yearsWithoutContributions: yearsToTarget,
      message: `Coast FIRE: grow current capital to ${round2(coastGrowth.finalValue)} EUR with no new contributions, then retire.`,
    };
  }

  if (goalType === 'fi_date' && result.requiredYears != null) {
    const d = new Date();
    d.setFullYear(d.getFullYear() + Math.ceil(result.requiredYears));
    result.estimatedFiDate = d.toISOString().slice(0, 10);
  }

  return result;
}

function buildInsights(projection, input, goalTarget = null, altContributionDelta = 200) {
  const insights = [];
  if (projection.months > 0) {
    insights.push({
      type: 'info',
      text: goalTarget
        ? `On track toward ${fmtNum(goalTarget)} in about ${round2(projection.years)} years.`
        : `Projected value ${fmtNum(projection.finalValue)} in ${round2(projection.years)} years.`,
    });
  }
  if (projection.gainPctOfFinal > 0) {
    insights.push({
      type: 'positive',
      text: `Growth from compounding represents about ${projection.gainPctOfFinal}% of the final projected value.`,
    });
  }
  if (altContributionDelta > 0 && input) {
    const bumped = runProjection({
      ...input,
      monthlyContribution: (input.monthlyContribution || 0) + altContributionDelta,
    });
    const valueDelta = bumped.finalValue - projection.finalValue;
    if (valueDelta > 100) {
      insights.push({
        type: 'tip',
        text: `Increasing monthly contributions by ${fmtNum(altContributionDelta)} adds about ${fmtNum(valueDelta)} to the projection over the same period.`,
      });
    }
  }
  return insights;
}

function runScenarioComparison(baseInput, scenarios) {
  return scenarios.map((s) => {
    const merged = { ...baseInput, ...s.assumptions, name: s.name };
    const projection = runProjection(merged);
    return { name: s.name, label: s.label || s.name, ...projection, assumptions: s.assumptions };
  });
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
function round4(n) {
  return Math.round(n * 10000) / 10000;
}
function fmtNum(n) {
  return `€${round2(n).toLocaleString('en')}`;
}

function normalizePlannerInput(body) {
  return {
    principal: Number(body.principal) || 0,
    monthlyContribution: Number(body.monthlyContribution) || 0,
    yearlyContribution: Number(body.yearlyContribution) || 0,
    contributionGrowthRate: Number(body.contributionGrowthRate) || 0,
    annualReturn: Number(body.annualReturn) ?? 7,
    inflationRate: Number(body.inflationRate) || 0,
    taxDrag: Number(body.taxDrag) || 0,
    feeDrag: Number(body.feeDrag) || 0,
    years: Number(body.years) || 20,
    months: Number(body.months) || 0,
    targetAge: body.targetAge != null ? Number(body.targetAge) : null,
    currentAge: body.currentAge != null ? Number(body.currentAge) : null,
    endDate: body.endDate || null,
    compounding: body.compounding || 'monthly',
    useRealReturns: !!body.useRealReturns,
    extraContributions: body.extraContributions || [],
    withdrawalMonthly: Number(body.withdrawalMonthly) || 0,
    withdrawalStartMonth: body.withdrawalStartMonth != null ? Number(body.withdrawalStartMonth) : null,
    dividendReinvest: body.dividendReinvest !== false,
    goalType: body.goalType || 'final_value',
    targetValue: Number(body.targetValue) || 0,
    targetMonthlyIncome: body.targetMonthlyIncome != null ? Number(body.targetMonthlyIncome) : null,
    safeWithdrawalRate: Number(body.safeWithdrawalRate) || 4,
    solveFor: body.solveFor || 'contribution',
    mode: body.mode || 'project',
  };
}

module.exports = {
  COMPOUNDING_PERIODS,
  GOAL_TYPES,
  runProjection,
  runGoalSolver,
  runScenarioComparison,
  passiveIncomeFromPortfolio,
  portfolioForPassiveIncome,
  normalizePlannerInput,
  buildInsights,
  monthsFromTime,
};
