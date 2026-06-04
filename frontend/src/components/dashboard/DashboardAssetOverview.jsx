import { Link } from 'react-router-dom';
import { ChevronRight, PieChart } from 'lucide-react';
import { fmtEur, fmtPct } from '../../utils/displayFormat';
import { buildAssetSegments } from './assetOverviewUtils';

function SegmentBar({ segments, total }) {
  if (!total || !segments.length) return null;
  return (
    <div
      className="flex h-3 sm:h-3.5 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800"
      role="img"
      aria-label="Asset allocation by type"
    >
      {segments.map((s) => {
        const pct = (s.amount / total) * 100;
        if (pct < 0.5) return null;
        return (
          <div
            key={s.key}
            className="h-full min-w-[2px] transition-all"
            style={{ width: `${pct}%`, backgroundColor: s.color }}
            title={`${s.label} ${fmtPct(pct, { decimals: 0 })}`}
          />
        );
      })}
    </div>
  );
}

export default function DashboardAssetOverview({ assets, isLoading }) {
  const { segments, total, investmentSplit } = buildAssetSegments(assets);

  if (isLoading) {
    return (
      <section className="card p-4 sm:p-5 animate-pulse">
        <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
        <div className="h-3 rounded-full bg-gray-200 dark:bg-gray-700 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  if (!segments.length) return null;

  const liquid =
    (assets?.bankBalance ?? 0) +
    (assets?.revolutSharedAsset ?? 0) +
    (investmentSplit?.cash ?? 0);
  const invested = investmentSplit?.holdings ?? 0;
  const otherManual = segments
    .filter((s) => !['bank', 'revolut', 'investments'].includes(s.key))
    .reduce((sum, s) => sum + s.amount, 0);

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-brand-500/10 text-brand-600 shrink-0">
            <PieChart size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Asset breakdown</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              How net worth is allocated across accounts and holdings
            </p>
          </div>
        </div>
        <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tabular-nums shrink-0 sm:text-right break-words">
          {fmtEur(total)}
        </p>
      </div>

      <SegmentBar segments={segments} total={total} />

      {(liquid > 0 || invested > 0) && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {liquid > 0 && (
            <div className="rounded-xl border border-gray-200/80 dark:border-gray-700/80 px-3 py-2.5 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Liquid</p>
              <p className="text-sm sm:text-base font-bold tabular-nums text-gray-900 dark:text-white break-words mt-0.5">
                {fmtEur(liquid)}
              </p>
            </div>
          )}
          {invested > 0 && (
            <div className="rounded-xl border border-gray-200/80 dark:border-gray-700/80 px-3 py-2.5 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">In markets</p>
              <p className="text-sm sm:text-base font-bold tabular-nums text-gray-900 dark:text-white break-words mt-0.5">
                {fmtEur(invested)}
              </p>
            </div>
          )}
          {otherManual > 0 && (
            <div className="rounded-xl border border-gray-200/80 dark:border-gray-700/80 px-3 py-2.5 min-w-0 col-span-2 sm:col-span-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Other assets</p>
              <p className="text-sm sm:text-base font-bold tabular-nums text-gray-900 dark:text-white break-words mt-0.5">
                {fmtEur(otherManual)}
              </p>
            </div>
          )}
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {segments.map((s) => {
          const pct = total > 0 ? (s.amount / total) * 100 : 0;
          return (
            <li
              key={s.key}
              className="rounded-xl border border-gray-100 dark:border-gray-800 px-3 py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-lg shrink-0">{s.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                    {s.label}
                  </p>
                  {s.key === 'investments' && investmentSplit && (
                    <p className="text-[11px] text-gray-500 mt-0.5 break-words">
                      Holdings {fmtEur(investmentSplit.holdings)} · Cash {fmtEur(investmentSplit.cash)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-3 sm:shrink-0 w-full sm:w-auto">
                <div className="hidden sm:block flex-1 max-w-[120px] h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, pct)}%`, backgroundColor: s.color }}
                  />
                </div>
                <div className="text-right min-w-0">
                  <p className="text-sm sm:text-base font-bold tabular-nums text-gray-900 dark:text-white break-words">
                    {fmtEur(s.amount)}
                  </p>
                  <p className="text-[10px] text-gray-400 tabular-nums">{fmtPct(pct, { decimals: 0 })}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {investmentSplit && (assets?.investmentPortfolio?.byCurrency?.length > 0) && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Portfolio by currency
          </p>
          <div className="flex flex-wrap gap-2">
            {assets.investmentPortfolio.byCurrency.map((c) => (
              <span
                key={c.currency}
                className="text-xs rounded-full border border-gray-200 dark:border-gray-700 px-2.5 py-1 tabular-nums"
              >
                {c.currency} {fmtEur(c.totalPortfolio ?? c.holdingsValueEur ?? 0)}
              </span>
            ))}
          </div>
        </div>
      )}

      <Link
        to="/investments?tab=holdings"
        className="mt-4 text-xs text-brand-600 hover:underline inline-flex items-center gap-0.5"
      >
        View holdings <ChevronRight size={12} />
      </Link>
    </section>
  );
}
