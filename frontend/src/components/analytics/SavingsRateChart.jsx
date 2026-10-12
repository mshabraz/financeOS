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
    <div className="z-50 min-w-[9rem] max-w-xs rounded-xl border border-black/[0.08] dark:border-white/[0.12] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl p-3 text-xs shadow-xl shadow-black/10 dark:shadow-2xl dark:shadow-black/60 pointer-events-none select-none">
      <div className="font-semibold text-slate-800 dark:text-slate-200 mb-2 border-b border-black/[0.06] dark:border-white/[0.08] pb-1.5 flex items-center justify-between gap-2">
        <span>{p.month}</span>
        <span className="text-brand-600 dark:text-brand-400 font-bold tabular-nums">
          {p.savingsRate != null ? fmtPct(p.savingsRate) : '—'}
        </span>
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-600 dark:text-slate-300">Income</span>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{fmtEur(p.income)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-600 dark:text-slate-300">Expenses</span>
          <span className="font-semibold text-rose-500 dark:text-rose-400 tabular-nums">{fmtEur(p.expenses)}</span>
        </div>
        {p.transfers > 0 && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-600 dark:text-slate-300">Transfers</span>
            <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{fmtEur(p.transfers)}</span>
          </div>
        )}
      </div>
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
