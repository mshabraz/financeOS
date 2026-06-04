import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { fmtEur, fmtPct } from '../../utils/displayFormat';
import { normalizeGoalId } from '../../hooks/useGoalPreferences';

export default function DashboardGoals({
  goals,
  progressById,
  featuredGoalId,
  onFeaturedGoalChange,
}) {
  const active = (goals ?? []).filter((g) => g.status !== 'archived').slice(0, 3);
  if (!active.length) return null;

  const featuredValue = featuredGoalId ?? normalizeGoalId(active[0]?.id) ?? '';

  return (
    <section className="space-y-4" aria-labelledby="goals-title">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-1">
        <div>
          <h2 id="goals-title" className="text-base font-semibold text-gray-900 dark:text-white">
            Goals & wealth planning
          </h2>
          <p className="text-xs text-gray-500">Active targets and planner progress</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      <div className="card p-4">
        <ul className="space-y-2">
          {active.map((g) => {
            const prog = progressById?.[g.id];
            const pct = prog?.progressPct ?? (g.target_amount > 0 ? (prog?.currentAmount / g.target_amount) * 100 : null);
            const onTrack = prog?.onTrack;
            return (
              <li
                key={g.id}
                className="rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2.5"
              >
                <div className="flex justify-between gap-2 mb-1.5">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{g.name}</p>
                  <span className="text-xs tabular-nums font-semibold text-gray-600 dark:text-gray-300 shrink-0">
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
                <p className="text-[10px] text-gray-500 mt-1.5 truncate">
                  {fmtEur(g.target_amount)} target
                  {g.target_date ? ` · ${g.target_date}` : ''}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
