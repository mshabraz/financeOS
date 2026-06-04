import { Link } from 'react-router-dom';
import { Target, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { fmtEur, fmtPct } from '../../utils/displayFormat';
import { normalizeGoalId } from '../../hooks/useGoalPreferences';

export default function DashboardGoals({
  goals,
  progressById,
  featuredGoalId,
  onFeaturedGoalChange,
}) {
  const active = (goals ?? []).filter((g) => g.status !== 'archived').slice(0, 4);
  if (!active.length) return null;

  const featuredValue = featuredGoalId ?? normalizeGoalId(active[0]?.id) ?? '';

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-brand-500" />
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Goals & wealth planning</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {active.length > 1 && onFeaturedGoalChange && (
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="shrink-0">KPI goal</span>
              <select
                className="input text-xs py-1 min-w-[8rem] max-w-[12rem]"
                value={featuredValue}
                onChange={(e) => onFeaturedGoalChange(normalizeGoalId(e.target.value))}
                aria-label="Goal shown on dashboard KPI"
              >
                {active.map((g) => (
                  <option key={g.id} value={normalizeGoalId(g.id) ?? g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Link to="/investments?tab=planner" className="text-xs text-brand-600 hover:underline inline-flex items-center gap-0.5">
            Planner <ChevronRight size={12} />
          </Link>
        </div>
      </div>
      <ul className="space-y-3">
        {active.map((g) => {
          const prog = progressById?.[g.id];
          const pct = prog?.progressPct ?? (g.target_amount > 0 ? (prog?.currentAmount / g.target_amount) * 100 : null);
          const onTrack = prog?.onTrack;
          return (
            <li key={g.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
              <div className="flex justify-between gap-2 mb-2">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{g.name}</p>
                <span className="text-xs tabular-nums text-gray-500 shrink-0">
                  {pct != null ? fmtPct(Math.min(100, pct)) : '—'}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div
                  className={clsx(
                    'h-full rounded-full transition-all',
                    onTrack === 'behind' ? 'bg-amber-500' : 'bg-brand-500',
                  )}
                  style={{ width: `${Math.min(100, pct ?? 0)}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-500 mt-2">
                Target {fmtEur(g.target_amount)} · {g.target_date || 'no date'}
                {prog?.projectedCompletionHint && (
                  <span className="block mt-0.5 text-gray-400">{prog.projectedCompletionHint}</span>
                )}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
