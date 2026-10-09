import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import clsx from 'clsx';
import {
  getDashboardSummary, getMonthlyTrend,
  getAssets, getBudgets, getSharedEvents,
  getManualBalances, updateManualBalance, addManualBalance, deleteManualBalance,
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
import DashboardWealthPortfolio from '../components/dashboard/DashboardWealthPortfolio';
import DashboardAttention from '../components/dashboard/DashboardAttention';
import DashboardAssets from '../components/dashboard/DashboardAssets';
import DashboardAllocationTracker from '../components/dashboard/DashboardAllocationTracker';

const now = new Date();
const currentMonth = format(now, 'yyyy-MM');

export default function Dashboard() {
  usePrivacy();
  const qc = useQueryClient();

  const [periodType, setPeriodType] = useState('month');
  const [periodValue, setPeriodValue] = useState(currentPeriodValue('month'));
  const [addingAsset, setAddingAsset] = useState(false);
  const [newAssetForm, setNewAssetForm] = useState({ key: '', label: '', icon: '💵', amount: '' });

  const periodOptions = useMemo(() => buildPeriodOptions(periodType), [periodType]);
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
  const manuals = useQuery({ queryKey: ['manualBalances'], queryFn: getManualBalances, staleTime: 60_000 });
  const monthlyTrend = useQuery({
    queryKey: ['monthlyTrend'],
    queryFn: () => getMonthlyTrend({ months: 12 }),
  });
  const budgets = useQuery({
    queryKey: ['budgets', currentMonth],
    queryFn: () => getBudgets(currentMonth),
  });
  const sharedEvents = useQuery({ queryKey: ['sharedEvents'], queryFn: getSharedEvents });

  const invalidateAssets = () => {
    qc.invalidateQueries({ queryKey: ['assets'] });
    qc.invalidateQueries({ queryKey: ['manualBalances'] });
  };

  const updateMut = useMutation({
    mutationFn: ({ key, amount, label }) => updateManualBalance(key, amount, label),
    onSuccess: invalidateAssets,
  });
  const addMut = useMutation({
    mutationFn: (data) => addManualBalance(data),
    onSuccess: () => {
      invalidateAssets();
      setAddingAsset(false);
      setNewAssetForm({ key: '', label: '', icon: '💵', amount: '' });
    },
  });
  const deleteMut = useMutation({
    mutationFn: (key) => deleteManualBalance(key),
    onSuccess: invalidateAssets,
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
        analytics: null,
        goalsProgress: null,
      }),
    [s, prevSummary.data, monthlyTrend.data, budgets.data, portfolio],
  );

  const attention = useMemo(() => {
    const actionItems = buildAttentionItems({
      portfolio,
      budgets: budgets.data,
      sharedEvents: sharedEvents.data,
      obligationsSummary: null,
    });
    const insightItems = insightsToAttentionItems(insights).filter(
      (i) => !/portfolio|diversif|holding/i.test(`${i.title || ''} ${i.body || ''}`),
    );
    return [...actionItems, ...insightItems];
  }, [portfolio, budgets.data, sharedEvents.data, insights]);

  const loadError = summary.error || assets.error;
  const heroLoading = summary.isLoading || assets.isLoading;

  const handleAddAsset = () => {
    const label = newAssetForm.label.trim();
    if (!label) return;
    const key =
      newAssetForm.key.trim() ||
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 40) ||
      `asset_${Date.now()}`;
    addMut.mutate({
      key,
      label,
      icon: newAssetForm.icon || '💵',
      amount: parseFloat(newAssetForm.amount) || 0,
    });
  };

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
            Net worth and cash flow at a glance
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
        snapshot={snapshot}
        isLoading={assets.isLoading}
      />

      <DashboardAllocationTracker />

      <DashboardAssets
        assets={assets.data}
        manuals={manuals.data ?? assets.data?.manuals}
        isLoading={assets.isLoading || manuals.isLoading}
        addingAsset={addingAsset}
        setAddingAsset={setAddingAsset}
        newAssetForm={newAssetForm}
        setNewAssetForm={setNewAssetForm}
        onUpdate={(key, amount, label) => updateMut.mutate({ key, amount, label })}
        onAdd={handleAddAsset}
        onDelete={(key) => {
          if (window.confirm('Remove this asset from net worth?')) deleteMut.mutate(key);
        }}
      />
    </div>
  );
}
