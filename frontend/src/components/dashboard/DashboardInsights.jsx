import { Sparkles, AlertTriangle, Info, TrendingUp, TrendingDown } from 'lucide-react';
import clsx from 'clsx';

const ICON = {
  positive: TrendingUp,
  negative: TrendingDown,
  warning: AlertTriangle,
  info: Info,
};

const STYLE = {
  positive: 'border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300',
  negative: 'border-red-500/25 bg-red-500/5 text-red-700 dark:text-red-300',
  warning: 'border-amber-500/25 bg-amber-500/5 text-amber-800 dark:text-amber-200',
  info: 'border-gray-500/20 bg-gray-500/5 text-gray-600 dark:text-gray-300',
};

export default function DashboardInsights({ insights }) {
  if (!insights?.length) return null;

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-brand-500" />
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Financial health</h2>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {insights.map((ins, i) => {
          const Icon = ICON[ins.level] || Info;
          return (
            <li
              key={i}
              className={clsx('rounded-xl border px-3 py-2.5 text-xs leading-relaxed flex gap-2', STYLE[ins.level] || STYLE.info)}
            >
              <Icon size={14} className="shrink-0 mt-0.5 opacity-80" />
              <span>{ins.text}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
