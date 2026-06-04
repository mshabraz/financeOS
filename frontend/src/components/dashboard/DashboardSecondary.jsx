import { Link } from 'react-router-dom';
import { Users, CreditCard, ChevronRight } from 'lucide-react';
import { fmtEur } from '../../utils/displayFormat';

/** Lightweight Revolut + shared expenses (no net worth / investment totals). */
export default function DashboardSecondary({ assets, tagSummary, monthLabel, sharedEvents }) {
  const events = sharedEvents ?? [];
  const tags = (tagSummary ?? []).slice(0, 4);
  const hasRevolut = assets?.revolutClosingBalance != null;
  if (!hasRevolut && !tags.length && !events.length) return null;

  const ratio = Math.round((assets?.revolutSplitRatio ?? 0.5) * 100);

  return (
    <section className="card p-4 sm:p-5" aria-labelledby="secondary-title">
      <h2 id="secondary-title" className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">
        Shared & Revolut
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {hasRevolut && (
          <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CreditCard size={14} className="text-purple-500" />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Revolut share</span>
              </div>
              <Link to="/transactions?source=revolut" className="text-[10px] text-brand-600 hover:underline">
                Transactions
              </Link>
            </div>
            <p className="text-xs text-gray-500">{ratio}% of joint expenses in analytics</p>
            {tags.length > 0 && (
              <ul className="mt-2 space-y-1">
                {tags.map((t) => (
                  <li key={t.id ?? t.name} className="flex justify-between text-xs">
                    <span className="truncate" style={{ color: t.color }}>{t.name}</span>
                    <span className="tabular-nums shrink-0 ml-2">{fmtEur(t.totalSpending ?? t.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {events.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Users size={14} className="text-sky-500" />
                <span className="text-xs font-medium">Shared expenses</span>
              </div>
              <Link to="/shared" className="text-[10px] text-brand-600 hover:underline inline-flex items-center gap-0.5">
                All <ChevronRight size={10} />
              </Link>
            </div>
            <ul className="space-y-1.5">
              {events.slice(0, 4).map((e) => (
                <li key={e.id}>
                  <Link
                    to={`/shared/${e.id}`}
                    className="flex justify-between gap-2 rounded-lg border border-gray-100 dark:border-gray-800 px-2.5 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <span className="font-medium truncate">{e.name}</span>
                    <span className="text-gray-500 shrink-0">{e.participant_count} · {fmtEur(e.total_spend)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
