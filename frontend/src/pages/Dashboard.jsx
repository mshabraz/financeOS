import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { format, subMonths, getYear, getQuarter } from 'date-fns';
import {
  TrendingUp, TrendingDown, Wallet,
  Pencil, Check, X, Plus, Trash2,
} from 'lucide-react';
import clsx from 'clsx';
import {
  getDashboardSummary, getByCategory, getMonthlyTrend, getQuarterlyTrend, getYearlyTrend,
  getAssets,
  getManualBalances, updateManualBalance, addManualBalance, deleteManualBalance,
} from '../api/client';
import StatCard from '../components/ui/StatCard';
import LoadingSpinner from '../components/ui/LoadingSpinner';

const fmt = (n) =>
  new Intl.NumberFormat('et-EE', { style: 'currency', currency: 'EUR' }).format(n ?? 0);

/** PKR with Indian-style grouping (e.g. ₹1,12,22,347) */
const fmtPkr = (n) =>
  `₨${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n ?? 0))}`;

const RADIAN = Math.PI / 180;

/** Category name + optional icon beside each slice (external label + leader line). */
function renderCategoryPieLabel({
  cx, cy, midAngle, outerRadius, percent, name, icon,
}) {
  if (percent < 0.025) return null;

  const label = [icon, name].filter(Boolean).join(' ').trim() || name;
  const cos = Math.cos(-RADIAN * midAngle);
  const sin = Math.sin(-RADIAN * midAngle);
  const sx = cx + outerRadius * cos;
  const sy = cy + outerRadius * sin;
  const mx = cx + (outerRadius + 12) * cos;
  const my = cy + (outerRadius + 12) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 10;
  const ey = my;
  const textAnchor = cos >= 0 ? 'start' : 'end';
  const tx = ex + (cos >= 0 ? 6 : -6);

  return (
    <g>
      <path
        d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`}
        stroke="#94a3b8"
        fill="none"
        strokeWidth={1}
      />
      <text
        x={tx}
        y={ey}
        textAnchor={textAnchor}
        dominantBaseline="central"
        className="fill-gray-600 dark:fill-gray-300"
        fontSize={11}
        fontWeight={500}
      >
        {label}
      </text>
    </g>
  );
}

const now = new Date();

// ─── Period selector state helpers ───────────────────────────────────────────

function currentPeriodValue(type) {
  if (type === 'month')   return format(now, 'yyyy-MM');
  if (type === 'quarter') return `${getYear(now)}-Q${getQuarter(now)}`;
  if (type === 'year')    return String(getYear(now));
  return null;
}

function buildPeriodOptions(type) {
  if (type === 'month') {
    return Array.from({ length: 24 }, (_, i) => {
      const d = subMonths(now, i);
      return { value: format(d, 'yyyy-MM'), label: format(d, 'MMM yyyy') };
    });
  }
  if (type === 'quarter') {
    const opts = [];
    for (let i = 0; i < 12; i++) {
      const d   = subMonths(now, i * 3);
      const y   = getYear(d);
      const q   = getQuarter(d);
      const val = `${y}-Q${q}`;
      if (!opts.find((o) => o.value === val)) {
        opts.push({ value: val, label: `Q${q} ${y}` });
      }
    }
    return opts;
  }
  if (type === 'year') {
    return Array.from({ length: 5 }, (_, i) => {
      const y = getYear(now) - i;
      return { value: String(y), label: String(y) };
    });
  }
  return [];
}

// ─── Editable asset balance row ───────────────────────────────────────────────

function formatPortfolioTime(iso) {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleString('et-EE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function AssetRow({ row, onSave, onDelete, isBuiltIn, portfolio }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState('');
  const isComputedInvestments = row.key === 'investments' && portfolio;

  const startEdit = () => {
    if (isComputedInvestments) return;
    setVal(String(row.amount ?? 0));
    setEditing(true);
  };
  const cancel    = () => setEditing(false);
  const save      = () => { onSave(parseFloat(val) || 0); setEditing(false); };

  const displayCcy = portfolio?.currency || 'EUR';
  const fmtCcy = (n) =>
    new Intl.NumberFormat('et-EE', { style: 'currency', currency: displayCcy, maximumFractionDigits: 2 }).format(n ?? 0);

  return (
    <div className="py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl">{row.icon}</span>
          <div className="min-w-0">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate block">{row.label}</span>
            {isComputedInvestments && (
              <p className="text-[10px] text-gray-400">Live portfolio · converted to EUR</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {editing ? (
            <>
              <span className="text-sm text-gray-500">€</span>
              <input
                type="number"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
                className="input w-32 py-1 text-sm text-right"
                autoFocus
              />
              <button onClick={save}   className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20">
                <Check size={14} />
              </button>
              <button onClick={cancel} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <span className="text-base font-semibold text-gray-900 dark:text-white">
                {isComputedInvestments ? fmtCcy(portfolio.totalPortfolio) : fmt(row.amount)}
              </span>
              {!isComputedInvestments && (
                <button onClick={startEdit} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800">
                  <Pencil size={13} />
                </button>
              )}
              {!isBuiltIn && (
                <button onClick={onDelete} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                  <Trash2 size={13} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {isComputedInvestments && portfolio && (
        <div className="mt-2 ml-9 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span>Holdings (market): <span className="font-medium text-gray-700 dark:text-gray-300">{fmtCcy(portfolio.holdingsValue)}</span></span>
          <span>Manual cash: <span className="font-medium text-gray-700 dark:text-gray-300">{fmtCcy(portfolio.cashBalance)}</span></span>
          {portfolio.unrealizedPnLEur != null && (
            <span className="col-span-2">
              Unrealized P/L:{' '}
              <span className={clsx('font-medium', portfolio.unrealizedPnLEur >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                {fmtCcy(portfolio.unrealizedPnLEur)}
                {portfolio.unrealizedPnLPct != null && ` (${portfolio.unrealizedPnLPct.toFixed(1)}%)`}
              </span>
            </span>
          )}
          <span className="col-span-2">
            Prices updated: {formatPortfolioTime(portfolio.lastPriceUpdate)}
            {portfolio.pricedPositions != null && (
              <span> · {portfolio.pricedPositions}/{portfolio.openPositions} priced</span>
            )}
            {portfolio.needsQuantityCount > 0 && (
              <span className="text-amber-600 dark:text-amber-400"> · {portfolio.needsQuantityCount} need qty</span>
            )}
            {portfolio.unboundCount > 0 && (
              <span className="text-amber-600 dark:text-amber-400 ml-1">
                · {portfolio.unboundCount} need linking
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const qc = useQueryClient();

  const [periodType,  setPeriodType]  = useState('month');
  const [periodValue, setPeriodValue] = useState(currentPeriodValue('month'));

  // New asset form
  const [addingAsset, setAddingAsset] = useState(false);
  const [newKey,   setNewKey]   = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newIcon,  setNewIcon]  = useState('💰');
  const [newAmt,   setNewAmt]   = useState('0');

  // Trend period for trend charts
  const trendYear = periodType === 'year' ? periodValue
    : periodType === 'quarter' ? periodValue?.split('-')[0]
    : format(now, 'yyyy');

  // Which trend data to use
  const showMonthlyTrend   = periodType === 'month' || periodType === 'all';
  const showQuarterlyTrend = periodType === 'quarter';
  const showYearlyTrend    = periodType === 'year';

  const trendLabel =
    showMonthlyTrend   ? 'Income vs Expenses (12 months)'   :
    showQuarterlyTrend ? `Income vs Expenses — ${trendYear} by quarter` :
                         'Income vs Expenses by Year';

  // ── Queries ──
  const summary   = useQuery({ queryKey: ['summary', periodType, periodValue],   queryFn: () => getDashboardSummary(periodType, periodValue) });
  const byCategory = useQuery({ queryKey: ['bycat', periodType, periodValue],    queryFn: () => getByCategory({ periodType, periodValue, type: 'expense' }) });
  const assets     = useQuery({ queryKey: ['assets'],                             queryFn: getAssets });
  const manuals    = useQuery({ queryKey: ['manualBalances'],                     queryFn: getManualBalances });

  const monthlyTrend   = useQuery({ queryKey: ['monthlyTrend'],             queryFn: () => getMonthlyTrend({ months: 12 }),      enabled: showMonthlyTrend });
  const quarterlyTrend = useQuery({ queryKey: ['quarterlyTrend', trendYear], queryFn: () => getQuarterlyTrend(trendYear), enabled: showQuarterlyTrend });
  const yearlyTrend    = useQuery({ queryKey: ['yearlyTrend'],               queryFn: () => getYearlyTrend(5),        enabled: showYearlyTrend });

  const trendData = showQuarterlyTrend
    ? (quarterlyTrend.data?.map((r) => ({ ...r, label: `Q${r.quarter}` })) ?? [])
    : showYearlyTrend
    ? (yearlyTrend.data?.map((r) => ({ ...r, label: r.year })) ?? [])
    : (monthlyTrend.data?.map((r) => ({
        ...r,
        label: typeof r.month === 'string' && r.month.length >= 7 ? r.month.slice(5) : (r.month ?? ''),
      })) ?? []);

  const trendLoading = showQuarterlyTrend ? quarterlyTrend.isLoading
    : showYearlyTrend ? yearlyTrend.isLoading : monthlyTrend.isLoading;

  // ── Mutations ──
  const updateMut = useMutation({
    mutationFn: ({ key, amount }) => updateManualBalance(key, amount),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['manualBalances'] }); qc.invalidateQueries({ queryKey: ['assets'] }); },
  });

  const addMut = useMutation({
    mutationFn: () => addManualBalance({ key: newKey, label: newLabel, icon: newIcon, amount: parseFloat(newAmt) || 0 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manualBalances'] });
      qc.invalidateQueries({ queryKey: ['assets'] });
      setAddingAsset(false); setNewKey(''); setNewLabel(''); setNewIcon('💰'); setNewAmt('0');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (key) => deleteManualBalance(key),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['manualBalances'] }); qc.invalidateQueries({ queryKey: ['assets'] }); },
  });

  // ── Period handling ──
  const periodOptions = useMemo(() => buildPeriodOptions(periodType), [periodType]);

  const handlePeriodTypeChange = (type) => {
    setPeriodType(type);
    setPeriodValue(currentPeriodValue(type));
  };

  const s = summary.data;
  const totalAssets = assets.data?.totalAssets ?? 0;
  const eurToPkrRate = assets.data?.eurToPkrRate ?? 305;
  const totalAssetsPkr =
    assets.data?.totalAssetsPkr ?? Math.round(totalAssets * eurToPkrRate);
  const periodLabel = periodOptions.find((o) => o.value === periodValue)?.label ?? periodValue;

  return (
    <div className="space-y-6">

      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Your financial overview</p>
        </div>
      </div>

      {/* ── Total assets (bank, investments, and other balances) ── */}
      <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Wallet size={16} className="text-purple-500" />
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Total Assets</h2>
            </div>
            <button
              onClick={() => setAddingAsset((v) => !v)}
              className="btn-ghost py-1 px-2 text-xs flex items-center gap-1"
            >
              <Plus size={12} />
              Add asset
            </button>
          </div>

          {assets.isLoading ? <LoadingSpinner /> : (
            <>
              <div className="mb-4">
                <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                  {fmt(totalAssets)}
                </p>
                {totalAssets > 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 tabular-nums">
                    ≈ {fmtPkr(totalAssetsPkr)}
                    <span className="text-xs text-gray-400 ml-1">
                      (1 € = {eurToPkrRate.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ₨
                      {(assets.data?.fxPkrStale || assets.data?.eurToPkrRate == null) ? ' · est.' : ''})
                    </span>
                  </p>
                )}
              </div>

              {/* Bank balance line */}
              <div className="flex items-center justify-between py-2.5 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">🏛️</span>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Bank Balance</span>
                </div>
                <span className="text-base font-semibold text-gray-900 dark:text-white">
                  {fmt(assets.data?.bankBalance ?? 0)}
                </span>
              </div>

              {assets.data?.revolutClosingBalance != null && (
                <div className="flex items-center justify-between py-2.5 border-b border-gray-100 dark:border-gray-800 gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xl">💜</span>
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Revolut ({Math.round((assets.data?.revolutSplitRatio ?? 0.5) * 100)}% share)
                      </span>
                      <p className="text-[10px] text-gray-400 truncate">
                        Statement balance {fmt(assets.data.revolutClosingBalance)}
                        {assets.data.revolutProduct ? ` · ${assets.data.revolutProduct}` : ''}
                        {assets.data.revolutBalanceDate ? ` · ${assets.data.revolutBalanceDate}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="text-base font-semibold text-purple-600 dark:text-purple-400 shrink-0">
                    {fmt(assets.data.revolutSharedAsset ?? 0)}
                  </span>
                </div>
              )}

              {/* Manual asset rows */}
              {(assets.data?.manuals ?? manuals.data)?.map((row) => (
                <AssetRow
                  key={row.key}
                  row={row}
                  portfolio={row.key === 'investments' ? (assets.data?.investmentPortfolio ?? row.portfolio) : null}
                  isBuiltIn={['pension', 'investments'].includes(row.key)}
                  onSave={(amount) => updateMut.mutate({ key: row.key, amount })}
                  onDelete={() => deleteMut.mutate(row.key)}
                />
              ))}

              {/* Add new asset form */}
              {addingAsset && (
                <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-2">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">New asset</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Icon"
                      value={newIcon}
                      onChange={(e) => setNewIcon(e.target.value)}
                      className="input w-14 text-center text-base"
                    />
                    <input
                      type="text"
                      placeholder="Label (e.g. Crypto)"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      className="input flex-1"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="key (no spaces)"
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value.replace(/\s/g, '_'))}
                      className="input flex-1 font-mono text-xs"
                    />
                    <input
                      type="number"
                      placeholder="Amount €"
                      value={newAmt}
                      onChange={(e) => setNewAmt(e.target.value)}
                      className="input w-28"
                    />
                    <button
                      onClick={() => addMut.mutate()}
                      disabled={!newKey || !newLabel}
                      className="btn-primary"
                    >
                      <Check size={14} />
                    </button>
                    <button onClick={() => setAddingAsset(false)} className="btn-secondary">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
      </div>

      {/* ── Period cash flow (picker + stats for selected period) ── */}
      <div className="card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Cash flow</h2>
            <p className="text-xs text-gray-400 mt-0.5">Income and spending for the selected period</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 text-sm w-full sm:w-auto justify-center">
              {['month', 'quarter', 'year'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handlePeriodTypeChange(t)}
                  className={clsx(
                    'px-3 py-1.5 rounded-md font-medium transition-colors capitalize',
                    periodType === t
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <select
              value={periodValue ?? ''}
              onChange={(e) => setPeriodValue(e.target.value)}
              className="input w-full sm:w-40 text-sm"
            >
              {periodOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {summary.isLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <StatCard
              label="Net earned"
              value={fmt(s?.totalIncome)}
              sub={periodLabel}
              icon={<TrendingUp size={18} />}
              color="green"
            />
            <StatCard
              label="Net spending"
              value={fmt(s?.totalExpenses)}
              sub={periodLabel}
              icon={<TrendingDown size={18} />}
              color="red"
            />
          </div>
        )}
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Trend bar chart — changes axis based on period type */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            {trendLabel}
          </h2>
          {trendLoading ? <LoadingSpinner /> : (
            <div className="chart-h">
              <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `€${v}`} />
                <Tooltip
                  formatter={(v) => fmt(v)}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <Bar dataKey="income"   name="Income"   fill="#10b981" radius={[3,3,0,0]} />
                <Bar dataKey="expenses" name="Expenses" fill="#f43f5e" radius={[3,3,0,0]} />
              </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Category pie — labels on slices */}
        <div className="card p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Spending by Category
          </h2>
          <p className="text-xs text-gray-400 mb-3 sm:mb-4">{periodLabel}</p>
          {byCategory.isLoading ? (
            <LoadingSpinner />
          ) : !byCategory.data?.length ? (
            <div className="flex min-h-[200px] items-center justify-center text-sm text-gray-400">
              No spending data for this period
            </div>
          ) : (
            <div className="mx-auto w-full max-w-lg px-1 py-2 sm:px-2 sm:py-3">
              <div className="h-[300px] w-full sm:h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 12, right: 48, bottom: 12, left: 48 }}>
                    <Pie
                      data={byCategory.data}
                      dataKey="total"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="38%"
                      outerRadius="58%"
                      paddingAngle={2}
                      stroke="none"
                      isAnimationActive={false}
                      label={renderCategoryPieLabel}
                      labelLine={false}
                    >
                      {byCategory.data?.map((entry, i) => (
                        <Cell key={entry.name ?? i} fill={entry.color ?? '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name, props) => {
                        const p = props?.payload;
                        const label =
                          p != null
                            ? [p.icon, p.name].filter(Boolean).join(' ').trim() || name
                            : name;
                        return [fmt(value), label];
                      }}
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 8,
                        border: '1px solid #e5e7eb',
                      }}
                      wrapperStyle={{ zIndex: 40, outline: 'none' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
