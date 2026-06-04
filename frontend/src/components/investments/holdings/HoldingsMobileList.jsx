import { useState, memo } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { fmtEur, fmtPct, fmtQty } from '../../../utils/investmentFormat';
import SecurityDisplay from '../SecurityDisplay';
import { BROKER_LABELS, BROKER_COLORS } from '../constants';
import { priceStatusLabel } from './index';
import { holdingInsight } from './holdingsUtils';

function MobileCard({ row, showEur, expanded, onToggle, onOpen }) {
  const up = (row.unrealizedPnLEur ?? 0) >= 0;
  const badge = priceStatusLabel(row);
  const insights = expanded ? holdingInsight(row).slice(0, 2) : [];

  return (
    <li className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/80 overflow-hidden">
      <button
        type="button"
        className="w-full text-left p-4 space-y-3"
        onClick={() => onOpen(row)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <SecurityDisplay
              row={row}
              primaryClassName="font-semibold text-gray-900 dark:text-white text-sm"
              secondaryClassName="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 font-mono"
            />
          </div>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-medium text-white shrink-0"
            style={{ background: BROKER_COLORS[row.broker] || '#94a3b8' }}
          >
            {BROKER_LABELS[row.broker] || row.broker}
          </span>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase text-gray-400">Value</p>
            <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">
              {showEur && row.marketValueEur != null ? fmtEur(row.marketValueEur) : '—'}
            </p>
            {row.portfolioPct != null && (
              <p className="text-[10px] text-gray-500 mt-0.5">{fmtPct(row.portfolioPct)} of portfolio</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase text-gray-400">Unrealized</p>
            <p className={clsx('text-sm font-bold tabular-nums', up ? 'text-emerald-600' : 'text-red-600')}>
              {row.unrealizedPnLEur != null ? fmtEur(row.unrealizedPnLEur, { sign: true }) : '—'}
            </p>
            {row.unrealizedPnLPct != null && (
              <p className={clsx('text-[10px] tabular-nums', up ? 'text-emerald-600/80' : 'text-red-600/80')}>
                {fmtPct(row.unrealizedPnLPct, { sign: true })}
              </p>
            )}
          </div>
        </div>

        {badge && (
          <span className={clsx('inline-block text-[10px] px-1.5 py-0.5 rounded', badge.cls)}>{badge.text}</span>
        )}
      </button>

      <div className="px-4 pb-3 border-t border-gray-100 dark:border-gray-800">
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-gray-500 py-2 w-full"
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? 'Less' : 'Quick stats'}
        </button>
        {expanded && (
          <div className="grid grid-cols-2 gap-2 text-xs pb-2">
            <div><span className="text-gray-400">Qty</span> <span className="font-medium tabular-nums ml-1">{fmtQty(row.quantity)}</span></div>
            <div><span className="text-gray-400">Avg cost</span> <span className="font-medium tabular-nums ml-1">{row.avgCostPerShare != null ? fmtEur(row.avgCostPerShare) : '—'}</span></div>
            <div><span className="text-gray-400">Price</span> <span className="font-medium tabular-nums ml-1">{row.latestPriceEur != null ? fmtEur(row.latestPriceEur) : '—'}</span></div>
            <div><span className="text-gray-400">Today</span> <span className="font-medium tabular-nums ml-1">{row.dailyChangeEur != null ? fmtEur(row.dailyChangeEur, { sign: true }) : '—'}</span></div>
            {row.sector && <div className="col-span-2 text-gray-500">{row.sector} · {row.region || '—'}</div>}
            {insights.map((ins, i) => (
              <p key={i} className="col-span-2 text-[11px] text-gray-500 leading-snug">{ins.text}</p>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

function HoldingsMobileListInner({ rows, showEur, onSelect }) {
  const [expandedKey, setExpandedKey] = useState(null);

  return (
    <ul className="md:hidden space-y-3">
      {rows.map((row) => {
        const key = `${row.broker}-${row.ticker}-${row.currency}`;
        return (
          <MobileCard
            key={key}
            row={row}
            showEur={showEur}
            expanded={expandedKey === key}
            onToggle={() => setExpandedKey((k) => (k === key ? null : key))}
            onOpen={onSelect}
          />
        );
      })}
      {!rows.length && (
        <li className="card p-8 text-center text-sm text-gray-400">No positions match.</li>
      )}
    </ul>
  );
}

export default memo(HoldingsMobileListInner);
