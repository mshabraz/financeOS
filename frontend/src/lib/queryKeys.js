/** Shared React Query keys — keep dashboard and settings caches in sync. */

export const DASHBOARD_QUERY_ROOTS = [
  'assets',
  'manualBalances',
  'monthlyTrend',
  'summary',
  'bycat',
  'trend',
  'savingsRateTrend',
  'byincome',
  'merchants',
  'recurring',
  'budgets',
  'invAnalytics',
  'wealthGoals',
  'wealthGoalProgress',
  'obligationsSummary',
  'obligations',
  'tagSummary',
  'sharedEvents',
  'transactions',
];

export function invalidateDashboardData(qc) {
  DASHBOARD_QUERY_ROOTS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export function invalidateAssets(qc) {
  qc.invalidateQueries({ queryKey: ['assets'] });
  qc.invalidateQueries({ queryKey: ['manualBalances'] });
}
