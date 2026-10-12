import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend, ReferenceLine,
} from 'recharts';
import { format, subMonths, startOfYear } from 'date-fns';
import { RefreshCw, PiggyBank } from 'lucide-react';
import clsx from 'clsx';
import {
  getMonthlyTrend, getByCategory, getBudgets, upsertBudget, getCategories,
  getTopMerchants, getRecurring, getEssentialMetrics,
} from '../api/client';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import QueryErrorPanel from '../components/ui/QueryErrorPanel';
import MonthFilterSelect from '../components/ui/MonthFilterSelect';
import DatePicker from '../components/ui/DatePicker';
import { ChartTooltipContent } from '../components/ui/ChartTooltip';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../components/ui/Select';
import { getMonthRange } from '../utils/dateFilters';
import { fmtEur, privText } from '../utils/displayFormat';
import { usePrivacy } from '../context/PrivacyContext';
import { useUrlQueryState } from '../hooks/useUrlQueryState';

const fmt = fmtEur;

// ── Period presets ────────────────────────────────────────────────────────────

const today    = new Date();
const todayStr = format(today, 'yyyy-MM-dd');

function buildPresets() {
  const mo = (n) => format(subMonths(today, n), 'yyyy-MM-dd');
  const thisMonthStart = format(today, 'yyyy-MM') + '-01';
  const ytdStart = format(startOfYear(today), 'yyyy-MM-dd');

  return [
    { id: 'month',  label: 'This Month',  dateFrom: thisMonthStart, dateTo: todayStr },
    { id: '3m',     label: 'Last 3 M',    dateFrom: mo(3),          dateTo: todayStr },
    { id: '6m',     label: 'Last 6 M',    dateFrom: mo(6),          dateTo: todayStr },
    { id: 'ytd',    label: 'Year to Date', dateFrom: ytdStart,       dateTo: todayStr },
    { id: '12m',    label: 'Last 12 M',   dateFrom: mo(12),         dateTo: todayStr },
    { id: '24m',    label: 'Last 24 M',   dateFrom: mo(24),         dateTo: todayStr },
    { id: 'all',    label: 'All Time',    dateFrom: null,            dateTo: null     },
    { id: 'custom', label: 'Custom',      dateFrom: null,            dateTo: null     },
  ];
}

const PRESETS = buildPresets();

// ── Budget month list ─────────────────────────────────────────────────────────
const currentMonth = format(today, 'yyyy-MM');
const monthOptions = Array.from({ length: 24 }, (_, i) =>
  format(subMonths(today, i), 'yyyy-MM')
);

// ── Analytics page ────────────────────────────────────────────────────────────

export default function Analytics() {
  usePrivacy();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const savingsSectionRef = useRef(null);
  const focusSavings = searchParams.get('focus') === 'savings-rate';

  // Period selection
  const [presetId]    = useUrlQueryState('preset', 'month', { replace: false });
  const [filterMonth] = useUrlQueryState('month', '', { replace: false });
  const [customFrom,  setCustomFrom]  = useUrlQueryState('from', '', { replace: false });
  const [customTo,    setCustomTo]    = useUrlQueryState('to', todayStr, { replace: false });

  // Budget section (always month-based)
  const [budgetMonth, setBudgetMonth] = useUrlQueryState('bmonth', currentMonth, { replace: false });
  const [budgetCat,   setBudgetCat]   = useState('');
  const [budgetAmt,   setBudgetAmt]   = useState('');

  const selectPreset = (id) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('month');
      if (id === 'month') {
        next.delete('preset');
      } else {
        next.set('preset', id);
      }
      if (id !== 'custom') {
        next.delete('from');
        next.delete('to');
      }
      return next;
    }, { replace: false });
  };

  const onMonthFilterChange = (v) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v) {
        next.set('month', v);
        next.delete('preset');
        next.delete('from');
        next.delete('to');
      } else {
        next.delete('month');
      }
      return next;
    }, { replace: false });
  };

  // Derive the active date range
  const { dateFrom, dateTo, label: periodLabel } = useMemo(() => {
    if (filterMonth) {
      const { dateFrom: f, dateTo: t } = getMonthRange(filterMonth);
      return { dateFrom: f, dateTo: t, label: filterMonth };
    }
    if (presetId === 'custom') {
      return {
        dateFrom: customFrom || null,
        dateTo:   customTo   || null,
        label:    customFrom ? `${customFrom} → ${customTo}` : 'Custom',
      };
    }
    const p = PRESETS.find((p) => p.id === presetId) || PRESETS[0];
    return { dateFrom: p.dateFrom, dateTo: p.dateTo, label: p.label };
  }, [filterMonth, presetId, customFrom, customTo]);

  const rangeParams = useMemo(() => {
    return {
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo   ? { dateTo   } : {}),
    };
  }, [dateFrom, dateTo]);

  // Queries
  const trend    = useQuery({
    queryKey: ['trend', rangeParams],
    queryFn:  () => getMonthlyTrend(rangeParams),
  });
  const savingsTrend = useQuery({
    queryKey: ['savingsRateTrend', 12],
    queryFn: () => getMonthlyTrend({ months: 12 }),
    staleTime: 120_000,
  });
  const savingsRateSeries = useMemo(() => {
    return (savingsTrend.data ?? []).map((r) => {
      const income = r.income ?? 0;
      const expenses = r.expenses ?? 0;
      const rate = income > 0 ? ((income - expenses) / income) * 100 : null;
      const label = typeof r.month === 'string' && r.month.length >= 7 ? r.month.slice(5) : r.month;
      return {
        month: r.month,
        label,
        savingsRate: rate,
        income,
        expenses,
        netSavings: income - expenses,
      };
    });
  }, [savingsTrend.data]);

  useEffect(() => {
    if (!focusSavings || savingsTrend.isLoading) return;
    const t = window.setTimeout(() => {
      savingsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
    return () => window.clearTimeout(t);
  }, [focusSavings, savingsTrend.isLoading]);
  const byCat    = useQuery({
    queryKey: ['bycat', rangeParams],
    queryFn:  () => getByCategory({ ...rangeParams, type: 'expense' }),
  });
  const byIncome = useQuery({
    queryKey: ['byincome', rangeParams],
    queryFn:  () => getByCategory({ ...rangeParams, type: 'income' }),
  });
  const budgets  = useQuery({ queryKey: ['budgets', budgetMonth], queryFn: () => getBudgets(budgetMonth) });
  const cats     = useQuery({ queryKey: ['categories'],            queryFn: getCategories });
  const merchants = useQuery({
    queryKey: ['merchants', rangeParams],
    queryFn: () => getTopMerchants({ ...rangeParams, limit: 10 }),
  });
  const recurring = useQuery({
    queryKey: ['recurring', rangeParams.dateFrom, rangeParams.dateTo],
    queryFn: () => getRecurring(rangeParams),
  });
  const essentialMetrics = useQuery({
    queryKey: ['essentialMetrics', rangeParams.dateFrom, rangeParams.dateTo],
    queryFn: () => getEssentialMetrics(rangeParams),
    retry: 1,
  });

  const budgetMut = useMutation({
    mutationFn: upsertBudget,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] });
      setBudgetCat('');
      setBudgetAmt('');
    },
  });

  // Summary totals from trend data
  const totalIncome   = trend.data?.reduce((s, r) => s + (r.income   || 0), 0) ?? 0;
  const totalExpenses = trend.data?.reduce((s, r) => s + (r.expenses || 0), 0) ?? 0;
  const totalCatSpend = byCat.data?.reduce((s, r) => s + (r.total   || 0), 0) ?? 0;
  const loadError = trend.error || byCat.error || byIncome.error;

  if (loadError) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Analytics</h1>
        <QueryErrorPanel
          title="Could not load analytics"
          message={loadError.message}
          onRetry={() => {
            trend.refetch();
            byCat.refetch();
            byIncome.refetch();
            essentialMetrics.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Header + period selector ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
        </div>

        {/* Period presets */}
        <div className="flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto">
          <MonthFilterSelect
            value={filterMonth}
            onChange={onMonthFilterChange}
            className="input w-full sm:w-48 text-sm"
          />
          <div className="scroll-x">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectPreset(p.id)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  !filterMonth && presetId === p.id
                    ? 'bg-brand-600 border-brand-600 text-white shadow-sm'
                    : 'border-black/[0.08] dark:border-white/[0.08] bg-white/60 dark:bg-slate-900/40 backdrop-blur-sm text-slate-600 dark:text-slate-400 hover:border-brand-500/50 hover:text-brand-600 dark:hover:text-brand-400'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom date pickers */}
          {presetId === 'custom' && !filterMonth && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
              <DatePicker value={customFrom} onChange={setCustomFrom} placeholder="From" className="flex-1" />
              <span className="text-xs text-gray-400 text-center">to</span>
              <DatePicker value={customTo} onChange={setCustomTo} placeholder="To" className="flex-1" />
            </div>
          )}
        </div>
      </div>

      {/* ── Period summary totals & Runway ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Net income',   value: totalIncome,   color: 'text-green-600' },
          { label: 'Net expenses', value: totalExpenses, color: 'text-red-500'   },
          { label: 'Net savings',    value: totalIncome - totalExpenses,
            color: totalIncome - totalExpenses >= 0 ? 'text-green-600' : 'text-red-500',
            hint: 'Excludes pension & investment transfers' },
        ].map(({ label, value, color, hint }) => (
          <div key={label} className="card p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label} · {periodLabel}</p>
            <p className={clsx('text-2xl font-bold', color)}>{fmt(value)}</p>
            {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
          </div>
        ))}
        <div className="card p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            Income runway duration
          </p>
          {essentialMetrics.isLoading ? (
            <p className="text-sm text-gray-400">Calculating...</p>
          ) : essentialMetrics.isError ? (
            <p className="text-sm text-red-500">
              {essentialMetrics.error?.message || 'Could not load runway metrics'}
            </p>
          ) : (
            <>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {essentialMetrics.data?.incomeRunwayMonths == null
                  ? 'N/A'
                  : `${essentialMetrics.data.incomeRunwayMonths.toFixed(1)} months`}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                Liquid assets ({fmt(essentialMetrics.data?.liquidAssets || 0)}) / avg monthly essential expenses ({fmt(essentialMetrics.data?.monthlyEssentialExpenses || 0)})
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Expense + income breakdowns side by side ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Expenses by category */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Expenses by category
            </h2>
            <span className="text-xs font-semibold text-red-500">{fmt(totalCatSpend)}</span>
          </div>
          {byCat.isLoading ? <LoadingSpinner /> : !byCat.data?.length ? (
            <p className="text-sm text-gray-400 py-8 text-center">No expense data for this period</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, byCat.data.length * 36)}>
              <BarChart data={byCat.data} layout="vertical" margin={{ left: 100, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-gray-200 dark:stroke-gray-700" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `€${v}`} />
                <YAxis
                  type="category" dataKey="name" tick={{ fontSize: 11 }} width={95}
                  tickFormatter={(v, i) => `${byCat.data?.[i]?.icon ?? ''} ${v}`}
                />
                <Tooltip
                  content={<ChartTooltipContent valueFormatter={(v) => fmt(v)} />}
                  cursor={{ fill: 'currentColor', opacity: 0.05 }}
                />
                <Bar dataKey="total" name="Net" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 10, formatter: (v) => fmt(v) }}>
                  {byCat.data?.map((entry, i) => (
                    <Cell key={i} fill={entry.total < 0 ? '#64748b' : (entry.color ?? '#94a3b8')} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Income by category */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Income by category
            </h2>
            <span className="text-xs font-semibold text-green-600">
              {fmt(byIncome.data?.reduce((s, r) => s + (r.total || 0), 0))}
            </span>
          </div>
          {byIncome.isLoading ? <LoadingSpinner /> : !byIncome.data?.length ? (
            <p className="text-sm text-gray-400 py-8 text-center">No income data for this period</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, (byIncome.data?.length ?? 1) * 36)}>
              <BarChart data={byIncome.data} layout="vertical" margin={{ left: 100, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-gray-200 dark:stroke-gray-700" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `€${v}`} />
                <YAxis
                  type="category" dataKey="name" tick={{ fontSize: 11 }} width={95}
                  tickFormatter={(v, i) => `${byIncome.data?.[i]?.icon ?? ''} ${v}`}
                />
                <Tooltip
                  content={<ChartTooltipContent valueFormatter={(v) => fmt(v)} />}
                  cursor={{ fill: 'currentColor', opacity: 0.05 }}
                />
                <Bar dataKey="total" name="Net" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 10, formatter: (v) => fmt(v) }}>
                  {byIncome.data?.map((e, i) => (
                    <Cell key={i} fill={e.total < 0 ? '#64748b' : (e.color ?? '#10b981')} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Savings rate (12 months) ── */}
      <div
        id="savings-rate"
        ref={savingsSectionRef}
        className={clsx(
          'card p-4 sm:p-5 scroll-mt-20',
          focusSavings && 'ring-2 ring-brand-500/40',
        )}
      >
        <div className="flex items-start gap-2.5 mb-4">
          <div className="p-2 rounded-xl bg-brand-500/10 text-brand-600 shrink-0">
            <PiggyBank size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Savings rate — last 12 months
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              (Net income − net expenses) ÷ net income per month — same formula as the dashboard KPI
            </p>
          </div>
        </div>
        {savingsTrend.isLoading ? (
          <LoadingSpinner />
        ) : !savingsRateSeries.length ? (
          <p className="text-sm text-gray-400 py-8 text-center">No monthly data yet</p>
        ) : (
          <div className="h-52 sm:h-60 min-h-[13rem] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={savingsRateSeries} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `${v}%`}
                  domain={['auto', 'auto']}
                  width={40}
                />
                <Tooltip
                  content={
                    <ChartTooltipContent
                      valueFormatter={(v) => (v != null ? `${Number(v).toFixed(1)}%` : '—')}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.month ?? ''}
                    />
                  }
                  cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '3 3' }}
                />
                <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                <ReferenceLine y={15} stroke="#10b981" strokeDasharray="2 4" strokeOpacity={0.5} label={{ value: '15%', position: 'right', fontSize: 10, fill: '#10b981' }} />
                <Line
                  type="monotone"
                  dataKey="savingsRate"
                  name="Savings rate"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Trend chart ── */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
          Income vs Expenses — {periodLabel}
        </h2>
        {trend.isLoading ? <LoadingSpinner /> : (
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={trend.data}>
              <defs>
                <linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(2)} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `€${v}`} />
              <Tooltip
                content={<ChartTooltipContent valueFormatter={(v) => fmt(v)} />}
              />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="income"   name="Net income"   stroke="#10b981" fill="url(#incGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="expenses" name="Net expenses" stroke="#f43f5e" fill="url(#expGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Budget Tracking ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Budget Tracking
          </h2>
          <Select value={budgetMonth} onValueChange={setBudgetMonth}>
            <SelectTrigger className="w-36 h-9 min-h-[36px] text-xs">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m} className="text-xs">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Add / update budget form */}
        <div className="flex gap-2 mb-5 flex-wrap">
          <Select value={budgetCat || 'none'} onValueChange={(val) => setBudgetCat(val === 'none' ? '' : val)}>
            <SelectTrigger className="flex-1 min-w-[180px]">
              <SelectValue placeholder="Select category..." />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectItem value="none">Select category...</SelectItem>
              {cats.data?.filter((c) => c.type === 'expense').map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  <span className="mr-2">{c.icon}</span>
                  <span>{c.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            type="number" placeholder="Budget €" value={budgetAmt}
            onChange={(e) => setBudgetAmt(e.target.value)}
            className="input w-32"
          />
          <button
            onClick={() => budgetMut.mutate({ categoryId: parseInt(budgetCat), month: budgetMonth, amount: parseFloat(budgetAmt) })}
            disabled={!budgetCat || !budgetAmt}
            className="btn-primary whitespace-nowrap"
          >
            Set Budget
          </button>
        </div>

        {/* Budget progress bars */}
        {budgets.isLoading ? <LoadingSpinner /> : (
          <div className="space-y-4">
            {budgets.data?.map((b) => {
              const pct  = Math.min(100, (b.spent / b.budgeted) * 100);
              const over = b.spent > b.budgeted;
              return (
                <div key={b.id}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-gray-800 dark:text-gray-200">{b.icon} {b.name}</span>
                    <span className={over ? 'text-red-600 font-semibold' : 'text-gray-600 dark:text-gray-400'}>
                      {fmt(b.spent)} / {fmt(b.budgeted)}
                    </span>
                  </div>
                  <div className="h-2.5 bg-black/[0.05] dark:bg-white/[0.08] rounded-full overflow-hidden">
                    <div
                      className={clsx('h-full rounded-full transition-all', over ? 'bg-red-500' : 'bg-green-500')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {over && (
                    <p className="text-xs text-red-500 mt-1">Over budget by {fmt(b.spent - b.budgeted)}</p>
                  )}
                </div>
              );
            })}
            {!budgets.data?.length && (
              <p className="text-sm text-gray-400">No budgets set for {budgetMonth}. Add one above.</p>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Top Merchants</h2>
          {merchants.isLoading ? <LoadingSpinner /> : (
            <div className="space-y-2">
              {merchants.data?.map((m, i) => {
                const max = merchants.data[0]?.total ?? 1;
                const pct = (m.total / max) * 100;
                return (
                  <div key={m.merchant + i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 dark:text-gray-300 truncate max-w-[60%]">{privText(m.merchant || '(unknown)')}</span>
                      <span className="font-medium text-gray-900 dark:text-white">{fmt(m.total)}</span>
                    </div>
                    <div className="h-1.5 bg-black/[0.05] dark:bg-white/[0.08] rounded-full overflow-hidden">
                      <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {!merchants.data?.length && <p className="text-sm text-gray-400">No data for this period</p>}
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <RefreshCw size={16} className="text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Recurring Transactions</h2>
          </div>
          {recurring.isLoading ? <LoadingSpinner /> : (
            <div className="space-y-2">
              {recurring.data?.slice(0, 10).map((r, i) => (
                <div key={i} className="flex items-center justify-between py-1 gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{privText(r.merchant)}</p>
                    <p className="text-xs text-gray-400">{r.monthCount} months detected</p>
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">~{fmt(r.avgAmount)}/mo</span>
                </div>
              ))}
              {!recurring.data?.length && <p className="text-sm text-gray-400">No recurring patterns found yet</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
