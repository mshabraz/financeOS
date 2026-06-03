import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Target, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import clsx from 'clsx';
import { getActiveWealthGoal } from '../../api/client';
import LoadingSpinner from '../ui/LoadingSpinner';
import { fmtEur, fmtPct } from '../../utils/displayFormat';
import { usePrivacy } from '../../context/PrivacyContext';

const ON_TRACK = {
  ahead: { label: 'Ahead of plan', color: 'text-emerald-600 dark:text-emerald-400', Icon: TrendingUp },
  on_track: { label: 'On track', color: 'text-brand-600 dark:text-brand-400', Icon: Minus },
  behind: { label: 'Behind plan', color: 'text-amber-600 dark:text-amber-400', Icon: TrendingDown },
};

export default function WealthGoalWidget() {
  const { privacyMode } = usePrivacy();
  const { data, isLoading } = useQuery({
    queryKey: ['wealth-goal-active'],
    queryFn: getActiveWealthGoal,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="card p-5 flex justify-center min-h-[120px]">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  if (!data?.goal) {
    return (
      <Link to="/goals" className="card p-5 block hover:border-brand-300 dark:hover:border-brand-700 transition-colors group">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-brand-50 dark:bg-brand-900/30 text-brand-600">
              <Target size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Wealth goal</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Set a long-term target and track monthly savings progress.
              </p>
            </div>
          </div>
          <ChevronRight size={18} className="text-gray-400 group-hover:text-brand-500 shrink-0" />
        </div>
      </Link>
    );
  }

  const { goal, progressPct, currentValue, targetAmount, remaining, requiredMonthly, onTrack, thisMonth, completed } = data;
  const track = ON_TRACK[onTrack] || ON_TRACK.on_track;
  const TrackIcon = track.Icon;

  return (
    <Link to="/goals" className="card p-5 block hover:border-brand-300 dark:hover:border-brand-700 transition-colors group">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Target size={18} className="text-brand-600 shrink-0" />
          <h3 className="font-semibold text-gray-900 dark:text-white truncate">{goal.name}</h3>
        </div>
        <ChevronRight size={18} className="text-gray-400 group-hover:text-brand-500 shrink-0" />
      </div>

      <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden mb-3">
        <div
          className={clsx('h-full rounded-full transition-all', completed ? 'bg-emerald-500' : 'bg-brand-500')}
          style={{ width: `${Math.min(100, progressPct)}%` }}
        />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Progress</p>
          <p className="font-semibold text-gray-900 dark:text-white">
            {privacyMode ? '•••' : `${fmtPct(progressPct)} · ${fmtEur(currentValue)}`}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Target</p>
          <p className="font-semibold text-gray-900 dark:text-white">{privacyMode ? '•••' : fmtEur(targetAmount)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Remaining</p>
          <p className="font-medium text-gray-800 dark:text-gray-200">{privacyMode ? '•••' : fmtEur(remaining)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Need / month</p>
          <p className="font-medium text-gray-800 dark:text-gray-200">
            {privacyMode ? '•••' : completed ? '—' : fmtEur(requiredMonthly)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <span className={clsx('inline-flex items-center gap-1 font-medium', track.color)}>
          <TrackIcon size={14} />
          {completed ? 'Goal reached' : track.label}
        </span>
        {thisMonth && !completed && (
          <span className={clsx(
            'px-2 py-0.5 rounded-full',
            thisMonth.hit
              ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
          )}>
            {thisMonth.hit ? 'This month: on target' : 'This month: below target'}
          </span>
        )}
      </div>
    </Link>
  );
}
