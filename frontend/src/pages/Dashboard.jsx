import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import clsx from 'clsx';
import {
  getDashboardSummary, getByCategory, getMonthlyTrend,
  getAssets, getBudgets, getInvestmentAnalytics,
  getSharedEvents, getObligationsSummary, getObligations,
} from '../api/client';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import QueryErrorPanel from '../components/ui/QueryErrorPanel';
import { usePrivacy } from '../context/PrivacyContext';
import {
  currentPeriodValue, buildPeriodOptions, prevPeriodValue,
  buildDashboardInsights, buildAttentionItems, insightsToAttentionItems,
} from '../components/dashboard/dashboardUtils';
import { buildDashboardSnapshot } from '../components/dashboard/dashboardSnapshot';
import DashboardHero from '../components/dashboard/DashboardHero';
import DashboardSpending from '../components/dashboard/DashboardSpending';
import DashboardWealthPortfolio from '../components/dashboard/DashboardWealthPortfolio';
import DashboardAttention from '../components/dashboard/DashboardAttention';
import DashboardObligations from '../components/dashboard/DashboardObligations';

const now = new Date();
const currentMonth = format(now, 'yyyy-MM');

export default function Dashboard() {
  usePrivacy();

  const [periodType, setPeriodType] = useState('month');
  const [periodValue, setPeriodValue] = useState(currentPeriodValue('month'));

  const periodOptions = useMemo(() => buildPeriodOptions(periodType), [periodType]);
  const periodLabel = periodOptions.find((o) => o.value === periodValue)?.label ?? periodValue;
  const prevPeriod = prevPeriodValue(periodType, periodValue);

  const summary = useQuery({
    queryKey: ['summary', periodType, periodValue],
    queryFn: () => getDashboardSummary(periodType, periodValue),
  });
  const prevSummary = useQuery({
    queryKey: ['summary', periodType, prevPeriod],
    queryFn: () => getDashboardSummary(periodType, prevPeriod),
    enabled: !!prevPeriod,
  });
  const assets = useQuery({ queryKey: ['assets'], queryFn: getAssets, staleTime: 60_000 });
  const byCategory = useQuery({
    queryKey: ['bycat', periodType, periodValue],
    queryFn: () => getByCategory({ periodType, periodValue, type: 'expense' }),
  });
  const monthlyTrend = useQuery({
    queryKey: ['monthlyTrend'],
    queryFn: () => getMonthlyTrend({ months: 12 }),
  });
  const budgets = useQuery({
    queryKey: ['budgets', currentMonth],
    queryFn: () => getBudgets(currentMonth),
  });
  const invAnalytics = useQuery({
    queryKey: ['invAnalytics', 'dash'],
    queryFn: () => getInvestmentAnalytics({ period: '3M' }),
    staleTime: 120_000,
  });
  const sharedEvents = useQuery({ queryKey: ['sharedEvents'], queryFn: getSharedEvents });
  const obligationsSummary = useQuery({ queryKey: ['obligationsSummary'], queryFn: getObligationsSummary });
  const obligationsMonth = useQuery({
    queryKey: ['obligations', 'upcoming'],
    queryFn: () => getObligations({ filter: 'upcoming' }),
  });

  const handlePeriodTypeChange = (type) => {
    setPeriodType(type);
    setPeriodValue(currentPeriodValue(type));
  };

  const trendData = useMemo(
    () =>
      (monthlyTrend.data ?? []).map((r) => ({
        ...r,
        label: typeof r.month === 'string' && r.month.length >= 7 ? r.month.slice(5) : r.month,
      })),
    [monthlyTrend.data],
  );

  const portfolio = assets.data?.investmentPortfolio;
  const s = summary.data;
  const savingsRate =
    s?.totalIncome > 0 ? ((s.totalIncome - s.totalExpenses) / s.totalIncome) * 100 : null;

  const snapshot = useMemo(
    () =>
      buildDashboardSnapshot({
        assets: assets.data,
        portfolio,
        summary: s,
        prevSummary: prevSummary.data,
        savingsRate,
      }),
    [assets.data, portfolio, s, prevSummary.data, savingsRate],
  );

  const insights = useMemo(
    () =>
      buildDashboardInsights({
        summary: s,
        prevSummary: prevSummary.data,
        monthlyTrend: monthlyTrend.data,
        budgets: budgets.data,
        portfolio,
        analytics: invAnalytics.data,
        goalsProgress: null,
      }),
    [s, prevSummary.data, monthlyTrend.data, budgets.data, portfolio, invAnalytics.data],
  );

  const attention = useMemo(() => {
    const actionItems = buildAttentionItems({
      portfolio,
      budgets: budgets.data,
      sharedEvents: sharedEvents.data,
      obligationsSummary: obligationsSummary.data,
    });
    const insightItems = insightsToAttentionItems(insights);
    return [...actionItems, ...insightItems];
  }, [portfolio, budgets.data, sharedEvents.data, obligationsSummary.data, insights]);

  const loadError = summary.error || assets.error;
  const heroLoading = summary.isLoading || assets.isLoading;

  if (loadError) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Dashboard</h1>
        <QueryErrorPanel
          title="Could not load dashboard"
          message={loadError.message}
          onRetry={() => {
            summary.refetch();
            assets.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto pb-8">
      <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Net worth, spending, and what needs your attention
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 text-sm">
            {['month', 'quarter', 'year'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handlePeriodTypeChange(t)}
                className={clsx(
                  'px-3 py-1.5 rounded-md font-medium capitalize transition-colors',
                  periodType === t
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <select
            value={periodValue ?? ''}
            onChange={(e) => setPeriodValue(e.target.value)}
            className="input text-sm w-full sm:w-44"
          >
            {periodOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </header>

      {heroLoading ? (
        <div className="card p-16 flex justify-center">
          <LoadingSpinner />
        </div>
      ) : (
        <DashboardHero
          snapshot={snapshot}
          netWorthConversion={assets.data?.netWorthConversion}
          portfolio={portfolio}
          summary={s}
          trendSpark={trendData.map((r) => r.expenses)}
        />
      )}

      {attention.length > 0 && <DashboardAttention items={attention} />}

      <DashboardWealthPortfolio
        assets={assets.data}
        portfolio={portfolio}
        analytics={invAnalytics.data}
        snapshot={snapshot}
        isLoading={assets.isLoading}
      />

      <DashboardSpending
        periodLabel={periodLabel}
        trendData={trendData}
        trendLoading={monthlyTrend.isLoading}
        categories={byCategory.data}
        categoriesLoading={byCategory.isLoading}
        hidePeriodTotal
      />

      <DashboardObligations
        summary={obligationsSummary.data}
        upcoming={obligationsMonth.data}
      />
    </div>
  );
}
