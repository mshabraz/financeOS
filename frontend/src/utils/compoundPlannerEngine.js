/** Client-side wealth planner engine (mirrors backend compoundInterestEngine.js) */

const COMPOUNDING_PERIODS = { yearly: 1, quarterly: 4, monthly: 12, daily: 365, continuous: -1 };

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
  if (compounding === 'continuous') return Math.exp(annualRate / 12) - 1;
  const n = COMPOUNDING_PERIODS[compounding] || 12;
  return Math.pow(1 + annualRate, 1 / n) - 1;
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

export function runProjection(input) {
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
    const extra = extrasByMonth.get(m) || 0;
    balance += extra;
    if (extra) totalContributed += extra;

    if (withdrawalStartMonth != null && m >= withdrawalStartMonth && withdrawalMonthly > 0) {
      balance = Math.max(0, balance - withdrawalMonthly);
    }
    if (monthlyRate !== 0) balance *= 1 + monthlyRate;
  }

  const final = timeline[timeline.length - 1];
  const contributionShare = final.balance > 0 ? (totalContributed / final.balance) * 100 : 0;

  return {
    finalValue: final.balance,
    finalValueReal: final.realBalance,
    totalContributed: round2(totalContributed),
    totalGains: round2(final.balance - totalContributed),
    gainPctOfFinal: round2(100 - contributionShare),
    months: totalMonths,
    years: round2(totalMonths / 12),
    timeline,
    yearlyTable,
    effectiveAnnualReturn: round2(annual * 100),
  };
}

function solveBinary(predicate, lo, hi, iterations = 48) {
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    if (predicate(mid)) hi = mid;
    else lo = mid;
  }
  return round2(hi);
}

export function portfolioForPassiveIncome(monthlyIncome, swr = 4) {
  if (swr <= 0) return 0;
  return (monthlyIncome * 12) / (swr / 100);
}

function solveMonthlyForTarget(baseInput, effectiveTarget, years) {
  return solveBinary(
    (mid) => runProjection({ ...baseInput, monthlyContribution: mid, years }).finalValue >= effectiveTarget,
    0,
    Math.max(effectiveTarget, 50000)
  );
}

/**
 * Months until finalValue >= target (binary search on month count).
 */
function solveMonthsToReach(baseInput, effectiveTarget, monthlyContribution = 0) {
  const principal = baseInput.principal || 0;
  if (principal >= effectiveTarget) return 0;

  const immediate = runProjection({
    ...baseInput,
    monthlyContribution,
    years: 0,
    months: 1,
  }).finalValue;
  if (immediate >= effectiveTarget) return 1;

  let lo = 1;
  let hi = 12 * 80;
  for (let i = 0; i < 48; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const val = runProjection({
      ...baseInput,
      monthlyContribution,
      years: 0,
      months: mid,
    }).finalValue;
    if (val >= effectiveTarget) hi = mid;
    else lo = mid + 1;
  }
  return hi;
}

export function yearsToReachGoal(baseInput, effectiveTarget, monthlyContribution = 0) {
  const principal = baseInput.principal || 0;
  if (effectiveTarget <= 0) return { years: null, months: null, alreadyReached: false };
  if (principal >= effectiveTarget) {
    return { years: 0, months: 0, alreadyReached: true };
  }
  const months = solveMonthsToReach(baseInput, effectiveTarget, monthlyContribution);
  return {
    years: round2(months / 12),
    months,
    alreadyReached: false,
  };
}

export function formatYearsToGoal({ years, months, alreadyReached }) {
  if (alreadyReached) return 'already at or above your target';
  if (months == null && years == null) return '—';
  const m = months ?? Math.round((years || 0) * 12);
  if (m <= 1) return 'about 1 month';
  if (m < 12) return `about ${m} months`;
  const y = years ?? m / 12;
  if (Math.abs(y - Math.round(y)) < 0.08) return `about ${Math.round(y)} years`;
  return `about ${round2(y)} years`;
}

/**
 * How much to save per period to hit target by each horizon (years).
 */
export function monthlyContributionForGoal(baseInput, effectiveTarget, years) {
  const monthly = solveMonthlyForTarget(baseInput, effectiveTarget, years);
  return {
    years,
    monthly,
    yearly: round2(monthly * 12),
    weekly: round2((monthly * 12) / 52),
  };
}

export function buildGoalSavingsPlan(baseInput, effectiveTarget, horizons = [5, 10, 15, 20, 25, 30]) {
  if (effectiveTarget <= 0) return { rows: [], yearsAtCurrentPace: null };

  const rows = horizons.map((years) => {
    const monthly = solveMonthlyForTarget(baseInput, effectiveTarget, years);
    const projection = runProjection({ ...baseInput, monthlyContribution: monthly, years });
    return {
      years,
      monthly,
      yearly: round2(monthly * 12),
      weekly: round2((monthly * 12) / 52),
      finalValue: projection.finalValue,
      gap: round2(Math.max(0, effectiveTarget - (baseInput.principal || 0))),
    };
  });

  return {
    rows,
    target: effectiveTarget,
  };
}

export function resolveGoalTarget(form) {
  if (form.goalKind === 'income') {
    return portfolioForPassiveIncome(
      form.targetMonthlyIncome || 0,
      form.safeWithdrawalRate || 4
    );
  }
  return form.targetValue || 0;
}

export function runGoalSolver(input) {
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

  const projection = runProjection(input);
  const result = { goalType, targetValue: effectiveTarget, projection };

  if (solveFor === 'contribution') {
    result.requiredMonthlyContribution = solveBinary(
      (mid) => runProjection({ ...input, monthlyContribution: mid }).finalValue >= effectiveTarget,
      0,
      Math.max(effectiveTarget, 10000)
    );
    result.projectionAtRequired = runProjection({
      ...input,
      monthlyContribution: result.requiredMonthlyContribution,
    });
  } else if (solveFor === 'years') {
    result.requiredYears = solveBinary(
      (mid) => runProjection({ ...input, years: mid }).finalValue >= effectiveTarget,
      0.5,
      80
    );
    result.projectionAtRequired = runProjection({ ...input, years: result.requiredYears });
    if (goalType === 'fi_date') {
      const d = new Date();
      d.setFullYear(d.getFullYear() + Math.ceil(result.requiredYears));
      result.estimatedFiDate = d.toISOString().slice(0, 10);
    }
  } else if (solveFor === 'return') {
    result.requiredAnnualReturn = solveBinary(
      (mid) => runProjection({ ...input, annualReturn: mid }).finalValue >= effectiveTarget,
      -50,
      50
    );
    result.projectionAtRequired = runProjection({ ...input, annualReturn: result.requiredAnnualReturn });
  } else if (solveFor === 'principal') {
    result.requiredStartingCapital = solveBinary(
      (mid) => runProjection({ ...input, principal: mid }).finalValue >= effectiveTarget,
      0,
      effectiveTarget
    );
    result.projectionAtRequired = runProjection({ ...input, principal: result.requiredStartingCapital });
  }

  if (goalType === 'coast_fire') {
    const yearsToTarget = result.requiredYears ?? input.years;
    const coastGrowth = runProjection({
      ...input,
      monthlyContribution: 0,
      years: yearsToTarget,
    });
    result.coastFire = {
      growTo: coastGrowth.finalValue,
      yearsWithoutContributions: yearsToTarget,
    };
  }

  return result;
}

export function runScenarioComparison(baseInput) {
  return [
    { name: 'conservative', label: 'Conservative', assumptions: { annualReturn: Math.max(0, baseInput.annualReturn - 3) } },
    { name: 'base', label: 'Base', assumptions: { annualReturn: baseInput.annualReturn } },
    { name: 'aggressive', label: 'Aggressive', assumptions: { annualReturn: baseInput.annualReturn + 3 } },
  ].map((s) => {
    const projection = runProjection({ ...baseInput, ...s.assumptions });
    return { ...s, ...projection };
  });
}

export function buildInsights(projection, input, goalTarget = null) {
  const insights = [];
  insights.push({
    type: 'info',
    text: goalTarget
      ? `Target portfolio ${formatEur(goalTarget)} — horizon ${projection.years} years at current settings.`
      : `Projected ${formatEur(projection.finalValue)} in ${projection.years} years.`,
  });
  if (projection.gainPctOfFinal > 0) {
    insights.push({
      type: 'positive',
      text: `Compounding drives ~${projection.gainPctOfFinal}% of the end value; contributions ~${100 - projection.gainPctOfFinal}%.`,
    });
  }
  const bumped = runProjection({ ...input, monthlyContribution: (input.monthlyContribution || 0) + 200 });
  const delta = bumped.finalValue - projection.finalValue;
  if (delta > 100) {
    insights.push({
      type: 'tip',
      text: `+€200/month adds ~${formatEur(delta)} over the same period.`,
    });
  }
  return insights;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function formatEur(n) {
  return new Intl.NumberFormat('et-EE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

export const BASIS_OPTIONS = [
  { id: 'manual', label: 'Manual input' },
  { id: 'portfolio', label: 'Investment portfolio (total)' },
  { id: 'portfolio_no_cash', label: 'Holdings only (excl. cash)' },
  { id: 'net_worth', label: 'Total assets (Dashboard)' },
  { id: 'broker', label: 'One broker account' },
  { id: 'tickers', label: 'Selected holdings' },
];

export const GOAL_TYPE_OPTIONS = [
  { id: 'final_value', label: 'Portfolio value target' },
  { id: 'net_worth', label: 'Net worth target' },
  { id: 'passive_income', label: 'Passive income (monthly)' },
  { id: 'fire', label: 'FIRE / retirement' },
  { id: 'savings_milestone', label: 'Savings milestone' },
  { id: 'coast_fire', label: 'Coast FIRE' },
  { id: 'fi_date', label: 'Financial independence date' },
];

export const SOLVE_FOR_OPTIONS = [
  { id: 'contribution', label: 'Required monthly contribution' },
  { id: 'years', label: 'Required timeline (years)' },
  { id: 'return', label: 'Required annual return %' },
  { id: 'principal', label: 'Required starting capital' },
];

export const COMPOUNDING_OPTIONS = [
  { id: 'yearly', label: 'Yearly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'daily', label: 'Daily' },
  { id: 'continuous', label: 'Continuous' },
];

export const DEFAULT_PLANNER = {
  mode: 'tracking',
  basis: 'portfolio',
  plannerBroker: '',
  goalKind: 'balance',
  goalDeadlineYears: 20,
  principal: 50000,
  monthlyContribution: 500,
  yearlyContribution: 0,
  contributionGrowthRate: 3,
  annualReturn: 7,
  inflationRate: 2.5,
  taxDrag: 0,
  feeDrag: 0.2,
  years: 20,
  months: 0,
  currentAge: 35,
  targetAge: null,
  endDate: '',
  compounding: 'monthly',
  useRealReturns: false,
  dividendReinvest: true,
  withdrawalMonthly: 0,
  withdrawalStartYear: null,
  goalType: 'final_value',
  targetValue: 1000000,
  targetMonthlyIncome: 5000,
  safeWithdrawalRate: 4,
  solveFor: 'contribution',
  timeMode: 'years',
};
