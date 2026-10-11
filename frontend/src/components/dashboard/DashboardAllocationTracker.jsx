import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts';
import { getActiveAllocationCompute } from '../../api/client';
import LoadingSpinner from '../ui/LoadingSpinner';
import { fmtEur, fmtPct } from '../../utils/displayFormat';

export default function DashboardAllocationTracker() {
  const q = useQuery({
    queryKey: ['allocationCompute', 'dashboard'],
    queryFn: () => getActiveAllocationCompute({}),
    staleTime: 60_000,
    retry: 1,
  });

  if (q.isLoading) {
    return (
      <div className="card p-6 flex justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (q.isError) {
    return null;
  }

  const { strategy, compute, message } = q.data || {};

  if (!strategy || !compute) {
    return (
      <div className="card p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Allocation & strategy</h2>
          <p className="text-sm text-gray-500 mt-1">
            {message || 'Create a target allocation to track drift and monthly buy-only rebalancing.'}
          </p>
        </div>
        <Link to="/investments?tab=strategy" className="btn-primary text-sm whitespace-nowrap">
          Set up strategy
        </Link>
      </div>
    );
  }

  const rows = (compute.categories || []).filter((c) => (c.targetPct || 0) > 0 || (c.valueEur || 0) > 0);
  const chartData = rows.map((r) => ({
    name: r.name,
    actual: r.actualPct || 0,
    target: r.targetPct || 0,
    color: r.color,
    valueEur: r.valueEur,
    driftPct: r.driftPct,
  }));
  const maxDrift = rows.reduce((best, c) => (
    Math.abs(c.driftPct || 0) > Math.abs(best?.driftPct || 0) ? c : best
  ), null);
  const chartH = Math.max(140, chartData.length * 36);

  return (
    <div className="card p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            Allocation & strategy
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {strategy.name}
            {compute.monthlyContribution > 0 && (
              <> · monthly {fmtEur(compute.monthlyContribution)}</>
            )}
            {maxDrift && (
              <> · largest drift {maxDrift.name} {fmtPct(maxDrift.driftPct, { decimals: 1, sign: true })}</>
            )}
          </p>
        </div>
        <Link to="/investments?tab=strategy" className="btn-secondary text-xs whitespace-nowrap">
          Edit strategy
        </Link>
      </div>

      {chartData.length > 0 && (
        <div className="w-full" style={{ height: chartH }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
              <XAxis type="number" hide domain={[0, 'auto']} />
              <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(v, name, p) => {
                  if (name === 'actual') {
                    return [
                      `${fmtPct(v, { decimals: 1 })} · ${fmtEur(p.payload.valueEur)}`,
                      'Actual',
                    ];
                  }
                  return [`${fmtPct(v, { decimals: 1 })}`, 'Target'];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="actual" name="Actual" radius={[0, 3, 3, 0]} barSize={10}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.color || '#0ea5e9'} />
                ))}
              </Bar>
              <Bar dataKey="target" name="Target" fill="#94a3b8" radius={[0, 3, 3, 0]} barSize={10} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {compute.unmapped?.valueEur > 0.01 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Unmapped: {fmtEur(compute.unmapped.valueEur)} ({fmtPct(compute.unmapped.actualPct, { decimals: 1 })})
        </p>
      )}

      {(compute.emergencyReserve?.totalEur > 0.01 || compute.brokerCashEur != null) && (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.01] dark:bg-white/[0.02] px-3 py-2">
            <p className="text-gray-500">Emergency / daily cash</p>
            <p className="mt-0.5 font-semibold tabular-nums text-gray-900 dark:text-white">
              {fmtEur(compute.emergencyReserve?.totalEur ?? 0)}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">Not in portfolio rebalancing</p>
          </div>
          <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.01] dark:bg-white/[0.02] px-3 py-2">
            <p className="text-gray-500">Brokerage cash</p>
            <p className="mt-0.5 font-semibold tabular-nums text-gray-900 dark:text-white">
              {fmtEur(compute.brokerCashEur ?? 0)}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">Portfolio Cash asset class</p>
          </div>
        </div>
      )}

      {compute.depositPlan?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Next deposit split (buy-only)</p>
          <div className="flex flex-wrap gap-2">
            {compute.depositPlan.map((p) => (
              <div
                key={p.categoryId}
                className="rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.01] dark:bg-white/[0.02] px-3 py-1.5 text-xs"
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1.5"
                  style={{ background: p.color }}
                />
                <span className="text-gray-700 dark:text-gray-300">{p.name}</span>
                <span className="ml-2 font-semibold tabular-nums text-gray-900 dark:text-white">
                  {fmtEur(p.depositEur)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
