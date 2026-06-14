import { fmtPct } from '../../utils/displayFormat';

/** Single computed snapshot for dashboard — avoids duplicate KPI math across sections. */
export function buildDashboardSnapshot({
  assets,
  portfolio,
  summary,
  prevSummary,
  savingsRate,
}) {
  const netWorth = assets?.totalAssets ?? 0;
  const bankBalance = assets?.bankBalance ?? 0;
  const revolutBalance = assets?.revolutClosingBalance ?? assets?.revolutSharedAsset ?? 0;
  const invCash = portfolio?.cashBalance ?? 0;
  const investmentsTotal =
    portfolio?.totalPortfolio
    ?? assets?.manuals?.find((m) => m.key === 'investments')?.amount
    ?? 0;

  const totalCash = bankBalance + revolutBalance + invCash;

  const pctOfNet = (amount) =>
    netWorth > 0 && amount != null ? (amount / netWorth) * 100 : null;

  const expenseDelta =
    summary && prevSummary?.totalExpenses != null
      ? ((summary.totalExpenses - prevSummary.totalExpenses)
        / Math.abs(prevSummary.totalExpenses || 1)) * 100
      : null;

  const netFlow = (summary?.totalIncome ?? 0) - (summary?.totalExpenses ?? 0);

  return {
    netWorth,
    totalCash,
    investmentsTotal,
    bankBalance,
    revolutShare: revolutBalance,
    invCash,
    holdingsValue: portfolio?.holdingsValue ?? 0,
    unrealizedPnLEur: portfolio?.unrealizedPnLEur,
    unrealizedPnLPct: portfolio?.unrealizedPnLPct,
    periodSpending: summary?.totalExpenses ?? 0,
    periodIncome: summary?.totalIncome ?? 0,
    savingsRate,
    netFlow,
    expenseDelta,
    investmentsPct: pctOfNet(investmentsTotal),
    cashPct: pctOfNet(totalCash),
    contextLine: (label, pct) =>
      pct != null ? `${label} · ${fmtPct(pct, { decimals: 0 })} of net worth` : label,
  };
}
