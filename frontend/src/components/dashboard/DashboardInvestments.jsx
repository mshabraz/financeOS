import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Layers, TrendingUp, TrendingDown, ChevronRight, Shield } from 'lucide-react';
import clsx from 'clsx';
import { fmtEur, fmtPct } from '../../utils/displayFormat';
import { CHART_COLORS } from '../investments/constants';

export default function DashboardInvestments({ portfolio, analytics }) {
  if (!portfolio) return null;

  const alloc = portfolio.allocationSnapshot?.length
    ? portfolio.allocationSnapshot
    : (analytics?.allocations?.assetClass ?? []).slice(0, 6);

  const best = analytics?.insights?.bestPerformers?.[0];
  const worst = analytics?.insights?.worstPerformers?.[0];
  const divScore = analytics?.diversification?.score;

  return (
    <section className="card p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-brand-500/10 text-brand-600">
            <Layers size={18} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Investments</h2>
            <p className="text-xs text-gray-500">
              Holdings {fmtEur(portfolio.holdingsValue)} · Cash {fmtEur(portfolio.cashBalance)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/investments?tab=holdings" className="btn-secondary text-xs">Holdings</Link>
          <Link to="/investments?tab=planner" className="btn-secondary text-xs">Goals</Link>
          <Link to="/investments?tab=planner&planner=compound" className="btn-secondary text-xs">Calculator</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3 min-w-0">
          <p className="text-[10px] uppercase text-gray-400">Portfolio</p>
          <p className="text-base sm:text-lg font-bold tabular-nums break-words [overflow-wrap:anywhere]">
            {fmtEur(portfolio.totalPortfolio)}
          </p>
        </div>
        <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3 min-w-0">
          <p className="text-[10px] uppercase text-gray-400">Unrealized</p>
          <p className={clsx(
            'text-base sm:text-lg font-bold tabular-nums break-words [overflow-wrap:anywhere]',
            (portfolio.unrealizedPnLEur ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600',
          )}>
            {portfolio.unrealizedPnLEur != null ? fmtEur(portfolio.unrealizedPnLEur, { sign: true }) : '—'}
          </p>
        </div>
        <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3 min-w-0">
          <p className="text-[10px] uppercase text-gray-400 flex items-center gap-1">
            <Shield size={10} /> Diversification
          </p>
          <p className="text-base sm:text-lg font-bold tabular-nums">{divScore ?? '—'}</p>
        </div>
        <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3 min-w-0">
          <p className="text-[10px] uppercase text-gray-400">Health</p>
          <p className="text-xs font-medium mt-1 text-gray-600 dark:text-gray-300">
            {portfolio.unboundCount > 0 && `${portfolio.unboundCount} need link · `}
            {portfolio.pricedPositions}/{portfolio.openPositions} priced
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {alloc.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Allocation</p>
            <div className="h-36 sm:h-40 min-h-[9rem] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={alloc} layout="vertical" margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="label" width={64} tick={{ fontSize: 9 }} />
                  <Tooltip formatter={(v, _n, p) => [fmtPct(p.payload.pct ?? p.payload.portfolioPct), p.payload.label]} />
                  <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                    {alloc.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        <div className="space-y-3">
          {best && (
            <div className="rounded-xl border border-emerald-500/20 p-3 flex justify-between items-center">
              <div className="flex items-center gap-2 text-emerald-600">
                <TrendingUp size={14} />
                <span className="text-xs font-semibold">Best · {best.ticker}</span>
              </div>
              <span className="text-sm font-bold tabular-nums">{fmtPct(best.pct, { sign: true })}</span>
            </div>
          )}
          {worst && (
            <div className="rounded-xl border border-red-500/20 p-3 flex justify-between items-center">
              <div className="flex items-center gap-2 text-red-600">
                <TrendingDown size={14} />
                <span className="text-xs font-semibold">Worst · {worst.ticker}</span>
              </div>
              <span className="text-sm font-bold tabular-nums">{fmtPct(worst.pct, { sign: true })}</span>
            </div>
          )}
          <Link
            to="/investments"
            className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1"
          >
            Open portfolio overview <ChevronRight size={12} />
          </Link>
        </div>
      </div>
    </section>
  );
}
