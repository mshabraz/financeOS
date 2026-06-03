import { useMemo, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Wallet, PiggyBank,
  Shield, ArrowUpRight, ArrowDownRight, Search, ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';
import LoadingSpinner from '../ui/LoadingSpinner';
import { usePrivacy } from '../../context/PrivacyContext';
import { fmtEur, fmtPct, fmtNative, fmtQty, fmtShortDate } from '../../utils/investmentFormat';
import { privText } from '../../utils/displayFormat';
import { maskIfPrivacy } from '../../utils/privacyMask';
import {
  BROKER_LABELS, BROKER_COLORS, CHART_COLORS, PERIOD_OPTIONS, ALLOCATION_VIEWS,
} from './constants';
import FundBenchmarkSection from './FundBenchmarkSection';
import InvestmentInsightsPanel from './insights/InvestmentInsightsPanel';

function TrendBadge({ value, pct, label }) {
  if (value == null && pct == null) return null;
  const up = (pct ?? value) >= 0;
  return (
    <span className={clsx(
      'inline-flex items-center gap-0.5 text-xs font-medium',
      up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
    )}>
      {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {pct != null ? fmtPct(pct, { sign: true }) : fmtEur(value, { sign: true })}
      {label && <span className="text-gray-400 font-normal ml-0.5">{label}</span>}
    </span>
  );
}

function HeroSection({ hero, lastUpdated, onOpenHoldings }) {
  if (!hero) return null;
  const up = (hero.unrealizedPnLEur ?? 0) >= 0;

  return (
    <div className="card p-5 sm:p-6 bg-gradient-to-br from-slate-50 to-white dark:from-gray-900 dark:to-gray-900/80 border-brand-100 dark:border-gray-800">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Total portfolio value
          </p>
          <p className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mt-1 tabular-nums">
            {fmtEur(hero.totalPortfolioEur)}
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <span className={clsx('text-sm font-semibold', up ? 'text-emerald-600' : 'text-red-600')}>
              {fmtEur(hero.unrealizedPnLEur, { sign: true })} unrealized
              {hero.unrealizedPnLPct != null && (
                <span className="ml-1 font-normal">({fmtPct(hero.unrealizedPnLPct, { sign: true })})</span>
              )}
            </span>
            {hero.dailyChangeAvailable && (
              <TrendBadge value={hero.dailyChangeEur} pct={hero.dailyChangePct} label="today" />
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            Updated {fmtShortDate(lastUpdated)}
            {hero.pricedPositions != null && (
              <span> · {hero.pricedPositions}/{hero.openPositions} priced</span>
            )}
          </p>
          {hero.brokerCashBreakdown?.length > 0 && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
              Cash:{' '}
              {hero.brokerCashBreakdown
                .filter((r) => (r.amountEur ?? r.amount) > 0)
                .map((r) => `${r.label || r.broker} ${fmtEur(r.amountEur ?? r.amount)}`)
                .join(' · ') || '—'}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenHoldings}
          className="btn-secondary text-xs self-start shrink-0"
        >
          Manage holdings <ChevronRight size={14} className="inline ml-0.5" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-6">
        {[
          { label: 'Invested capital', value: fmtEur(hero.investedCapitalEur), icon: Wallet, color: 'text-blue-600' },
          { label: 'Holdings (market)', value: fmtEur(hero.holdingsValueEur), icon: TrendingUp, color: 'text-indigo-600' },
          { label: 'Cash', value: fmtEur(hero.cashBalanceEur), icon: PiggyBank, color: 'text-amber-600' },
        ].map((k) => (
          <div key={k.label} className="rounded-xl bg-white/80 dark:bg-gray-800/60 p-3 border border-gray-100 dark:border-gray-700/50">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-gray-400">
              <k.icon size={12} className={k.color} />
              {k.label}
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1 tabular-nums">{k.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AllocationChart({ allocations, view, onViewChange }) {
  const [active, setActive] = useState(view || 'topHoldings');
  const currentView = onViewChange ? view : active;
  const setView = onViewChange || setActive;

  const data = useMemo(() => {
    const key = currentView;
    if (key === 'currency') {
      return (allocations?.currency || []).map((c) => ({
        name: c.label,
        value: c.valueNative,
        pct: c.pctNative,
        isNative: true,
        currency: c.label,
      }));
    }
    const rows =
      allocations?.[key] ||
      (key === 'region' ? allocations?.region : []) ||
      (key === 'commodities' ? allocations?.commodities : []) ||
      [];
    return rows.map((a) => ({
      name: a.label,
      value: a.valueEur,
      pct: a.pct,
    }));
  }, [allocations, currentView]);

  const chartData = data.filter((d) => d.value > 0);
  const showEurInLegend = currentView !== 'currency';

  const legendCols = useMemo(() => {
    const mid = Math.ceil(chartData.length / 2);
    return [chartData.slice(0, mid), chartData.slice(mid)];
  }, [chartData]);

  const renderLegendCol = (items, colOffset) => (
    <ul className="space-y-2 text-xs min-w-0">
      {items.map((d, i) => {
        const colorIdx = colOffset + i;
        return (
          <li key={`${d.name}-${colorIdx}`} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 min-w-0 truncate text-gray-700 dark:text-gray-200">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: CHART_COLORS[colorIdx % CHART_COLORS.length] }}
              />
              <span className="truncate">{d.name}</span>
            </span>
            <span className="text-gray-600 dark:text-gray-400 tabular-nums shrink-0 font-medium">
              {d.pct != null ? fmtPct(d.pct, { decimals: 2 }) : '—'}
            </span>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="card p-5 h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Portfolio breakdown</h2>
        <div className="flex flex-wrap gap-1">
          {ALLOCATION_VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              className={clsx(
                'px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors',
                currentView === v.id
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      {chartData.length ? (
        <div className="flex flex-col sm:flex-row gap-4 flex-1 min-h-0">
          <div className="chart-h w-full sm:w-[42%] shrink-0 min-h-[180px] sm:min-h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="54%"
                  outerRadius="80%"
                  paddingAngle={chartData.length > 1 ? 2 : 0}
                >
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v, name, props) => {
                    const p = props.payload;
                    if (p.isNative) return [fmtNative(v, p.currency), name];
                    return [fmtEur(v), `${name} (${fmtPct(p.pct, { decimals: 2 })})`];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 min-w-0 max-h-[240px] sm:max-h-none overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0">
              {renderLegendCol(legendCols[0], 0)}
              {legendCols[1].length > 0 && renderLegendCol(legendCols[1], legendCols[0].length)}
            </div>
            {showEurInLegend && (
              <p className="text-[10px] text-gray-400 mt-3">
                Sectors and countries sum to equity fund exposure only (cash and commodity ETCs such as gold/silver excluded). Commodities are shown on their own tab. Fund data uses benchmark profiles and look-through where available.
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-400 flex-1 flex items-center justify-center">
          {currentView === 'commodities'
            ? 'No commodity holdings in this portfolio'
            : 'No priced positions yet'}
        </p>
      )}
    </div>
  );
}

function PerformanceChart({ performance, period, onPeriodChange }) {
  const history = performance?.history ?? [];

  return (
    <div className="card p-5 h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Portfolio value</h2>
        <div className="flex gap-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5">
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPeriodChange(p.id)}
              className={clsx(
                'px-2 py-0.5 rounded text-[10px] font-medium',
                period === p.id ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {history.length >= 2 ? (
        <div className="chart-h flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history}>
              <defs>
                <linearGradient id="pfGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(v) => v?.slice(5)} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => maskIfPrivacy(`€${(v / 1000).toFixed(0)}k`)} width={42} />
              <Tooltip
                formatter={(v, name) => [
                  fmtEur(v),
                  name === 'investedCapital' || name === 'Cumulative buys' ? 'Cumulative buys' : 'Portfolio',
                ]}
                labelFormatter={(l) => l}
              />
              <Area type="monotone" dataKey="portfolioValue" name="Portfolio" stroke="#6366f1" fill="url(#pfGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="investedCapital" name="Cumulative buys" stroke="#94a3b8" fill="none" strokeWidth={1.5} strokeDasharray="4 4" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-sm text-gray-400 flex-1 flex items-center justify-center text-center px-4">
          Link holdings to Yahoo and open this view to download price history. The chart needs a few seconds on first load for 1Y / All.
        </p>
      )}
      {history.length >= 2 && (
        <p className="text-[10px] text-gray-400 mt-2">
          Blue area: market value of holdings (using historical prices and buy/sell quantities). Grey line: cumulative purchase amounts from imports — not live portfolio value.
        </p>
      )}
    </div>
  );
}

function DiversificationCard({ diversification }) {
  if (!diversification) return null;
  const score = diversification.score ?? 0;
  const level = score >= 70 ? 'good' : score >= 45 ? 'moderate' : 'low';

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Shield size={16} className="text-brand-600" />
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Diversification</h2>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 shrink-0">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              className="text-gray-200 dark:text-gray-700"
              strokeWidth="3"
            />
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              className={clsx(
                level === 'good' && 'text-emerald-500',
                level === 'moderate' && 'text-amber-500',
                level === 'low' && 'text-red-500',
              )}
              strokeWidth="3"
              strokeDasharray={`${score}, 100`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-gray-900 dark:text-white">
            {score}
          </span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
          <p>Higher score = broader spread across positions.</p>
          <p className={clsx(
            'font-medium',
            level === 'good' && 'text-emerald-600',
            level === 'moderate' && 'text-amber-600',
            level === 'low' && 'text-red-600',
          )}>
            {level === 'good' && 'Well diversified'}
            {level === 'moderate' && 'Moderate concentration'}
            {level === 'low' && 'High concentration risk'}
          </p>
        </div>
      </div>
    </div>
  );
}

function CompositionTable({ rows, brokerFilter }) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('portfolioPct');
  const [sortDir, setSortDir] = useState('desc');
  const [showCols, setShowCols] = useState(false);

  const filtered = useMemo(() => {
    let list = [...(rows || [])];
    if (brokerFilter) list = list.filter((r) => r.broker === brokerFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.ticker?.toLowerCase().includes(q) ||
          r.securityName?.toLowerCase().includes(q) ||
          r.sector?.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return list;
  }, [rows, brokerFilter, search, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const cols = [
    { key: 'ticker', label: 'Ticker', always: true },
    { key: 'securityName', label: 'Name', always: true },
    { key: 'portfolioPct', label: 'Weight %' },
    { key: 'marketValueEur', label: 'Value €' },
    { key: 'quantity', label: 'Qty' },
    { key: 'unrealizedPnLPct', label: 'P/L %' },
    { key: 'sector', label: 'Sector', optional: true },
    { key: 'region', label: 'Region', optional: true },
    { key: 'broker', label: 'Broker', optional: true },
  ];

  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Holdings composition</h2>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-48">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input py-1 pl-8 text-xs w-full"
            />
          </div>
          <button type="button" className="btn-ghost text-xs" onClick={() => setShowCols((s) => !s)}>
            Columns
          </button>
        </div>
      </div>

      {showCols && (
        <div className="px-4 py-2 flex flex-wrap gap-2 border-b border-gray-100 dark:border-gray-800 text-xs">
          {cols.filter((c) => c.optional).map((c) => (
            <span key={c.key} className="text-gray-400">{c.label}</span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-800">
              {cols.map((c) => (
                <th
                  key={c.key}
                  className="px-3 py-2 font-medium cursor-pointer hover:text-gray-600 whitespace-nowrap"
                  onClick={() => toggleSort(c.key)}
                >
                  {c.label}
                  {sortKey === c.key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const up = (r.unrealizedPnLEur ?? 0) >= 0;
              return (
                <tr key={`${r.broker}-${r.ticker}-${r.currency}`} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                  <td className="px-3 py-2.5 font-semibold text-gray-900 dark:text-white">{privText(r.ticker)}</td>
                  <td className="px-3 py-2.5 max-w-[140px] truncate text-gray-600 dark:text-gray-400">{privText(r.securityName)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{r.portfolioPct != null ? fmtPct(r.portfolioPct) : '—'}</td>
                  <td className="px-3 py-2.5 tabular-nums">{r.marketValueEur != null ? fmtEur(r.marketValueEur) : '—'}</td>
                  <td className="px-3 py-2.5 tabular-nums">{fmtQty(r.quantity)}</td>
                  <td className={clsx('px-3 py-2.5 tabular-nums font-medium', up ? 'text-emerald-600' : 'text-red-600')}>
                    {r.unrealizedPnLPct != null ? fmtPct(r.unrealizedPnLPct, { sign: true }) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-gray-500">{r.sector || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-500">{r.region || '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: BROKER_COLORS[r.broker] }} />
                      {BROKER_LABELS[r.broker] || r.broker}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filtered.length && (
          <p className="text-center text-sm text-gray-400 py-8">No holdings match</p>
        )}
      </div>
    </div>
  );
}

function DividendsSection({ dividends }) {
  if (!dividends?.trailing12Months && !dividends?.byYear?.length) return null;

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Income & dividends</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
          <p className="text-[10px] text-gray-400 uppercase">Trailing 12 mo</p>
          <p className="text-lg font-semibold tabular-nums">{fmtEur(dividends.trailing12Months)}</p>
        </div>
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
          <p className="text-[10px] text-gray-400 uppercase">Projected annual</p>
          <p className="text-lg font-semibold tabular-nums">{fmtEur(dividends.projectedAnnualIncome)}</p>
        </div>
      </div>
      {dividends.byYear?.length > 0 && (
        <div className="chart-h">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dividends.byYear}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis dataKey="year" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `€${v}`} />
              <Tooltip formatter={(v) => fmtEur(v)} />
              <Bar dataKey="totalNet" name="Dividends" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {dividends.topContributors?.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase text-gray-400 mb-2">Top contributors</p>
          <div className="space-y-1">
            {dividends.topContributors.slice(0, 5).map((t) => (
              <div key={`${t.broker}-${t.ticker}`} className="flex justify-between text-xs">
                <span>{t.ticker}</span>
                <span className="font-medium tabular-nums">{fmtEur(t.totalNet)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PortfolioOverview({
  analytics,
  isLoading,
  isError,
  errorMessage,
  period,
  onPeriodChange,
  allocationView,
  onAllocationViewChange,
  brokerFilter,
  onOpenHoldings,
  priceSyncBar,
}) {
  usePrivacy();
  if (isLoading) return <LoadingSpinner />;
  if (isError) {
    return (
      <div className="card p-6 text-center text-sm text-amber-700 dark:text-amber-300 space-y-2">
        <p>Could not load portfolio analytics. Check that the backend is running, then refresh this page.</p>
        {errorMessage && (
          <p className="text-xs text-gray-500 dark:text-gray-400 font-mono break-words">{errorMessage}</p>
        )}
      </div>
    );
  }

  const hero = analytics?.hero;
  const lastUpdated = hero?.lastUpdated;

  return (
    <div className="space-y-6">
      <HeroSection hero={hero} lastUpdated={lastUpdated} onOpenHoldings={onOpenHoldings} />
      <InvestmentInsightsPanel
        insights={analytics?.insights}
        diversification={analytics?.diversification}
        allocations={analytics?.allocations}
        hero={hero}
        onOpenHoldings={onOpenHoldings}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AllocationChart
          allocations={analytics?.allocations}
          view={allocationView}
          onViewChange={onAllocationViewChange}
        />
        <PerformanceChart
          performance={analytics?.performance}
          period={period}
          onPeriodChange={onPeriodChange}
        />
      </div>

      <FundBenchmarkSection fundProfiles={analytics?.fundProfiles} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <DiversificationCard diversification={analytics?.diversification} />
        </div>
        <div className="lg:col-span-2">
          <DividendsSection dividends={analytics?.dividends} />
        </div>
      </div>

      <CompositionTable rows={analytics?.composition} brokerFilter={brokerFilter} />

      {priceSyncBar && <div className="pt-2">{priceSyncBar}</div>}
    </div>
  );
}
