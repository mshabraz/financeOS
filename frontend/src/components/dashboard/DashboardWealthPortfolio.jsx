import { Link } from 'react-router-dom';
import { PieChart } from 'lucide-react';
import { fmtEur, fmtPct } from '../../utils/displayFormat';
import { buildAssetSegments } from './assetOverviewUtils';
import LoadingSpinner from '../ui/LoadingSpinner';

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

export default function DashboardWealthPortfolio({
  assets,
  portfolio,
  snapshot,
  isLoading,
}) {
  const { segments, total, investmentSplit } = buildAssetSegments(assets);

  if (isLoading) {
    return (
      <section className="card p-8 flex justify-center">
        <LoadingSpinner />
      </section>
    );
  }

  if (!segments.length && !portfolio) return null;

  return (
    <section className="space-y-4" aria-labelledby="assets-title">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 px-0.5">
        <div>
          <h2 id="assets-title" className="text-base font-semibold text-gray-900 dark:text-white">
            Assets
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            How net worth is split across bank, Revolut, investments, and manual assets
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/investments?tab=holdings" className="btn-secondary text-xs">Holdings</Link>
          <Link to="/investments" className="btn-secondary text-xs">Investments</Link>
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
                  : 'Accounts and assets included in net worth'}
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
                  className="rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.01] dark:bg-white/[0.02] px-3 py-2.5 flex items-center gap-3"
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
    </section>
  );
}
