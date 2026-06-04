import { memo } from 'react';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import { fmtEur, fmtPct, fmtQty, fmtNative } from '../../../utils/investmentFormat';
import { BROKER_LABELS, BROKER_COLORS } from '../constants';
import { HOLDINGS_COLUMNS } from './holdingsUtils';
import { priceStatusLabel } from './index';

function PnlCell({ eur, pct }) {
  if (eur == null && pct == null) return <span className="text-gray-400">—</span>;
  const up = (eur ?? pct ?? 0) >= 0;
  return (
    <div className="text-right">
      <p className={clsx('font-semibold tabular-nums', up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
        {eur != null ? fmtEur(eur, { sign: true }) : '—'}
      </p>
      {pct != null && (
        <p className={clsx('text-[10px] tabular-nums', up ? 'text-emerald-600/80' : 'text-red-600/80')}>
          {fmtPct(pct, { sign: true })}
        </p>
      )}
    </div>
  );
}

function CellContent({ colId, row, showEur, compact }) {
  switch (colId) {
    case 'securityName':
      return (
        <div className="min-w-0 max-w-[200px]">
          <p className={clsx('font-medium text-gray-900 dark:text-white truncate', compact ? 'text-xs' : 'text-sm')}>
            {row.securityName || row.fundName || row.ticker}
          </p>
          {row.priceStatus !== 'ok' && (() => {
            const b = priceStatusLabel(row);
            return b ? (
              <span className={clsx('inline-block mt-0.5 text-[10px] px-1 rounded', b.cls)}>{b.text}</span>
            ) : null;
          })()}
        </div>
      );
    case 'ticker':
      return <span className="font-mono font-semibold text-brand-600 dark:text-brand-400 text-xs">{row.ticker}</span>;
    case 'quantity':
      return <span className="tabular-nums text-xs">{fmtQty(row.quantity)}</span>;
    case 'marketValueEur':
      return (
        <span className="font-semibold tabular-nums text-xs">
          {showEur && row.marketValueEur != null ? fmtEur(row.marketValueEur) : '—'}
        </span>
      );
    case 'portfolioPct':
      return (
        <span className="tabular-nums text-xs font-medium">
          {row.portfolioPct != null ? fmtPct(row.portfolioPct) : '—'}
        </span>
      );
    case 'latestPriceEur':
      return (
        <span className="tabular-nums text-xs">
          {row.latestPriceEur != null ? fmtEur(row.latestPriceEur) : row.latestPrice != null ? fmtNative(row.latestPrice, row.priceCurrency || row.currency) : '—'}
        </span>
      );
    case 'avgCostPerShare':
      return (
        <span className="tabular-nums text-xs text-gray-600 dark:text-gray-300">
          {row.avgCostPerShare != null ? fmtNative(row.avgCostPerShare, row.currency) : '—'}
        </span>
      );
    case 'unrealizedPnLEur':
      return <PnlCell eur={row.unrealizedPnLEur} pct={row.unrealizedPnLPct} />;
    case 'dailyChangeEur':
      return (
        <span className={clsx(
          'tabular-nums text-xs font-medium',
          (row.dailyChangeEur ?? 0) > 0 ? 'text-emerald-600' : (row.dailyChangeEur ?? 0) < 0 ? 'text-red-500' : 'text-gray-400',
        )}>
          {row.dailyChangeEur != null ? fmtEur(row.dailyChangeEur, { sign: true }) : '—'}
        </span>
      );
    case 'sector':
      return <span className="text-xs text-gray-500 truncate max-w-[100px] block">{row.sector || '—'}</span>;
    case 'region':
      return <span className="text-xs text-gray-500">{row.region || '—'}</span>;
    case 'broker':
      return (
        <span className="inline-flex items-center gap-1 text-xs">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: BROKER_COLORS[row.broker] }} />
          {BROKER_LABELS[row.broker] || row.broker}
        </span>
      );
    case 'assetClass':
      return <span className="text-xs text-gray-500">{row.assetClass || '—'}</span>;
    case 'dividendYield':
      return (
        <span className="text-xs tabular-nums text-gray-500">
          {row.dividendYield != null ? `${Number(row.dividendYield).toFixed(2)}%` : '—'}
        </span>
      );
    default:
      return null;
  }
}

function HoldingsPortfolioTableInner({
  rows,
  visibleColumns,
  sortKey,
  sortDir,
  onSort,
  compact,
  showEur,
  selectedKey,
  onSelect,
}) {
  const cols = HOLDINGS_COLUMNS.filter((c) => visibleColumns.includes(c.id));

  return (
    <div className="hidden md:block card overflow-hidden">
      <div className="overflow-x-auto max-h-[min(70vh,720px)] overflow-y-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800/95 backdrop-blur-sm shadow-sm">
            <tr>
              {cols.map((c) => (
                <th
                  key={c.id}
                  className={clsx(
                    'text-left font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-800 dark:hover:text-gray-200 whitespace-nowrap',
                    compact ? 'px-2 py-2 text-[10px]' : 'px-3 py-2.5 text-xs',
                    (c.id === 'unrealizedPnLEur' || c.id === 'dailyChangeEur' || c.id === 'marketValueEur') && 'text-right',
                  )}
                  onClick={() => onSort(c.sortKey)}
                >
                  {c.label}
                  {sortKey === c.sortKey && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                </th>
              ))}
              <th className={clsx('w-10', compact ? 'px-2 py-2' : 'px-3 py-2.5')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map((row) => {
              const key = `${row.broker}-${row.ticker}-${row.currency}`;
              const selected = selectedKey === key;
              const up = (row.unrealizedPnLEur ?? 0) > 0.01;
              const down = (row.unrealizedPnLEur ?? 0) < -0.01;
              return (
                <tr
                  key={key}
                  onClick={() => onSelect(row)}
                  className={clsx(
                    'cursor-pointer transition-colors',
                    selected && 'bg-brand-50/80 dark:bg-brand-900/20',
                    !selected && up && 'hover:bg-emerald-500/5',
                    !selected && down && 'hover:bg-red-500/5',
                    !selected && !up && !down && 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
                  )}
                >
                  {cols.map((c) => (
                    <td
                      key={c.id}
                      className={clsx(
                        compact ? 'px-2 py-2' : 'px-3 py-3',
                        (c.id === 'unrealizedPnLEur' || c.id === 'dailyChangeEur') && 'text-right',
                      )}
                    >
                      <CellContent colId={c.id} row={row} showEur={showEur} compact={compact} />
                    </td>
                  ))}
                  <td className={clsx(compact ? 'px-2 py-2' : 'px-3 py-3', 'text-gray-400')}>
                    <ChevronRight size={14} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <p className="text-center text-sm text-gray-400 py-12">No positions match your filters.</p>
        )}
      </div>
    </div>
  );
}

export default memo(HoldingsPortfolioTableInner);
