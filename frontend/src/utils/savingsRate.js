/** Same formula as dashboard summary: (income − expenses) / income × 100 */
export function savingsRateForMonth(income, expenses) {
  const inc = income ?? 0;
  if (inc <= 0) return null;
  return ((inc - (expenses ?? 0)) / inc) * 100;
}

export function buildSavingsRateSeries(monthlyRows) {
  return (monthlyRows ?? []).map((r) => {
    const rate = savingsRateForMonth(r.income, r.expenses);
    return {
      month: r.month,
      label: typeof r.month === 'string' && r.month.length >= 7 ? r.month.slice(2) : r.month,
      savingsRate: rate,
      income: r.income ?? 0,
      expenses: r.expenses ?? 0,
      transfers: r.savings ?? 0,
    };
  });
}
