import { useState, useMemo } from 'react';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import clsx from 'clsx';
import {
  getDashboardSummary, getByCategory, getMonthlyTrend,
  getAssets, getManualBalances, updateManualBalance, addManualBalance, deleteManualBalance,
  getBudgets, getWealthGoals, getWealthGoalProgress, getInvestmentAnalytics,
  getSharedEvents, getTagSummary,
} from '../api/client';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import QueryErrorPanel from '../components/ui/QueryErrorPanel';
import { usePrivacy } from '../context/PrivacyContext';
import {
  currentPeriodValue, buildPeriodOptions, prevMonthValue,
  buildDashboardInsights, buildAttentionItems,
} from '../components/dashboard/dashboardUtils';
import DashboardHero from '../components/dashboard/DashboardHero';
import DashboardInsights from '../components/dashboard/DashboardInsights';
import DashboardSpending from '../components/dashboard/DashboardSpending';
import DashboardInvestments from '../components/dashboard/DashboardInvestments';
import DashboardGoals from '../components/dashboard/DashboardGoals';
import DashboardAttention from '../components/dashboard/DashboardAttention';
import { DashboardRevolut, DashboardShared } from '../components/dashboard/DashboardSharedRevolut';
import DashboardAssetOverview from '../components/dashboard/DashboardAssetOverview';
import DashboardAssets from '../components/dashboard/DashboardAssets';
import {
  useDashboardFeaturedGoalId,
  resolveGoalFromList,
} from '../hooks/useGoalPreferences';

const now = new Date();
const currentMonth = format(now, 'yyyy-MM');

export default function Dashboard() {
  usePrivacy();
  const qc = useQueryClient();

  const [periodType, setPeriodType] = useState('month');
  const [periodValue, setPeriodValue] = useState(currentPeriodValue('month'));
  const [addingAsset, setAddingAsset] = useState(false);
  const [newAssetForm, setNewAssetForm] = useState({
    key: '', label: '', icon: '💰', amount: '0',
  });

  const periodOptions = useMemo(() => buildPeriodOptions(periodType), [periodType]);
  const periodLabel = periodOptions.find((o) => o.value === periodValue)?.label ?? periodValue;
  const prevMonth = periodType === 'month' ? prevMonthValue(periodValue) : null;

  const summary = useQuery({
    queryKey: ['summary', periodType, periodValue],
    queryFn: () => getDashboardSummary(periodType, periodValue),
  });
  const prevSummary = useQuery({
    queryKey: ['summary', 'month', prevMonth],
    queryFn: () => getDashboardSummary('month', prevMonth),
    enabled: !!prevMonth,
  });
  const assets = useQuery({ queryKey: ['assets'], queryFn: getAssets, staleTime: 60_000 });
  const manuals = useQuery({ queryKey: ['manualBalances'], queryFn: getManualBalances });
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
  const goals = useQuery({ queryKey: ['wealthGoals'], queryFn: () => getWealthGoals({ status: 'active' }) });
  const sharedEvents = useQuery({ queryKey: ['sharedEvents'], queryFn: getSharedEvents });
  const tagSummary = useQuery({ queryKey: ['tagSummary'], queryFn: getTagSummary });
  const [featuredGoalId, setFeaturedGoalId] = useDashboardFeaturedGoalId();

  const activeGoals = useMemo(
    () => (goals.data ?? []).filter((g) => g.status !== 'archived').slice(0, 4),
    [goals.data],
  );
  const goalProgressQueries = useQueries({
    queries: activeGoals.map((g) => ({
      queryKey: ['wealthGoalProgress', g.id],
      queryFn: () => getWealthGoalProgress(g.id),
      staleTime: 90_000,
    })),
  });
  const progressById = useMemo(() => {
    const map = {};
    activeGoals.forEach((g, i) => {
      map[g.id] = goalProgressQueries[i]?.data;
    });
    return map;
  }, [activeGoals, goalProgressQueries]);

  const updateMut = useMutation({
    mutationFn: ({ key, amount }) => updateManualBalance(key, amount),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manualBalances'] });
      qc.invalidateQueries({ queryKey: ['assets'] });
    },
  });
  const addMut = useMutation({
    mutationFn: () => addManualBalance({
      key: newAssetForm.key,
      label: newAssetForm.label,
      icon: newAssetForm.icon,
      amount: parseFloat(newAssetForm.amount) || 0,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manualBalances', 'assets'] });
      setAddingAsset(false);
      setNewAssetForm({ key: '', label: '', icon: '💰', amount: '0' });
    },
  });
  const deleteMut = useMutation({
    mutationFn: (key) => deleteManualBalance(key),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manualBalances', 'assets'] });
    },
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

  const featuredGoal = resolveGoalFromList(activeGoals, featuredGoalId);
  const featuredProgress = featuredGoal ? progressById[featuredGoal.id] : null;
  const goalSnapshot = featuredGoal
    ? {
        name: featuredGoal.name,
        pct: featuredProgress?.progressPct,
      }
    : null;

  const insights = useMemo(
    () =>
      buildDashboardInsights({
        summary: s,
        prevSummary: prevSummary.data,
        monthlyTrend: monthlyTrend.data,
        budgets: budgets.data,
        portfolio,
        analytics: invAnalytics.data,
        goalsProgress: featuredProgress
          ? {
              goalName: featuredGoal?.name,
              completed: featuredProgress.completed,
              onTrack: featuredProgress.onTrack,
              projectedHint: featuredProgress.projectedCompletionHint,
            }
          : null,
      }),
    [s, prevSummary.data, monthlyTrend.data, budgets.data, portfolio, invAnalytics.data, featuredProgress, featuredGoal],
  );

  const attention = useMemo(
    () =>
      buildAttentionItems({
        portfolio,
        budgets: budgets.data,
        sharedEvents: sharedEvents.data,
      }),
    [portfolio, budgets.data, sharedEvents.data],
  );

  const sortedTags = useMemo(() => {
    const rows = [...(tagSummary.data ?? [])];
    rows.sort((a, b) => (b.totalSpending ?? 0) - (a.totalSpending ?? 0));
    return rows.filter((t) => (t.totalSpending ?? 0) > 0);
  }, [tagSummary.data]);

  const loadError = summary.error || assets.error;
  const heroLoading = summary.isLoading || assets.isLoading;

  if (loadError) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Command center</h1>
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

  const fxNote = assets.data?.fxPkrStale
    ? 'PKR est.'
    : assets.data?.fxPkrDate
      ? `PKR ${assets.data.fxPkrDate}`
      : null;

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="page-title">Command center</h1>
          <p className="page-subtitle">Net worth, cash flow, investments, and what needs your attention</p>
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
      </div>

      {heroLoading ? (
        <div className="card p-16 flex justify-center">
          <LoadingSpinner />
        </div>
      ) : (
        <DashboardHero
          totalAssets={assets.data?.totalAssets ?? 0}
          totalAssetsPkr={assets.data?.totalAssetsPkr}
          fxNote={fxNote}
          bankBalance={assets.data?.bankBalance ?? 0}
          cashTotal={portfolio?.cashBalance ?? 0}
          investmentsTotal={portfolio?.totalPortfolio ?? assets.data?.manuals?.find((m) => m.key === 'investments')?.amount ?? 0}
          portfolio={portfolio}
          summary={s}
          prevSummary={prevSummary.data}
          savingsRate={savingsRate}
          goalSnapshot={goalSnapshot}
          trendSpark={trendData.map((r) => r.expenses)}
        />
      )}

      <DashboardAssetOverview assets={assets.data} isLoading={assets.isLoading} />

      <DashboardInsights insights={insights} />

      <DashboardAttention items={attention} />

      <DashboardSpending
        periodLabel={periodLabel}
        trendData={trendData}
        trendLoading={monthlyTrend.isLoading}
        categories={byCategory.data}
        categoriesLoading={byCategory.isLoading}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <DashboardInvestments portfolio={portfolio} analytics={invAnalytics.data} />
          <DashboardGoals
            goals={goals.data}
            progressById={progressById}
            featuredGoalId={featuredGoalId}
            onFeaturedGoalChange={setFeaturedGoalId}
          />
        </div>
        <div className="space-y-4">
          <DashboardRevolut
            assets={assets.data}
            tagSummary={sortedTags}
            monthLabel={periodLabel}
          />
          <DashboardShared events={sharedEvents.data} />
        </div>
      </div>

      <DashboardAssets
        assets={assets.data}
        manuals={manuals.data}
        isLoading={assets.isLoading}
        onUpdate={(key, amount) => updateMut.mutate({ key, amount })}
        onAdd={() => addMut.mutate()}
        onDelete={(key) => deleteMut.mutate(key)}
        addingAsset={addingAsset}
        setAddingAsset={setAddingAsset}
        newAssetForm={newAssetForm}
        setNewAssetForm={setNewAssetForm}
      />
    </div>
  );
}
