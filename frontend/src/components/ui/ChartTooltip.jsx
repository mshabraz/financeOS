import * as React from 'react';
import clsx from 'clsx';
import { fmtEur } from '../../utils/displayFormat';

/**
 * Modernized Radix/shadcn style tooltip for Recharts.
 * Replaces the default solid-white rectangular box with a theme-adaptive,
 * glassmorphic tooltip with high optical contrast in dark & light modes.
 */
export function ChartTooltipContent({
  active,
  payload,
  label,
  valueFormatter,
  labelFormatter,
  hideLabel = false,
  className,
}) {
  if (!active || !payload || !payload.length) return null;

  const displayLabel = labelFormatter
    ? labelFormatter(label, payload)
    : (label != null ? String(label) : null);

  return (
    <div
      className={clsx(
        'z-50 min-w-[9rem] max-w-xs rounded-xl border border-black/[0.08] dark:border-white/[0.12]',
        'bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl p-3 text-xs',
        'shadow-xl shadow-black/10 dark:shadow-2xl dark:shadow-black/60 outline-none',
        'pointer-events-none select-none transition-all',
        className
      )}
    >
      {!hideLabel && displayLabel && (
        <div className="font-semibold text-slate-800 dark:text-slate-200 mb-2 border-b border-black/[0.06] dark:border-white/[0.08] pb-1.5 flex items-center justify-between gap-2">
          <span className="truncate">{displayLabel}</span>
        </div>
      )}

      <div className="space-y-1.5">
        {payload.map((item, i) => {
          const color = item.color || item.fill || item.stroke || '#3b82f6';
          const name = item.name || item.dataKey || 'Value';
          const val = item.value;
          const formatted = valueFormatter
            ? valueFormatter(val, name, item)
            : (typeof val === 'number' ? fmtEur(val) : val);

          return (
            <div
              key={`${name}-${i}`}
              className="flex items-center justify-between gap-4 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                  style={{ backgroundColor: color }}
                />
                <span className="text-slate-600 dark:text-slate-300 truncate">
                  {item.payload?.icon ? `${item.payload.icon} ` : ''}
                  {name}
                </span>
              </div>
              <span className="font-semibold text-slate-900 dark:text-white tabular-nums shrink-0">
                {formatted}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChartTooltip({ ...props }) {
  return <ChartTooltipContent {...props} />;
}

export default ChartTooltipContent;
