import {
  TrendingUp, TrendingDown, Wallet, PiggyBank, Shield, AlertTriangle,
  RefreshCw, Layers,
} from 'lucide-react';
import clsx from 'clsx';
import { fmtEur, fmtPct } from '../../../utils/investmentFormat';
import { BROKER_LABELS } from '../constants';
import { formatSyncTime } from './index';

function KpiCard({ label, value, sub, icon: Icon, tone = 'neutral' }) {
  const tones = {
    neutral: 'text-gray-900 dark:text-white',
    up: 'text-emerald-600 dark:text-emerald-400',
    down: 'text-red-600 dark:text-red-400',
    muted: 'text-gray-600 dark:text-gray-300',
  };
  return (
    <div className="rounded-2xl border border-gray-200/80 dark:border-gray-700/80 bg-white/60 dark:bg-gray-900/50 p-3.5 min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
        {Icon && <Icon size={12} className="shrink-0 opacity-70" />}
        <span className="truncate">{label}</span>
      </div>
      <p className={clsx('text-lg sm:text-xl font-bold tabular-nums truncate', tones[tone])}>{value}</p>
      {sub && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 truncate">{sub}</p>}
    </div>
  );
}

export default function HoldingsSummaryHeader({ summary, alerts = [] }) {
  if (!summary) return null;
  const up = (summary.totalUnrealized ?? 0) >= 0;

  return (
    <div className="space-y-3">
      {(alerts.length > 0 || summary.unbound > 0 || summary.needsQty > 0) && (
        <div className="flex flex-wrap gap-2">
          {summary.unbound > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200">
              <AlertTriangle size={11} />
              {summary.unbound} need price link
            </span>
          )}
          {summary.needsQty > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200">
              <AlertTriangle size={11} />
              {summary.needsQty} need qty / avg cost
            </span>
          )}
          {alerts.map((a) => (
            <span key={a} className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800">
              {a}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <KpiCard
          label="Holdings value"
          value={fmtEur(summary.totalValue)}
          sub={summary.pricedCount != null ? `${summary.pricedCount}/${summary.positionCount} priced` : null}
          icon={Layers}
        />
        <KpiCard
          label="Unrealized P/L"
          value={fmtEur(summary.totalUnrealized, { sign: true })}
          sub={summary.unrealizedPct != null ? fmtPct(summary.unrealizedPct, { sign: true }) : null}
          icon={up ? TrendingUp : TrendingDown}
          tone={up ? 'up' : 'down'}
        />
        <KpiCard
          label="Best performer"
          value={summary.best ? summary.best.ticker : '—'}
          sub={summary.best?.unrealizedPnLPct != null ? fmtPct(summary.best.unrealizedPnLPct, { sign: true }) : null}
          icon={TrendingUp}
          tone="up"
        />
        <KpiCard
          label="Worst performer"
          value={summary.worst ? summary.worst.ticker : '—'}
          sub={summary.worst?.unrealizedPnLPct != null ? fmtPct(summary.worst.unrealizedPnLPct, { sign: true }) : null}
          icon={TrendingDown}
          tone="down"
        />
        <KpiCard
          label="Largest holding"
          value={summary.largest?.ticker ?? '—'}
          sub={
            summary.largest?.portfolioPct != null
              ? `${fmtPct(summary.largest.portfolioPct)} weight`
              : summary.largest?.securityName
          }
          icon={Wallet}
        />
        <KpiCard
          label="Diversification"
          value={summary.diversificationScore != null ? String(summary.diversificationScore) : '—'}
          sub={
            summary.cashPct != null
              ? `${summary.cashPct.toFixed(0)}% cash · ${summary.investedPct?.toFixed(0) ?? '—'}% invested`
              : null
          }
          icon={Shield}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400 px-1">
        <span className="inline-flex items-center gap-1">
          <PiggyBank size={11} />
          Cash {fmtEur(summary.cash)} · Portfolio {fmtEur(summary.totalPortfolio)}
        </span>
        {summary.lastSync && (
          <span className="inline-flex items-center gap-1">
            <RefreshCw size={11} />
            Last sync {formatSyncTime(summary.lastSync)}
          </span>
        )}
        {summary.largest?.broker && (
          <span>
            Top weight: {BROKER_LABELS[summary.largest.broker] || summary.largest.broker}
          </span>
        )}
      </div>
    </div>
  );
}
