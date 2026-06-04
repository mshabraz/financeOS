import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Link2, Unlink, TrendingUp, TrendingDown, History } from 'lucide-react';
import clsx from 'clsx';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { getInvestmentTransactions } from '../../../api/client';
import LoadingSpinner from '../../ui/LoadingSpinner';
import { fmtEur, fmtPct, fmtQty, fmtNative } from '../../../utils/investmentFormat';
import { BROKER_LABELS, BROKER_COLORS } from '../constants';
import {
  SecurityBindModal, ManualQtyCell, ManualAvgCostCell, priceStatusLabel,
} from './index';
import { holdingInsight } from './holdingsUtils';

export default function HoldingDetailDrawer({
  row,
  showEur,
  onClose,
  onBind,
  onUnbind,
  onOpenLedger,
}) {
  const [bindOpen, setBindOpen] = useState(false);
  const insights = useMemo(() => (row ? holdingInsight(row) : []), [row]);

  const txQ = useQuery({
    queryKey: ['invTxHolding', row?.broker, row?.ticker, row?.currency],
    queryFn: () =>
      getInvestmentTransactions({
        broker: row.broker,
        search: row.ticker,
        limit: 30,
      }),
    enabled: !!row?.ticker,
  });

  if (!row) return null;

  const badge = priceStatusLabel(row);
  const up = (row.unrealizedPnLEur ?? 0) >= 0;
  const txs = (txQ.data?.data ?? []).filter(
    (t) => t.ticker === row.ticker && (!row.broker || t.broker === row.broker),
  );

  const chartData = [
    {
      name: 'Cost',
      value: row.costBasisEur ?? row.totalCostBasis ?? 0,
      fill: '#94a3b8',
    },
    {
      name: 'Market',
      value: row.marketValueEur ?? 0,
      fill: up ? '#10b981' : '#ef4444',
    },
  ].filter((d) => d.value > 0);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden />
      <aside
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col"
        role="dialog"
        aria-label="Position details"
      >
        <div className="flex items-start justify-between gap-3 px-4 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div className="min-w-0">
            <p className="text-xs font-mono text-brand-600 dark:text-brand-400">{row.ticker}</p>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white leading-snug mt-0.5">
              {row.securityName || row.fundName}
            </h2>
            <span
              className="inline-block mt-2 text-[10px] px-1.5 py-0.5 rounded font-medium text-white"
              style={{ background: BROKER_COLORS[row.broker] || '#94a3b8' }}
            >
              {BROKER_LABELS[row.broker] || row.broker}
            </span>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {badge && (
            <span className={clsx('inline-block text-xs px-2 py-1 rounded', badge.cls)}>{badge.text}</span>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Metric label="Market value" value={showEur && row.marketValueEur != null ? fmtEur(row.marketValueEur) : '—'} />
            <Metric
              label="Weight"
              value={row.portfolioPct != null ? fmtPct(row.portfolioPct) : '—'}
            />
            <Metric
              label="Unrealized"
              value={row.unrealizedPnLEur != null ? fmtEur(row.unrealizedPnLEur, { sign: true }) : '—'}
              tone={up ? 'up' : 'down'}
              sub={row.unrealizedPnLPct != null ? fmtPct(row.unrealizedPnLPct, { sign: true }) : null}
            />
            <Metric
              label="Today"
              value={row.dailyChangeEur != null ? fmtEur(row.dailyChangeEur, { sign: true }) : '—'}
            />
            <Metric label="Quantity" value={fmtQty(row.quantity)} />
            <Metric
              label="Price"
              value={row.latestPriceEur != null ? fmtEur(row.latestPriceEur) : '—'}
            />
            <Metric label="Avg cost" value={<ManualAvgCostCell holding={row} onSaved={onBind} />} raw />
            <Metric label="Units" value={<ManualQtyCell holding={row} onSaved={onBind} />} raw />
          </div>

          {insights.length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Insights</p>
              {insights.map((ins, i) => (
                <p
                  key={i}
                  className={clsx(
                    'text-xs leading-relaxed',
                    ins.level === 'warn' && 'text-amber-600 dark:text-amber-400',
                    ins.level === 'good' && 'text-emerald-600',
                    ins.level === 'bad' && 'text-red-500',
                    ins.level === 'info' && 'text-gray-600 dark:text-gray-400',
                    ins.level === 'muted' && 'text-gray-500',
                  )}
                >
                  {ins.text}
                </p>
              ))}
            </div>
          )}

          {chartData.length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Cost vs market (EUR)</p>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 8 }}>
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `€${v}`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={48} />
                    <Tooltip formatter={(v) => fmtEur(v)} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {chartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {(row.priceStatus === 'needs_binding' || row.priceStatus === 'error') && (
              <button type="button" className="btn-primary text-xs gap-1" onClick={() => setBindOpen(true)}>
                <Link2 size={12} /> Link price
              </button>
            )}
            {row.binding && (
              <button type="button" className="btn-secondary text-xs gap-1" onClick={() => onUnbind?.(row)}>
                <Unlink size={12} /> Unlink
              </button>
            )}
            {onOpenLedger && (
              <button type="button" className="btn-secondary text-xs gap-1" onClick={() => onOpenLedger(row)}>
                <History size={12} /> All activity
              </button>
            )}
          </div>

          {(row.sector || row.region || row.assetClass) && (
            <dl className="grid grid-cols-2 gap-2 text-xs">
              {row.sector && <Meta label="Sector" value={row.sector} />}
              {row.region && <Meta label="Region" value={row.region} />}
              {row.assetClass && <Meta label="Asset class" value={row.assetClass} />}
              {row.dividendYield != null && <Meta label="Div. yield" value={`${row.dividendYield.toFixed(2)}%`} />}
            </dl>
          )}

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Recent transactions</p>
            {txQ.isLoading ? (
              <LoadingSpinner />
            ) : txs.length ? (
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {txs.slice(0, 12).map((t) => (
                  <li key={t.id} className="flex justify-between gap-2 text-xs py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <span className="text-gray-500">{t.date} · {t.type}</span>
                    <span className="font-medium tabular-nums">{fmtNative(t.net_amount, t.currency)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-400">No transactions for this ticker.</p>
            )}
          </div>

          {row.binding?.yahooSymbol && (
            <p className="text-[10px] text-gray-400 font-mono">Yahoo: {row.binding.yahooSymbol}</p>
          )}
        </div>
      </aside>

      {bindOpen && (
        <SecurityBindModal
          holding={row}
          onClose={() => setBindOpen(false)}
          onBound={() => { setBindOpen(false); onBind?.(); }}
        />
      )}
    </>
  );
}

function Metric({ label, value, sub, tone, raw }) {
  const tones = {
    up: 'text-emerald-600',
    down: 'text-red-600',
  };
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-2.5">
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      {raw ? (
        <div className="mt-1 text-sm">{value}</div>
      ) : (
        <>
          <p className={clsx('text-sm font-semibold tabular-nums mt-0.5', tone && tones[tone])}>{value}</p>
          {sub && <p className="text-[10px] text-gray-500 tabular-nums">{sub}</p>}
        </>
      )}
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div>
      <dt className="text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-800 dark:text-gray-200">{value}</dd>
    </div>
  );
}
