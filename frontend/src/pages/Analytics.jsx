import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts';
import { format, subMonths, startOfYear } from 'date-fns';
import { RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import {
  getMonthlyTrend, getByCategory, getBudgets, upsertBudget, getCategories,
  getTopMerchants, getRecurring,
} from '../api/client';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import MonthFilterSelect from '../components/ui/MonthFilterSelect';
import DatePicker from '../components/ui/DatePicker';
import { getMonthRange } from '../utils/dateFilters';
import { fmtEur, privText } from '../utils/displayFormat';
import { usePrivacy } from '../context/PrivacyContext';

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

  // Period selection
  const [presetId,    setPresetId]    = useState('month');
  const [filterMonth, setFilterMonth] = useState(format(today, 'yyyy-MM'));
  const [customFrom,  setCustomFrom]  = useState('');
  const [customTo,    setCustomTo]    = useState(todayStr);

  // Budget section (always month-based)
  const [budgetMonth, setBudgetMonth] = useState(currentMonth);
  const [budgetCat,   setBudgetCat]   = useState('');
  const [budgetAmt,   setBudgetAmt]   = useState('');

  // Derive the active date range
  const { dateFrom, dateTo, label: periodLabel } = useMemo(() => {
    if (presetId === 'custom') {
      return {
        dateFrom: customFrom || null,
        dateTo:   customTo   || null,
        label:    customFrom ? `${customFrom} → ${customTo}` : 'Custom',
      };
    }
    const p = PRESETS.find((p) => p.id === presetId) || PRESETS[0];
    return { dateFrom: p.dateFrom, dateTo: p.dateTo, label: p.label };
  }, [presetId, customFrom, customTo]);

  const rangeParams = useMemo(() => {
    if (filterMonth) {
      const { dateFrom: f, dateTo: t } = getMonthRange(filterMonth);
      return { dateFrom: f, dateTo: t };
    }
    return {
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo   ? { dateTo   } : {}),
    };
  }, [filterMonth, dateFrom, dateTo]);

  const onMonthFilterChange = (v) => {
    setFilterMonth(v);
    if (v) {
      setPresetId('custom');
      const { dateFrom: f, dateTo: t } = getMonthRange(v);
      setCustomFrom(f);
      setCustomTo(t);
    }
  };

  // Queries
  const trend    = useQuery({
    queryKey: ['trend', dateFrom, dateTo],
    queryFn:  () => getMonthlyTrend(rangeParams),
  });
  const byCat    = useQuery({
    queryKey: ['bycat', dateFrom, dateTo],
    queryFn:  () => getByCategory({ ...rangeParams, type: 'expense' }),
  });
  const byIncome = useQuery({
    queryKey: ['byincome', dateFrom, dateTo],
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

  return (
    <div className="space-y-6">

      {/* ── Header + period selector ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Spending trends and category breakdowns</p>
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
                onClick={() => { setFilterMonth(''); setPresetId(p.id); }}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  presetId === p.id
                    ? 'bg-brand-600 border-brand-600 text-white'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-brand-400 hover:text-brand-600'
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

      {/* ── Period summary totals ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
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
              <Tooltip formatter={(v) => fmt(v)} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="income"   name="Net income"   stroke="#10b981" fill="url(#incGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="expenses" name="Net expenses" stroke="#f43f5e" fill="url(#expGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
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
          <p className="text-xs text-gray-400 -mt-3 mb-4">
            Net in each category: sum of debits minus sum of credits (e.g. your share after someone reimburses you).
          </p>
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
                <Tooltip formatter={(v, n, { payload }) => [fmt(v), payload?.name]} />
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
          <p className="text-xs text-gray-400 -mt-3 mb-4">
            Net in each category: sum of credits minus sum of debits (e.g. chargebacks reduce salary shown here).
          </p>
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
                <Tooltip formatter={(v, n, { payload }) => [fmt(v), payload?.name]} />
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

      {/* ── Budget Tracking ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Budget Tracking
          </h2>
          {/* Budget always uses a month selector independent of the analysis period */}
          <select value={budgetMonth} onChange={(e) => setBudgetMonth(e.target.value)} className="input text-xs py-1.5 w-36">
            {monthOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* Add / update budget form */}
        <div className="flex gap-2 mb-5 flex-wrap">
          <select value={budgetCat} onChange={(e) => setBudgetCat(e.target.value)} className="input flex-1 min-w-[180px]">
            <option value="">Select category...</option>
            {cats.data?.filter((c) => c.type === 'expense').map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
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
                  <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
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
                    <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
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
