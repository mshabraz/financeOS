import { forwardRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import clsx from 'clsx';
import LoadingSpinner from '../ui/LoadingSpinner';
import { fmtEur, fmtPct } from '../../utils/displayFormat';

function SavingsTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-gray-800 dark:text-gray-100 mb-1">{p.month}</p>
      <p className="text-brand-600 dark:text-brand-400 font-medium">
        Savings rate {p.savingsRate != null ? fmtPct(p.savingsRate) : '—'}
      </p>
      <p className="text-gray-500 mt-1">Income {fmtEur(p.income)}</p>
      <p className="text-gray-500">Expenses {fmtEur(p.expenses)}</p>
      {p.transfers > 0 && (
        <p className="text-gray-500">Transfers {fmtEur(p.transfers)}</p>
      )}
    </div>
  );
}

const SavingsRateChart = forwardRef(function SavingsRateChart(
  { data, isLoading, highlighted, className },
  ref,
) {
  const rates = data?.filter((d) => d.savingsRate != null) ?? [];
  const avg = rates.length
    ? rates.reduce((s, d) => s + d.savingsRate, 0) / rates.length
    : null;

  return (
    <div
      ref={ref}
      id="savings-rate-chart"
      className={clsx(
        'card p-5 scroll-mt-24 transition-shadow',
        highlighted && 'ring-2 ring-brand-500/60 shadow-md',
        className,
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Savings rate by month
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            (Income − expenses) ÷ income — same as dashboard · last 12 months
          </p>
        </div>
        {avg != null && (
          <p className="text-xs text-gray-500 shrink-0">
            12-mo avg{' '}
            <span className="font-semibold text-gray-800 dark:text-gray-200 tabular-nums">
              {fmtPct(avg)}
            </span>
          </p>
        )}
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : !data?.length ? (
        <p className="text-sm text-gray-400 py-12 text-center">No monthly data yet</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `${v}%`}
              domain={['auto', 'auto']}
              width={44}
            />
            <Tooltip content={<SavingsTooltip />} />
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
            <ReferenceLine
              y={15}
              stroke="#06b6d4"
              strokeDasharray="4 4"
              label={{ value: '15%', position: 'right', fontSize: 10, fill: '#06b6d4' }}
            />
            <Line
              type="monotone"
              dataKey="savingsRate"
              name="Savings rate"
              stroke="#06b6d4"
              strokeWidth={2.5}
              dot={{ r: 3, fill: '#06b6d4', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
});

export default SavingsRateChart;
