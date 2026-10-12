import { useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  getDashboardSummary, getMonthlyTrend, getAssets,
} from '../api/client';
import StatCardSkeleton from '../components/ui/StatCardSkeleton';
import QueryErrorPanel from '../components/ui/QueryErrorPanel';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../components/ui/Select';
import { usePrivacy } from '../context/PrivacyContext';
import {
  currentPeriodValue, buildPeriodOptions, prevPeriodValue,
} from '../components/dashboard/dashboardUtils';
import { buildDashboardSnapshot } from '../components/dashboard/dashboardSnapshot';
import DashboardHero from '../components/dashboard/DashboardHero';
import DashboardWealthPortfolio from '../components/dashboard/DashboardWealthPortfolio';
import DashboardAllocationTracker from '../components/dashboard/DashboardAllocationTracker';

export default function Dashboard() {
  usePrivacy();
  const [searchParams, setSearchParams] = useSearchParams();

  const periodType = useMemo(() => {
    const raw = searchParams.get('ptype');
    return ['month', 'quarter', 'year'].includes(raw) ? raw : 'month';
  }, [searchParams]);

  const periodValue = useMemo(() => {
    const raw = searchParams.get('pval');
    if (periodType === 'month') {
      return /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : currentPeriodValue('month');
    }
    if (periodType === 'quarter') {
      return /^\d{4}-Q[1-4]$/.test(raw) ? raw : currentPeriodValue('quarter');
    }
    if (periodType === 'year') {
      return /^\d{4}$/.test(raw) ? raw : currentPeriodValue('year');
    }
    return currentPeriodValue('month');
  }, [searchParams, periodType]);

  const setPeriod = useCallback(
    (nextType, nextValue) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const t = nextType || periodType;
          const v = nextValue || currentPeriodValue(t);

          if (t === 'month') {
            next.delete('ptype');
          } else {
            next.set('ptype', t);
          }

          if (t === 'month' && v === currentPeriodValue('month')) {
            next.delete('pval');
          } else {
            next.set('pval', v);
          }
          return next;
        },
        { replace: false }
      );
    },
    [periodType, setSearchParams]
  );

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
  const monthlyTrend = useQuery({
    queryKey: ['monthlyTrend'],
    queryFn: () => getMonthlyTrend({ months: 12 }),
  });

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
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.04] dark:border-white/[0.06] rounded-lg p-0.5 text-sm backdrop-blur-sm">
            {['month', 'quarter', 'year'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setPeriod(t, currentPeriodValue(t))}
                className={clsx(
                  'px-3 py-1.5 rounded-md font-medium capitalize transition-all',
                  periodType === t
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-black/[0.04] dark:border-white/[0.06]'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <Select
            value={String(periodValue ?? (periodOptions[0]?.value ?? ''))}
            onValueChange={(val) => setPeriod(periodType, val)}
          >
            <SelectTrigger className="w-full sm:w-44 text-sm">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {periodOptions.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {heroLoading ? (
        <StatCardSkeleton count={4} />
      ) : (
        <DashboardHero
          snapshot={snapshot}
          netWorthConversion={assets.data?.netWorthConversion}
          portfolio={portfolio}
          summary={s}
          trendSpark={trendData.map((r) => r.expenses)}
        />
      )}

      <DashboardWealthPortfolio
        assets={assets.data}
        portfolio={portfolio}
        snapshot={snapshot}
        isLoading={assets.isLoading}
      />

      <DashboardAllocationTracker />
    </div>
  );
}
