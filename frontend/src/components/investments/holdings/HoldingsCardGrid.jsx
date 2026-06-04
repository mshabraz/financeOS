import clsx from 'clsx';
import { BROKER_COLORS, BROKER_LABELS } from '../constants';
import { fmt } from '../investmentPageFmt';
import { fmtQty } from '../../../utils/investmentFormat';
import SecurityDisplay from '../SecurityDisplay';

function BrokerBadge({ broker }) {
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-medium text-white shrink-0"
      style={{ background: BROKER_COLORS[broker] || '#94a3b8' }}
    >
      {BROKER_LABELS[broker] || broker}
    </span>
  );
}

export function MarketHoldingCards({ data, showEur = true, onBind, onUnbind }) {
  if (!data?.length) return null;
  return (
    <ul className="md:hidden grid gap-3 p-3 sm:grid-cols-2">
      {data.map((h, i) => {
        const nativeCcy = h.priceCurrency || h.currency;
        const badge = h.priceStatus === 'needs_binding' ? 'Needs link'
          : h.priceStatus === 'error' ? 'Price error'
          : h.priceStatus === 'needs_quantity' ? 'Set qty'
          : null;
        return (
          <li
            key={`${h.broker}-${h.ticker}-${i}`}
            className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/40 p-3 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <SecurityDisplay
                  row={h}
                  primaryClassName="font-semibold text-gray-900 dark:text-white text-sm"
                  secondaryClassName="text-[10px] text-gray-500 mt-0.5 font-mono"
                />
              </div>
              <BrokerBadge broker={h.broker} />
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <span className="text-gray-400">Qty</span>
              <span className="text-right font-medium tabular-nums">
                {h.quantityBased ? fmtQty(h.quantity) : (h.effectiveQuantity ? fmtQty(h.effectiveQuantity) : '—')}
              </span>
              <span className="text-gray-400">Market</span>
              <span className="text-right font-semibold tabular-nums">
                {showEur && h.marketValueEur != null
                  ? fmt(h.marketValueEur, 'EUR')
                  : h.totalCostBasis > 0 ? fmt(h.totalCostBasis, h.currency) : '—'}
              </span>
              <span className="text-gray-400">Unrealized</span>
              <span className={clsx(
                'text-right font-medium tabular-nums',
                showEur && (h.unrealizedPnLEur ?? 0) > 0.01 ? 'text-green-600'
                  : showEur && (h.unrealizedPnLEur ?? 0) < -0.01 ? 'text-red-500' : 'text-gray-400',
              )}>
                {showEur && h.unrealizedPnLEur != null
                  ? `${h.unrealizedPnLEur >= 0 ? '+' : ''}${fmt(h.unrealizedPnLEur, 'EUR')}`
                  : '—'}
              </span>
            </div>
            {badge && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400">{badge}</p>
            )}
            <div className="flex gap-3 pt-1">
              {(h.priceStatus === 'needs_binding' || h.priceStatus === 'error') && onBind && (
                <button type="button" className="text-xs text-brand-600" onClick={() => onBind(h)}>
                  Link price
                </button>
              )}
              {h.binding && onUnbind && (
                <button type="button" className="text-xs text-gray-400" onClick={() => onUnbind(h)}>
                  Unlink
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function CostBasisHoldingCards({ data, open }) {
  if (!data?.length) return null;
  return (
    <ul className="md:hidden grid gap-3 p-3 sm:grid-cols-2">
      {data.map((h, i) => (
        <li
          key={`${h.broker}-${h.ticker}-${i}`}
          className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/40 p-3 space-y-2"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <SecurityDisplay
                row={h}
                primaryClassName="font-semibold text-gray-900 dark:text-white text-sm"
                secondaryClassName="text-[10px] text-gray-500 mt-0.5 font-mono"
              />
            </div>
            <BrokerBadge broker={h.broker} />
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <span className="text-gray-400">{open && h.quantityBased ? 'Qty' : 'Invested'}</span>
            <span className="text-right font-medium tabular-nums">
              {open && h.quantityBased ? fmtQty(h.quantity) : fmt(h.totalInvested, h.currency)}
            </span>
            <span className="text-gray-400">{open ? 'Cost basis' : 'P&L'}</span>
            <span className={clsx(
              'text-right font-semibold tabular-nums',
              !open && h.realizedPnL > 0.01 ? 'text-green-600'
                : !open && h.realizedPnL < -0.01 ? 'text-red-500' : '',
            )}>
              {open
                ? (h.totalCostBasis > 0.01 ? fmt(h.totalCostBasis, h.currency) : '—')
                : (Math.abs(h.realizedPnL) > 0.01
                  ? `${h.realizedPnL > 0 ? '+' : ''}${fmt(h.realizedPnL, h.currency)}`
                  : '—')}
            </span>
          </div>
          <p className="text-[10px] text-gray-400">{h.currency} · {h.buyCount} buys · {h.sellCount} sells</p>
        </li>
      ))}
    </ul>
  );
}

export function DividendTickerCards({ rows }) {
  if (!rows?.length) return null;
  return (
    <ul className="md:hidden grid gap-3 p-3 sm:grid-cols-2">
      {rows.map((r, i) => (
        <li
          key={`${r.broker}-${r.ticker}-${i}`}
          className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/40 p-3 space-y-2"
        >
          <div className="flex items-start justify-between gap-2">
            <SecurityDisplay
              row={r}
              primaryClassName="font-semibold text-gray-900 dark:text-white text-sm"
              secondaryClassName="text-[10px] text-gray-500 font-mono"
            />
            <BrokerBadge broker={r.broker} />
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <span className="text-gray-400">Net total</span>
            <span className="text-right font-semibold text-green-600 tabular-nums">{fmt(r.totalNet, r.currency)}</span>
            <span className="text-gray-400">Payments</span>
            <span className="text-right tabular-nums">{r.payments}</span>
            <span className="text-gray-400">Tax</span>
            <span className="text-right text-red-500 tabular-nums">
              {r.totalTax > 0 ? fmt(r.totalTax, r.currency) : '—'}
            </span>
          </div>
          <p className="text-[10px] text-gray-400">{r.firstDate} → {r.lastDate}</p>
        </li>
      ))}
    </ul>
  );
}

export function ImportHistoryCards({ rows }) {
  if (!rows?.length) return null;
  return (
    <ul className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
      {rows.map((r) => (
        <li key={r.id} className="px-4 py-3 space-y-1">
          <div className="flex justify-between gap-2 items-start">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{r.filename}</p>
            <BrokerBadge broker={r.broker_key} />
          </div>
          <p className="text-xs text-gray-500">
            {r.created_at?.slice(0, 16)} · {Math.round((r.detected_conf || 0) * 100)}% conf
          </p>
          <p className="text-xs">
            <span className="text-green-600 font-medium">{r.imported_count} new</span>
            {' · '}
            <span className="text-gray-400">{r.duplicate_count} dupes</span>
            {' · '}
            <span className="text-gray-400">{r.skipped_count} skipped</span>
          </p>
          <p className="text-[10px] text-gray-400">{r.date_from} → {r.date_to}</p>
        </li>
      ))}
    </ul>
  );
}
