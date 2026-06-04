import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Layers, ChevronRight, Shield, TrendingUp, TrendingDown } from 'lucide-react';
import clsx from 'clsx';
import { fmtEur, fmtPct } from '../../utils/displayFormat';
import { resolveDisplayName } from '../../utils/securityDisplay';
import { buildAssetSegments } from './assetOverviewUtils';
import LoadingSpinner from '../ui/LoadingSpinner';
import MiniSparkline from './MiniSparkline';

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
            title={`${s.label} ${fmtPct(pct, { decimals: 0 })}`}
          />
        );
      })}
    </div>
  );
}

/**
 * Wealth & portfolio — composition and insights only (no repeated hero KPI totals).
 */
export default function DashboardWealthPortfolio({
  assets,
  portfolio,
  analytics,
  snapshot,
  isLoading,
}) {
  const { segments, total, investmentSplit } = buildAssetSegments(assets);
  const alloc = portfolio?.allocationSnapshot?.length
    ? portfolio.allocationSnapshot
    : (analytics?.allocations?.assetClass ?? []).slice(0, 6);

  const regionAlloc = (analytics?.allocations?.region ?? []).slice(0, 5);
  const sectorAlloc = (analytics?.allocations?.sector ?? []).slice(0, 5);
  const brokerAlloc = (analytics?.allocations?.broker ?? []).slice(0, 5);

  const best = analytics?.insights?.bestPerformers?.[0];
  const worst = analytics?.insights?.worstPerformers?.[0];
  const divScore = analytics?.diversification?.score;

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
                        {fmtPct((investmentSplit.holdings / (investmentSplit.total || 1)) * 100, { decimals: 0 })} in markets
                        · {fmtPct((investmentSplit.cash / (investmentSplit.total || 1)) * 100, { decimals: 0 })} broker cash
                      </p>
                    )}
                  </div>
                  <p className="text-sm font-bold tabular-nums text-gray-900 dark:text-white shrink-0">
                    {fmtPct(pct, { decimals: 0 })}
                  </p>
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {alloc.length > 0 && (
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  By asset class
                </p>
                <Suspense fallback={<div className="h-36 flex items-center justify-center"><LoadingSpinner /></div>}>
                  <LazyAllocChart data={alloc} />
                </Suspense>
              </div>
            )}
            <div className="space-y-3 min-w-0">
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
              {(analytics?.diversification?.warnings ?? []).slice(0, 2).map((w, i) => (
                <p key={i} className="text-[11px] text-amber-700 dark:text-amber-300 flex gap-1.5">
                  <Shield size={12} className="shrink-0 mt-0.5" />
                  {w.message}
                </p>
              ))}
            </div>
          </div>

          {(regionAlloc.length > 0 || sectorAlloc.length > 0 || brokerAlloc.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
              {[
                { title: 'Region', rows: regionAlloc },
                { title: 'Sector', rows: sectorAlloc },
                { title: 'Broker', rows: brokerAlloc },
              ].map(({ title, rows }) =>
                rows.length > 0 ? (
                  <div key={title}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">{title}</p>
                    <ul className="space-y-1">
                      {rows.map((r) => (
                        <li key={r.key ?? r.label} className="flex justify-between text-xs gap-2">
                          <span className="truncate text-gray-600 dark:text-gray-300">{r.label}</span>
                          <span className="tabular-nums text-gray-500 shrink-0">{fmtPct(r.pct ?? r.portfolioPct, { decimals: 0 })}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </div>
          )}

          {portfolio.sparkline?.length > 1 && (
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Portfolio trend (3M)
              </p>
              <div className="h-12 flex justify-end">
                <MiniSparkline
                  data={portfolio.sparkline.map((p) => p.value ?? p.totalPortfolio)}
                  positive={(portfolio.unrealizedPnLEur ?? 0) >= 0}
                  height={48}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
