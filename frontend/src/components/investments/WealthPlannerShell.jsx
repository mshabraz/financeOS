import clsx from 'clsx';
import { Flag, TrendingUp, Target } from 'lucide-react';

export const PLANNER_MODES = [
  { id: 'tracking', label: 'Goal tracking', short: 'Tracking', icon: Flag, desc: 'Progress vs net savings' },
  { id: 'project', label: 'Forward projection', short: 'Projection', icon: TrendingUp, desc: 'Compound growth model' },
  { id: 'goal', label: 'Goal solver', short: 'Solver', icon: Target, desc: 'Required savings pace' },
];

export default function WealthPlannerShell({ mode, onModeChange, children }) {
  return (
    <div className="card overflow-hidden">
      {/* Mobile / tablet: compact segmented control */}
      <div className="lg:hidden border-b border-black/[0.06] dark:border-white/[0.07] px-2 pt-2 pb-0">
        <div className="flex gap-1 overflow-x-auto scrollbar-none">
          {PLANNER_MODES.map(({ id, short, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onModeChange(id)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
                mode === id
                  ? 'border-brand-600 text-brand-600 dark:text-brand-400 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              )}
            >
              <Icon size={15} />
              {short}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row min-h-0 lg:min-h-[480px]">
        {/* Desktop sidebar */}
        <nav
          className="hidden lg:flex flex-col w-56 shrink-0 border-r border-black/[0.06] dark:border-white/[0.07] bg-black/[0.02] dark:bg-white/[0.02] p-3 gap-1"
          aria-label="Wealth planner sections"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2 pt-1 pb-2">
            Wealth planner
          </p>
          {PLANNER_MODES.map(({ id, label, icon: Icon, desc }) => (
            <button
              key={id}
              type="button"
              onClick={() => onModeChange(id)}
              className={clsx(
                'text-left rounded-lg px-3 py-2.5 transition-all w-full',
                mode === id
                  ? 'bg-white dark:bg-slate-800 shadow-sm border border-brand-500/30'
                  : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
              )}
            >
              <span className="flex items-center gap-2">
                <Icon
                  size={18}
                  className={mode === id ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'}
                />
                <span
                  className={clsx(
                    'text-sm font-medium',
                    mode === id ? 'text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400'
                  )}
                >
                  {label}
                </span>
              </span>
              <span className="block text-[11px] text-slate-400 mt-0.5 pl-7 leading-snug">{desc}</span>
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0 min-h-[280px] overflow-y-auto">
          <div className="p-4 sm:p-5 lg:p-6 w-full max-w-6xl mx-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}
