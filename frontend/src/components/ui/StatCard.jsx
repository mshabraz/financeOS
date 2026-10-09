import clsx from 'clsx';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { usePrivacy } from '../../context/PrivacyContext';
import { maskIfPrivacy } from '../../utils/privacyMask';

export default function StatCard({ label, value, sub, icon, color = 'blue', trend }) {
  usePrivacy();
  const displayValue = maskIfPrivacy(value);
  const displaySub = sub != null ? maskIfPrivacy(sub) : sub;
  const colors = {
    blue:   'bg-brand-500/10 text-brand-600 dark:text-brand-400',
    green:  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    red:    'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    gray:   'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  };

  const isTrendPositive = trend
    ? typeof trend === 'object'
      ? trend.isPositive ?? trend.value >= 0
      : String(trend).startsWith('+')
    : false;
  const trendText = trend
    ? typeof trend === 'object'
      ? trend.label || trend.value
      : trend
    : null;

  return (
    <div className="card p-4 sm:p-5 hover:shadow-card-hover transition-all duration-150">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {label}
          </p>
          <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
            <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tabular-nums tracking-tight break-words [overflow-wrap:anywhere]">
              {displayValue}
            </p>
            {trendText && (
              <span
                className={clsx(
                  'inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded tabular-nums',
                  isTrendPositive
                    ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40'
                    : 'text-rose-700 bg-rose-50 dark:text-rose-400 dark:bg-rose-950/40'
                )}
              >
                {isTrendPositive ? <TrendingUp size={11} className="shrink-0" /> : <TrendingDown size={11} className="shrink-0" />}
                {trendText}
              </span>
            )}
          </div>
          {displaySub && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-snug">{displaySub}</p>}
        </div>
        {icon && (
          <div className={clsx('p-2.5 rounded-xl shrink-0', colors[color])}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
