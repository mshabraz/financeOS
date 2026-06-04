import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Layers, TrendingUp, TrendingDown, Sparkles, AlertTriangle } from 'lucide-react';
import { fmtEur, fmtPct } from '../../utils/displayFormat';
import { resolveDisplayName } from '../../utils/securityDisplay';
import { buildAssetSegments } from './assetOverviewUtils';
import LoadingSpinner from '../ui/LoadingSpinner';

const LazyAllocChart = lazy(() => import('./DashboardAllocChart'));

function SegmentBar({ segments, total }) {
  if (!total || !segments.length) return null;
  return (
    <div
      className="flex h-3 sm:h-3.5 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800"
      role="img"
      aria-label="Net worth composition"
    >
      {segments.map((s) => {
        const pct = (s.amount / total) * 100;
        if (pct < 0.5) return null;
        return (
          <div
            key={s.key}
            className="h-full min-w-[2px]"
            style={{ width: `${pct}%`, backgroundColor: s.color }}
            title={`${s.label} ${fmtPct(pct, { decimals: 0 })} · ${fmtEur(s.amount)}`}
          />
        );
      })}
    </div>
  );
}

function BreakdownList({ title, rows }) {
  if (!rows?.length) return null;
  const maxPct = Math.max(...rows.map((r) => r.pct ?? 0), 1);

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">{title}</p>
      <ul className="space-y-2">
        {rows.map((r) => {
          const pct = r.pct ?? 0;
          const label = r.label || r.name || '—';
          return (
            <li key={label} className="min-w-0">
              <div className="flex justify-between gap-2 text-xs mb-1">
                <span className="truncate text-gray-700 dark:text-gray-200">{label}</span>
                <span className="tabular-nums text-gray-600 dark:text-gray-400 shrink-0 font-medium">
                  {fmtEur(r.valueEur)} · {fmtPct(pct, { decimals: 1 })}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand-500/70"
                  style={{ width: `${Math.min(100, (pct / maxPct) * 100)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function DashboardWealthPortfolio({
  assets,
  portfolio,
  analytics,
  snapshot,
  isLoading,
}) {
  const { segments, total, investmentSplit } = buildAssetSegments(assets);
  const allocations = analytics?.allocations ?? {};

  const assetClass = (allocations.assetClass ?? portfolio?.allocationSnapshot ?? []).slice(0, 8);
  const countries = (allocations.country ?? []).slice(0, 8);
  const sectors = (allocations.sector ?? []).slice(0, 8);
  const commodities = (allocations.commodities ?? []).slice(0, 6);

  const best = analytics?.insights?.bestPerformers?.[0];
  const worst = analytics?.insights?.worstPerformers?.[0];
  const divScore = analytics?.diversification?.score;
  const warnings = analytics?.diversification?.warnings ?? [];
  const topHoldings = allocations.topHoldings?.slice(0, 5) ?? [];
  const narrativeInsights = (analytics?.insights?.items ?? []).filter((i) => i.type !== 'action').slice(0, 4);

  if (isLoading) {
    return (
      <section className="card p-8 flex justify-center">
        <LoadingSpinner />
      </section>
    );
  }

  if (!segments.length && !portfolio) return null;

  return (
    <section className="space-y-4" aria-labelledby="wealth-portfolio-title">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 px-0.5">
        <div>
          <h2 id="wealth-portfolio-title" className="text-base font-semibold text-gray-900 dark:text-white">
            Wealth & portfolio
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Composition and performance — totals are in the snapshot above
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/investments?tab=holdings" className="btn-secondary text-xs">Holdings</Link>
          <Link to="/investments" className="btn-secondary text-xs">Overview</Link>
        </div>
      </div>

      {segments.length > 0 && (
        <div className="card p-4 sm:p-5">
          <div className="flex items-start gap-2.5 mb-4">
            <div className="p-2 rounded-xl bg-brand-500/10 text-brand-600 shrink-0">
              <PieChart size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Asset breakdown</h3>
              <p className="text-xs text-gray-500">
                {snapshot?.investmentsPct != null
                  ? `Investments ${fmtPct(snapshot.investmentsPct, { decimals: 0 })} · Cash ${fmtPct(snapshot.cashPct, { decimals: 0 })} of net worth`
                  : 'How net worth is split across accounts'}
              </p>
            </div>
          </div>

          <SegmentBar segments={segments} total={total} />

          <ul className="mt-4 space-y-2">
            {segments.map((s) => {
              const pct = total > 0 ? (s.amount / total) * 100 : 0;
              return (
                <li
                  key={s.key}
                  className="rounded-xl border border-gray-100 dark:border-gray-800 px-3 py-2.5 flex items-center gap-3"
                >
                  <span className="text-lg shrink-0">{s.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{s.label}</p>
                    {s.key === 'investments' && investmentSplit && (
                      <p className="text-[11px] text-gray-500">
                        Holdings {fmtEur(investmentSplit.holdings)} · Cash {fmtEur(investmentSplit.cash)}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold tabular-nums text-gray-900 dark:text-white break-words">
                      {fmtEur(s.amount)}
                    </p>
                    <p className="text-[10px] text-gray-400 tabular-nums">{fmtPct(pct, { decimals: 0 })}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {portfolio && (
        <div className="card p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-brand-500/10 text-brand-600">
              <Layers size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Portfolio intelligence</h3>
              <p className="text-xs text-gray-500">
                {portfolio.pricedPositions}/{portfolio.openPositions} priced
                {divScore != null && ` · Diversification ${divScore}/100`}
                {portfolio.unboundCount > 0 && ` · ${portfolio.unboundCount} need link`}
              </p>
            </div>
          </div>

          {assetClass.length > 0 && (
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                By asset class
              </p>
              <Suspense fallback={<div className="h-32 flex items-center justify-center"><LoadingSpinner /></div>}>
                <LazyAllocChart data={assetClass} />
              </Suspense>
            </div>
          )}

          {(countries.length > 0 || sectors.length > 0 || commodities.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-gray-100 dark:border-gray-800">
              <BreakdownList title="Countries" rows={countries} />
              <BreakdownList title="Sectors" rows={sectors} />
              <BreakdownList title="Commodities" rows={commodities} />
            </div>
          )}

          {(warnings.length > 0 || topHoldings.length > 0 || narrativeInsights.length > 0) && (
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-brand-500" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Smart analytics
                </p>
              </div>
              {warnings.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {warnings.map((w) => (
                    <span
                      key={w.code + w.message}
                      className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-800 dark:text-amber-200"
                    >
                      <AlertTriangle size={10} className="shrink-0" />
                      {w.message}
                    </span>
                  ))}
                </div>
              )}
              {topHoldings.length > 0 && (
                <BreakdownList
                  title="Largest weights"
                  rows={topHoldings.map((r) => ({
                    label: r.label || r.ticker,
                    valueEur: r.valueEur,
                    pct: r.pct ?? r.portfolioPct,
                  }))}
                />
              )}
              {narrativeInsights.length > 0 && (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {narrativeInsights.map((ins, i) => (
                    <li
                      key={`${ins.title}-${i}`}
                      className="rounded-lg border border-gray-100 dark:border-gray-800 px-2.5 py-2 text-[11px] text-gray-600 dark:text-gray-300"
                    >
                      <span className="font-medium text-gray-800 dark:text-gray-200">{ins.title}</span>
                      {ins.detail && <span className="block mt-0.5 text-gray-500">{ins.detail}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {best && (
              <div className="rounded-xl border border-emerald-500/20 p-3 flex justify-between items-center gap-2">
                <div className="flex items-center gap-2 text-emerald-600 min-w-0">
                  <TrendingUp size={14} className="shrink-0" />
                  <span className="text-xs font-semibold truncate">Best · {resolveDisplayName(best)}</span>
                </div>
                <span className="text-sm font-bold tabular-nums shrink-0">{fmtPct(best.pct, { sign: true })}</span>
              </div>
            )}
            {worst && (
              <div className="rounded-xl border border-red-500/20 p-3 flex justify-between items-center gap-2">
                <div className="flex items-center gap-2 text-red-600 min-w-0">
                  <TrendingDown size={14} className="shrink-0" />
                  <span className="text-xs font-semibold truncate">Worst · {resolveDisplayName(worst)}</span>
                </div>
                <span className="text-sm font-bold tabular-nums shrink-0">{fmtPct(worst.pct, { sign: true })}</span>
              </div>
            )}
          </div>

        </div>
      )}
    </section>
  );
}
