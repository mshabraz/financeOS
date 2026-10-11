import clsx from 'clsx';
import { BROKER_LABELS, BROKER_COLORS } from './constants';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'holdings', label: 'Holdings' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'planner', label: 'Wealth Planner' },
  { id: 'ledger', label: 'Activity' },
  { id: 'dividends', label: 'Dividends' },
  { id: 'history', label: 'Import Log' },
  { id: 'import', label: 'Import CSV' },
];

/**
 * Unified Investments header: title, broker filter (optional), tab nav.
 */
export default function InvestmentsChrome({
  tab,
  onTabChange,
  brokerFilter = '',
  onBrokerChange,
  hideBroker = false,
  compact = false,
}) {
  return (
    <div className={clsx('space-y-3', compact && 'space-y-2')}>
      <div
        className={clsx(
          'flex flex-col gap-3',
          compact ? 'sm:flex-row sm:items-center sm:justify-between' : 'lg:flex-row lg:items-end lg:justify-between'
        )}
      >
        <div className="min-w-0">
          <h1
            className={clsx(
              'font-bold text-gray-900 dark:text-white tracking-tight',
              compact ? 'text-xl' : 'text-2xl'
            )}
          >
            Investments
          </h1>
          {!compact && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Portfolio tracking · performance · wealth planning
            </p>
          )}
        </div>

        <div className="w-full min-w-0 lg:max-w-3xl lg:ml-auto">
          <div className="scroll-x touch-pan-x rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.04] dark:border-white/[0.06] p-1 text-sm backdrop-blur-sm">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTabChange(t.id)}
                className={clsx(
                  'px-3 py-2 rounded-lg font-medium transition-all whitespace-nowrap min-h-[40px]',
                  tab === t.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-black/[0.04] dark:border-white/[0.06]'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!hideBroker && onBrokerChange && (
        <div className="scroll-x touch-pan-x flex gap-1.5 pb-0.5">
          {[['', 'All Brokers'], ...Object.entries(BROKER_LABELS)].map(([key, label]) => (
            <button
              key={key || 'all'}
              type="button"
              onClick={() => onBrokerChange(key)}
              className={clsx(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap',
                brokerFilter === key
                  ? 'bg-brand-600 border-brand-600 text-white shadow-sm'
                  : 'border-black/[0.08] dark:border-white/[0.08] bg-white/60 dark:bg-slate-900/40 backdrop-blur-sm text-slate-600 dark:text-slate-400 hover:border-brand-500/50 hover:text-slate-900 dark:hover:text-white'
              )}
            >
              {key && (
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
                  style={{ background: BROKER_COLORS[key] }}
                />
              )}
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { TABS as INVESTMENTS_TABS };
