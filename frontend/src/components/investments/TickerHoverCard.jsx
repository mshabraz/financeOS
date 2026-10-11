import * as React from 'react';
import clsx from 'clsx';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '../ui/HoverCard';
import { BROKER_COLORS, BROKER_LABELS } from './constants';
import { fmt, fmtQty } from './investmentPageFmt';
import { TrendingUp, TrendingDown, Clock } from 'lucide-react';

function formatSyncTime(iso) {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleString('et-EE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function TickerHoverCard({ holding, children }) {
  if (!holding || !holding.ticker) return children;

  const isPositive = (holding.unrealizedPnLEur ?? 0) >= 0;
  const pnlPercent = holding.totalCostBasis > 0 && holding.unrealizedPnLEur != null
    ? ((holding.unrealizedPnLEur / holding.totalCostBasis) * 100).toFixed(2)
    : null;

  const nativeCcy = holding.priceCurrency || holding.currency || 'EUR';

  return (
    <HoverCard openDelay={250} closeDelay={150}>
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
      <HoverCardContent className="w-80 p-3.5 space-y-3" side="top" align="start">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-sm text-brand-600 dark:text-brand-400">
                {holding.ticker}
              </span>
              {holding.broker && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-medium text-white"
                  style={{ background: BROKER_COLORS[holding.broker] || '#94a3b8' }}
                >
                  {BROKER_LABELS[holding.broker] || holding.broker}
                </span>
              )}
            </div>
            <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate mt-0.5" title={holding.name || holding.fundName || holding.securityName}>
              {holding.name || holding.fundName || holding.securityName || holding.ticker}
            </p>
            {holding.isin && (
              <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                ISIN: {holding.isin}
              </p>
            )}
          </div>

          {holding.unrealizedPnLEur != null && (
            <div className={clsx(
              'px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 shrink-0',
              isPositive
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
            )}>
              {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              <span>{pnlPercent ? `${isPositive ? '+' : ''}${pnlPercent}%` : `${isPositive ? '+' : ''}${fmt(holding.unrealizedPnLEur, 'EUR')}`}</span>
            </div>
          )}
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs bg-black/[0.02] dark:bg-white/[0.03] p-2.5 rounded-xl border border-black/[0.04] dark:border-white/[0.05]">
          <div>
            <span className="text-slate-400 dark:text-slate-500 text-[10px] uppercase font-medium">Position Qty</span>
            <p className="font-medium text-slate-800 dark:text-slate-200 tabular-nums">
              {holding.totalQuantity != null ? fmtQty(holding.totalQuantity) : holding.quantity != null ? fmtQty(holding.quantity) : '—'}
            </p>
          </div>
          <div>
            <span className="text-slate-400 dark:text-slate-500 text-[10px] uppercase font-medium">Avg Cost</span>
            <p className="font-medium text-slate-800 dark:text-slate-200 tabular-nums">
              {holding.averageCostEur != null
                ? fmt(holding.averageCostEur, 'EUR')
                : holding.averageCost != null
                  ? fmt(holding.averageCost, nativeCcy)
                  : '—'}
            </p>
          </div>
          <div>
            <span className="text-slate-400 dark:text-slate-500 text-[10px] uppercase font-medium">Latest Price</span>
            <p className="font-medium text-slate-800 dark:text-slate-200 tabular-nums">
              {holding.latestPriceEur != null
                ? fmt(holding.latestPriceEur, 'EUR')
                : holding.latestPrice != null
                  ? fmt(holding.latestPrice, nativeCcy)
                  : '—'}
            </p>
          </div>
          <div>
            <span className="text-slate-400 dark:text-slate-500 text-[10px] uppercase font-medium">Market Value</span>
            <p className="font-medium text-slate-800 dark:text-slate-200 tabular-nums">
              {holding.marketValueEur != null
                ? fmt(holding.marketValueEur, 'EUR')
                : holding.totalCostBasis > 0
                  ? fmt(holding.totalCostBasis, nativeCcy)
                  : '—'}
            </p>
          </div>
        </div>

        {/* Footer */}
        {holding.priceFetchedAt && (
          <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 pt-0.5">
            <span className="flex items-center gap-1">
              <Clock size={10} />
              Quote updated
            </span>
            <span>{formatSyncTime(holding.priceFetchedAt)}</span>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
