import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  TrendingUp, DollarSign, Wallet, AlertCircle, Search, RefreshCw,
  Link2, Unlink, Loader2,
} from 'lucide-react';
import clsx from 'clsx';
import {
  getInvestmentMarketHealth,
  searchInvestmentSecurities, bindInvestmentSecurity,
  setInvestmentBrokerCash, setInvestmentHoldingQuantity, setInvestmentHoldingAvgCost,
} from '../../../api/client';
import StatCard from '../../ui/StatCard';
import { BROKER_COLORS, BROKER_LABELS } from '../constants';
import { fmt, fmtQty } from '../investmentPageFmt';
import { MarketHoldingCards, CostBasisHoldingCards } from './HoldingsCardGrid';
import SecurityDisplay from '../SecurityDisplay';

export function FundNameCell({ ticker, fundName, isin, row }) {
  const displayRow = row ?? { ticker, fundName, isin };
  return (
    <td className="px-4 py-2.5">
      <SecurityDisplay
        row={displayRow}
        primaryClassName="font-medium text-gray-900 dark:text-white text-sm"
        secondaryClassName="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 font-mono"
      />
    </td>
  );
}

export function formatSyncTime(iso) {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleString('et-EE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function PriceSyncBar({ syncStatus, onSync, syncing, onClearAutoLinks, clearingAuto }) {
  const st = syncStatus?.data;
  const running = syncing || st?.running || st?.status === 'running';
  const lastOk = st?.last_success_at;
  const err = st?.last_error;

  const yahooHealth = useQuery({
    queryKey: ['yahooHealth'],
    queryFn: getInvestmentMarketHealth,
    staleTime: 60_000,
    retry: false,
  });

  const yahooOk = yahooHealth.data?.ok;
  const yahooErr = yahooHealth.data?.error || yahooHealth.error?.message;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={clsx(
            'w-2 h-2 rounded-full shrink-0',
            running ? 'bg-amber-400 animate-pulse' : err && st?.status === 'error' ? 'bg-red-500' : 'bg-green-500'
          )} />
          <div className="text-sm min-w-0">
            <p className="font-medium text-gray-800 dark:text-gray-200">
              {running ? 'Syncing market prices…' : 'Price sync'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Last update: {formatSyncTime(lastOk)}
              {st?.securities_updated != null && !running && (
                <span> · {st.securities_updated} quote{st.securities_updated === 1 ? '' : 's'} refreshed</span>
              )}
            </p>
            {err && st?.status === 'error' && (
              <p className="text-xs text-red-500 mt-0.5 truncate">{err}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onClearAutoLinks && (
            <button
              type="button"
              onClick={onClearAutoLinks}
              disabled={clearingAuto}
              className="btn-secondary text-xs"
              title="Remove links that were created automatically"
            >
              Clear auto-links
            </button>
          )}
          <button
            type="button"
            onClick={() => yahooHealth.refetch()}
            disabled={yahooHealth.isFetching}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            {yahooHealth.isFetching ? <Loader2 size={14} className="animate-spin" /> : null}
            Test Yahoo
          </button>
          <button
            type="button"
            onClick={onSync}
            disabled={running}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Sync now
          </button>
        </div>
      </div>
      <div className="text-xs border-t border-gray-100 dark:border-gray-800 pt-2">
        <span className="text-gray-500">Yahoo Finance: </span>
        {yahooHealth.isLoading || yahooHealth.isFetching ? (
          <span className="text-gray-400">checking…</span>
        ) : yahooOk ? (
          <span className="text-green-600">
            connected
            {yahooHealth.data?.sample ? ` (e.g. ${yahooHealth.data.sample})` : ''}
          </span>
        ) : (
          <span className="text-red-500">{yahooErr || 'unavailable'}</span>
        )}
      </div>
    </div>
  );
}

export function SecurityBindModal({ holding, onClose, onBound }) {
  const [query, setQuery] = useState(holding?.ticker || holding?.isin || '');
  const [debouncedQ, setDebouncedQ] = useState(query);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  const searchQ = useQuery({
    queryKey: ['secSearch', debouncedQ],
    queryFn: () => searchInvestmentSecurities(debouncedQ),
    enabled: debouncedQ.trim().length >= 1,
    retry: false,
  });

  const bindMut = useMutation({
    mutationFn: (hit) => bindInvestmentSecurity({
      broker: holding.broker,
      ticker: holding.ticker,
      currency: holding.currency,
      isin: holding.isin,
      providerSymbol: hit.providerSymbol,
      name: hit.name,
      exchange: hit.exchange,
      quoteCurrency: hit.currency,
    }),
    onSuccess: () => { onBound?.(); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="card p-5 w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">
          Link market data — {holding.ticker}
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Search and pick the exact Yahoo symbol (often includes exchange suffix, e.g. VGVE.DE, PPFB.DE, EMIM.L).
          Binding is saved permanently.
        </p>
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9 w-full"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. VUSA, Vanguard S&P 500"
            autoFocus
          />
        </div>
        <div className="overflow-y-auto flex-1 min-h-0 space-y-1">
          {searchQ.isError && (
            <p className="text-xs text-red-500 py-3 px-2">
              {searchQ.error?.message || 'Search failed'}
            </p>
          )}
          {searchQ.isLoading && <p className="text-xs text-gray-400 py-4 text-center">Searching Yahoo Finance…</p>}
          {searchQ.data?.results?.map((hit) => (
            <button
              key={hit.providerSymbol}
              type="button"
              onClick={() => bindMut.mutate(hit)}
              disabled={bindMut.isPending}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
            >
              <span className="font-mono text-sm font-semibold text-brand-600">{hit.providerSymbol}</span>
              <span className="text-xs text-gray-500 ml-2">{hit.exchange}</span>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 truncate">{hit.name}</p>
              <p className="text-[10px] text-gray-400">{hit.quoteType} · {hit.currency}</p>
            </button>
          ))}
          {debouncedQ && !searchQ.isLoading && !searchQ.data?.results?.length && (
            <p className="text-xs text-gray-400 py-4 text-center">No matches</p>
          )}
        </div>
        <button type="button" onClick={onClose} className="btn-secondary mt-3 w-full">Cancel</button>
      </div>
    </div>
  );
}

export function priceStatusLabel(h) {
  if (h.priceStatus === 'needs_binding') return { text: 'Needs link', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' };
  if (h.priceStatus === 'error') {
    const sym = h.binding?.yahooSymbol ? ` · ${h.binding.yahooSymbol}` : '';
    return {
      text: 'Price error',
      sub: (h.priceErrorDetail || h.priceError || 'Quote failed') + sym,
      cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    };
  }
  if (h.priceStatus === 'no_price') return { text: 'Awaiting price', cls: 'bg-gray-100 text-gray-600' };
  if (h.priceStatus === 'needs_quantity') {
    return { text: 'Enter quantity', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' };
  }
  return null;
}

export function ManualAvgCostCell({ holding, onSaved }) {
  const stored = holding.avgCostPerShare ?? holding.binding?.manualAvgCostPerShare ?? '';
  const canEdit = holding.broker === 'swedbank_fund' || !holding.quantityBased;
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(stored === '' || stored == null ? '' : stored));

  const saveMut = useMutation({
    mutationFn: (n) => setInvestmentHoldingAvgCost({
      broker: holding.broker,
      ticker: holding.ticker,
      currency: holding.currency,
      avgCostPerShare: n,
    }),
    onSuccess: () => { setEditing(false); onSaved?.(); },
  });

  if (!canEdit && holding.avgCostPerShare != null) {
    return <span>{fmt(holding.avgCostPerShare, holding.currency)}</span>;
  }

  if (!canEdit) {
    return <span>{fmt(holding.totalCostBasis, holding.currency)}</span>;
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          step="any"
          className="input w-24 py-0.5 text-xs"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveMut.mutate(parseFloat(val) || 0);
            if (e.key === 'Escape') setEditing(false);
          }}
        />
        <button type="button" className="text-xs text-brand-600" onClick={() => saveMut.mutate(parseFloat(val) || 0)}>
          Save
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setVal(String(stored || '')); setEditing(true); }}
      className="text-xs text-left text-brand-600 hover:underline"
      title="Override avg cost per share when import data is incomplete"
    >
      {stored != null && stored !== '' ? (
        <span>
          {fmt(stored, holding.currency)}
          {holding.costBasisIsManual && <span className="text-[10px] text-amber-500 ml-1">manual</span>}
        </span>
      ) : (
        'Set avg cost'
      )}
    </button>
  );
}

export function ManualQtyCell({ holding, onSaved }) {
  const stored = holding.effectiveQuantity ?? holding.binding?.manualQuantity ?? '';
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(stored === '' ? '' : stored));

  const saveMut = useMutation({
    mutationFn: (n) => setInvestmentHoldingQuantity({
      broker: holding.broker,
      ticker: holding.ticker,
      currency: holding.currency,
      quantity: n,
    }),
    onSuccess: () => { setEditing(false); onSaved?.(); },
  });

  if (holding.quantityBased) {
    return <span>{fmtQty(holding.quantity)}</span>;
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          step="any"
          className="input w-24 py-0.5 text-xs"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveMut.mutate(parseFloat(val) || 0);
            if (e.key === 'Escape') setEditing(false);
          }}
        />
        <button type="button" className="text-xs text-brand-600" onClick={() => saveMut.mutate(parseFloat(val) || 0)}>
          Save
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setVal(String(stored || '')); setEditing(true); }}
      className="text-xs text-left text-brand-600 hover:underline"
      title="Fund units / shares for market value"
    >
      {stored ? fmtQty(stored) : 'Set qty'}
    </button>
  );
}

export function ManualCashBox({ valuation, brokerFilter, onSaved }) {
  const brokers = useMemo(
    () => [
      ['lightyear', BROKER_LABELS.lightyear],
      ['swedbank_fund', BROKER_LABELS.swedbank_fund],
    ],
    []
  );
  const [selectedBroker, setSelectedBroker] = useState(brokerFilter || 'lightyear');
  const [val, setVal] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (brokerFilter) setSelectedBroker(brokerFilter);
  }, [brokerFilter]);

  const byBroker = valuation?.brokerCash?.rows ?? valuation?.manualCash?.byBroker ?? [];
  const row = byBroker.find((r) => r.broker === selectedBroker);
  const amount = row?.amount ?? 0;
  const ccy = row?.currency || 'EUR';
  const totalCashEur = valuation?.brokerCash?.totalEur ?? valuation?.manualCash?.amountEur ?? 0;

  const saveMut = useMutation({
    mutationFn: (n) =>
      setInvestmentBrokerCash({ broker: selectedBroker, amount: n, currency: ccy }),
    onSuccess: () => {
      setEditing(false);
      onSaved?.();
    },
  });

  return (
    <div className="card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Uninvested cash by broker</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Optional — not from CSV imports. Totals in Overview sum cash from each broker you enter.
          </p>
        </div>
        {!brokerFilter && totalCashEur > 0 && (
          <p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
            All brokers: {fmt(totalCashEur, 'EUR')}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-gray-500">Broker</label>
        <select
          className="input text-sm w-auto min-w-[160px]"
          value={selectedBroker}
          onChange={(e) => {
            setSelectedBroker(e.target.value);
            setEditing(false);
          }}
          disabled={!!brokerFilter}
        >
          {brokers.map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        {editing ? (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="number"
              className="input w-36 text-right"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              autoFocus
            />
            <span className="text-xs text-gray-500">{ccy}</span>
            <button
              type="button"
              className="btn-primary text-xs py-1.5"
              onClick={() => saveMut.mutate(parseFloat(val) || 0)}
            >
              Save
            </button>
            <button type="button" className="btn-secondary text-xs py-1.5" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold text-gray-900 dark:text-white tabular-nums">
              {fmt(amount, ccy)}
            </span>
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => { setVal(String(amount)); setEditing(true); }}
            >
              Edit
            </button>
          </div>
        )}
      </div>

      {!brokerFilter && byBroker.filter((r) => r.amount > 0).length > 1 && (
        <ul className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
          {byBroker.filter((r) => r.amount > 0).map((r) => (
            <li key={r.broker}>
              {r.label || BROKER_LABELS[r.broker] || r.broker}: {fmt(r.amountEur ?? r.amount, 'EUR')}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MarketHoldingsTable({ data, valuation, onBind, onUnbind, showEur = true }) {
  const [bindTarget, setBindTarget] = useState(null);
  if (!data?.length) {
    return <div className="card p-6 text-center text-sm text-gray-400">No open positions</div>;
  }

  const p = valuation?.primary;
  const unbound = valuation?.unboundCount ?? 0;

  return (
    <>
      {bindTarget && (
        <SecurityBindModal
          holding={bindTarget}
          onClose={() => setBindTarget(null)}
          onBound={onBind}
        />
      )}
      {unbound > 0 && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>
            {unbound} position{unbound === 1 ? '' : 's'} need a market data link for live prices.
          </span>
        </div>
      )}
      {p && showEur && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Holdings (EUR)" value={fmt(p.holdingsValue, 'EUR')} icon={<TrendingUp size={18}/>} color="blue" />
            <StatCard label="Cash (EUR)" value={fmt(p.cashBalance, 'EUR')} icon={<DollarSign size={18}/>} color="green" />
            <StatCard label="Total (EUR)" value={fmt(p.totalPortfolio, 'EUR')} icon={<Wallet size={18}/>} color="purple" />
            <StatCard label="Last price update" value={formatSyncTime(valuation?.sync?.last_success_at)} icon={<RefreshCw size={18}/>} color="gray" />
          </div>
          {valuation?.fx?.date && (
            <p className="text-xs text-gray-500 dark:text-gray-400 px-1">
              FX rates (ECB via Frankfurter) as of {valuation.fx.date}
              {valuation.fx.stale ? ' · using cached rates' : ''}
            </p>
          )}
          {(valuation?.needsQuantityCount ?? 0) > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 px-1">
              {valuation.needsQuantityCount} fund position{valuation.needsQuantityCount === 1 ? '' : 's'} need quantity and/or avg cost — use &quot;Set qty&quot; and &quot;Set avg cost&quot; in the table.
            </p>
          )}
        </div>
      )}
      <MarketHoldingCards
        data={data}
        showEur={showEur}
        onBind={(h) => setBindTarget(h)}
        onUnbind={onUnbind}
      />
      <div className="card overflow-hidden hidden md:block">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Open positions — market value ({data.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                {['Broker','Ticker','Security','Qty','Avg cost','Last price','Market value','Unrealized','Updated',''].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.map((h, i) => {
                const badge = priceStatusLabel(h);
                const nativeCcy = h.priceCurrency || h.currency;
                const showNative =
                  nativeCcy &&
                  nativeCcy !== 'EUR' &&
                  h.marketValueNative != null &&
                  h.marketValueEur != null;
                return (
                  <tr key={`${h.broker}-${h.ticker}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-3 py-2.5">
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium text-white" style={{ background: BROKER_COLORS[h.broker] || '#94a3b8' }}>
                        {BROKER_LABELS[h.broker] || h.broker}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono font-bold text-brand-600">{h.ticker}</td>
                    <td className="px-3 py-2.5 max-w-[140px]">
                      <p className="truncate text-xs text-gray-700 dark:text-gray-300">
                        {h.binding?.securityName || h.fundName || '—'}
                      </p>
                      {badge && (
                        <div className="mt-0.5">
                          <span className={clsx('inline-block text-[10px] px-1.5 py-0.5 rounded', badge.cls)}>
                            {badge.text}
                          </span>
                          {badge.sub && (
                            <p className="text-[10px] text-red-400 mt-0.5 line-clamp-2" title={badge.sub}>
                              {badge.sub}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <ManualQtyCell holding={h} onSaved={onBind} />
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      <ManualAvgCostCell holding={h} onSaved={onBind} />
                    </td>
                    <td className="px-3 py-2.5">
                      {showEur && h.latestPriceEur != null ? (
                        <div>
                          <span>{fmt(h.latestPriceEur, 'EUR')}</span>
                          {h.latestPriceNative != null && nativeCcy !== 'EUR' && (
                            <span className="block text-[10px] text-gray-400">
                              {fmt(h.latestPriceNative, nativeCcy)} / unit
                            </span>
                          )}
                        </div>
                      ) : h.latestPrice != null ? fmt(h.latestPrice, nativeCcy) : '—'}
                    </td>
                    <td className="px-3 py-2.5 font-medium">
                      {showEur && h.marketValueEur != null ? (
                        <div>
                          <span>{fmt(h.marketValueEur, 'EUR')}</span>
                          {showNative && (
                            <span className="block text-[10px] text-gray-400">
                              {fmt(h.marketValueNative, nativeCcy)}
                            </span>
                          )}
                        </div>
                      ) : h.totalCostBasis > 0 ? fmt(h.totalCostBasis, h.currency) : '—'}
                    </td>
                    <td className={clsx('px-3 py-2.5 font-medium',
                      showEur && (h.unrealizedPnLEur ?? 0) > 0.01 ? 'text-green-600' : showEur && (h.unrealizedPnLEur ?? 0) < -0.01 ? 'text-red-500' : 'text-gray-400')}>
                      {showEur && h.unrealizedPnLEur != null
                        ? `${h.unrealizedPnLEur >= 0 ? '+' : ''}${fmt(h.unrealizedPnLEur, 'EUR')}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-[10px] text-gray-400 whitespace-nowrap">
                      {h.priceFetchedAt ? formatSyncTime(h.priceFetchedAt) : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      {h.priceStatus === 'needs_binding' || h.priceStatus === 'error' ? (
                        <button type="button" onClick={() => setBindTarget(h)} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                          <Link2 size={12} /> {h.priceStatus === 'error' ? 'Re-link' : 'Link'}
                        </button>
                      ) : h.binding ? (
                        <button
                          type="button"
                          onClick={() => onUnbind?.(h)}
                          className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1"
                          title="Clear binding"
                        >
                          <Unlink size={12} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export function HoldingsTable({ data, title, open }) {
  if (!data?.length) return (
    <div className="card p-6 text-center text-sm text-gray-400">No {open ? 'open' : 'closed'} positions</div>
  );

  const hasQtyBased = data.some((h) => h.quantityBased);

  // Totals (EUR-only for simplicity — mixed-currency positions shown separately)
  const totalInvested   = data.reduce((s, h) => s + (h.totalInvested   || 0), 0);
  const totalCostBasis  = data.reduce((s, h) => s + (h.totalCostBasis  || 0), 0);
  const totalProceeds   = data.reduce((s, h) => s + (h.totalProceeds   || 0), 0);
  const totalRealizedPnL = data.reduce((s, h) => s + (h.realizedPnL    || 0), 0);
  const hasMixedCcy     = new Set(data.map((h) => h.currency)).size > 1;

  return (
    <>
      <CostBasisHoldingCards data={data} open={open} />
      <div className="card overflow-hidden hidden md:block">
      {title && (
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title} ({data.length})</h2>
          {/* Inline summary for the section */}
          <div className="flex items-center gap-4 text-xs">
            <span className="text-gray-400">
              Invested: <span className="font-medium text-gray-700 dark:text-gray-200">
                {hasMixedCcy ? '~' : ''}{fmt(totalInvested)}
              </span>
            </span>
            {totalProceeds > 0 && (
              <span className="text-gray-400">
                Proceeds: <span className="font-medium text-gray-700 dark:text-gray-200">
                  {hasMixedCcy ? '~' : ''}{fmt(totalProceeds)}
                </span>
              </span>
            )}
            <span className={clsx('font-semibold',
              totalRealizedPnL > 0.01 ? 'text-green-600' : totalRealizedPnL < -0.01 ? 'text-red-500' : 'text-gray-400')}>
              {open ? 'Cost Basis: ' : 'Total P&L: '}
              {hasMixedCcy ? '~' : ''}
              {open
                ? fmt(totalCostBasis)
                : `${totalRealizedPnL >= 0 ? '+' : ''}${fmt(totalRealizedPnL)}`}
            </span>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              {['Broker','Ticker / Fund','CCY',
                // Open qty-based → show current qty; closed or amount-based → show total invested
                open && hasQtyBased ? 'Qty Held' : 'Total Invested',
                open && hasQtyBased ? 'Avg Cost' : null,
                open ? 'Cost Basis' : 'Remaining Cost',
                'Proceeds', 'Realized P&L', 'Buys', 'Sells'
              ].filter(Boolean).map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.map((h, i) => (
              <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-2.5">
                  <span
                    className="text-xs px-1.5 py-0.5 rounded font-medium text-white"
                    style={{ background: BROKER_COLORS[h.broker] || '#94a3b8' }}
                  >
                    {BROKER_LABELS[h.broker] || h.broker}
                  </span>
                </td>
                <FundNameCell row={h} ticker={h.ticker} fundName={h.fundName} isin={h.isin} />
                <td className="px-4 py-2.5 text-gray-400">{h.currency}</td>

                {/* Qty Held (open qty-based) OR Total Invested (closed / amount-based) */}
                <td className="px-4 py-2.5">
                  {open && h.quantityBased
                    ? fmtQty(h.quantity)
                    : <span className="text-gray-700 dark:text-gray-300 font-medium">{fmt(h.totalInvested, h.currency)}</span>}
                </td>

                {open && hasQtyBased && (
                  <td className="px-4 py-2.5 text-xs text-gray-500">
                    {h.avgCostPerShare != null ? fmt(h.avgCostPerShare, h.currency) : '—'}
                  </td>
                )}
                <td className="px-4 py-2.5 font-medium">
                  {h.totalCostBasis > 0.01 ? fmt(h.totalCostBasis, h.currency) : '—'}
                </td>
                <td className="px-4 py-2.5 text-green-600">
                  {h.totalProceeds > 0 ? fmt(h.totalProceeds, h.currency) : '—'}
                </td>
                <td className={clsx('px-4 py-2.5 font-medium',
                  h.realizedPnL > 0.01 ? 'text-green-600' : h.realizedPnL < -0.01 ? 'text-red-500' : 'text-gray-400')}>
                  {Math.abs(h.realizedPnL) > 0.01
                    ? `${h.realizedPnL > 0 ? '+' : ''}${fmt(h.realizedPnL, h.currency)}`
                    : '—'}
                </td>
                <td className="px-4 py-2.5 text-gray-400">{h.buyCount}</td>
                <td className="px-4 py-2.5 text-gray-400">{h.sellCount}</td>
              </tr>
            ))}
          </tbody>
          {/* Totals footer */}
          <tfoot className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <tr>
              <td className="px-4 py-2.5 text-xs font-semibold text-gray-500" colSpan={3}>
                TOTAL {hasMixedCcy && <span className="font-normal text-gray-400">(~EUR equiv.)</span>}
              </td>
              <td className="px-4 py-2.5 font-semibold text-gray-800 dark:text-gray-200">
                {fmt(totalInvested)}
              </td>
              {open && hasQtyBased && <td className="px-4 py-2.5" />}
              <td className="px-4 py-2.5 font-semibold text-gray-800 dark:text-gray-200">
                {open ? fmt(totalCostBasis) : '—'}
              </td>
              <td className="px-4 py-2.5 font-semibold text-green-600">
                {totalProceeds > 0 ? fmt(totalProceeds) : '—'}
              </td>
              <td className={clsx('px-4 py-2.5 font-bold text-base',
                totalRealizedPnL > 0.01 ? 'text-green-600' : totalRealizedPnL < -0.01 ? 'text-red-500' : 'text-gray-400')}>
                {Math.abs(totalRealizedPnL) > 0.01
                  ? `${totalRealizedPnL >= 0 ? '+' : ''}${fmt(totalRealizedPnL)}`
                  : '—'}
              </td>
              <td className="px-4 py-2.5 text-gray-400 text-xs">
                {data.reduce((s, h) => s + h.buyCount, 0)} buys
              </td>
              <td className="px-4 py-2.5 text-gray-400 text-xs">
                {data.reduce((s, h) => s + h.sellCount, 0)} sells
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
    </>
  );
}
