import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/Select';
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
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="shrink-0 font-medium">KPI goal</span>
              <div className="min-w-[8rem] max-w-[12rem]">
                <Select
                  value={String(featuredValue)}
                  onValueChange={(val) => onFeaturedGoalChange(normalizeGoalId(val))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {active.map((g) => (
                      <SelectItem key={g.id} value={String(normalizeGoalId(g.id) ?? g.id)}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
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
                className="rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.01] dark:bg-white/[0.02] px-3 py-2.5"
              >
                <div className="flex justify-between gap-2 mb-1.5">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{g.name}</p>
                  <span className="text-xs tabular-nums font-semibold text-gray-600 dark:text-gray-300 shrink-0">
                    {pct != null ? fmtPct(Math.min(100, pct)) : '—'}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] overflow-hidden">
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
