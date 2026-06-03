import clsx from 'clsx';

/** Compact KPI row for planner views */
export default function PlannerMetricStrip({ items }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
      {items.map(({ label, value, sub, accent }) => (
        <div
          key={label}
          className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40 px-3 py-2.5 sm:px-4 sm:py-3"
        >
          <p className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">
            {label}
          </p>
          <p
            className={clsx(
              'text-lg sm:text-xl font-semibold tabular-nums mt-0.5 truncate',
              accent || 'text-gray-900 dark:text-white'
            )}
          >
            {value}
          </p>
          {sub && (
            <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5 truncate">{sub}</p>
          )}
        </div>
      ))}
    </div>
  );
}
