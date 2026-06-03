import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Upload, TrendingUp, TrendingDown, Wallet, ArrowRightLeft, DollarSign,
  CheckCircle, AlertCircle, Info, ChevronDown, Search, Download,
  RefreshCw, Link2, Unlink, Loader2, Plus, Pencil, History,
} from 'lucide-react';
import clsx from 'clsx';
import {
  previewInvestmentImport, commitInvestmentImport,
  getInvestmentHoldings, getInvestmentDividends,
  getInvestmentTransactions, updateInvestmentTransaction, exportInvestmentTransactionsCSV,
  createManualInvestmentTransaction, deleteInvestmentTransaction, getInvestmentTransactionAudit,
  getInvestmentValuations, getInvestmentAnalytics, getInvestmentPriceSyncStatus, triggerInvestmentPriceSync,
  searchInvestmentSecurities, bindInvestmentSecurity,   clearInvestmentBinding, clearAutoInvestmentBindings,
  setInvestmentBrokerCash, getInvestmentMarketHealth,
  setInvestmentHoldingQuantity,
  setInvestmentHoldingAvgCost,
} from '../api/client';
import api from '../api/client';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import StatCard from '../components/ui/StatCard';
import UserNoteField from '../components/transactions/UserNoteField';
import PortfolioOverview from '../components/investments/PortfolioOverview';
import PriceSyncCompact from '../components/investments/PriceSyncCompact';
import ManualInvestmentTransactionModal from '../components/investments/ManualInvestmentTransactionModal';
import CompoundPlanner from '../components/investments/CompoundPlanner';
import { fmtCurrency, fmtNumber } from '../utils/displayFormat';
import { usePrivacy } from '../context/PrivacyContext';

const getImportHistory  = () => api.get('/investments/history');
const detectBroker      = (file) => { const f = new FormData(); f.append('file', file); return api.post('/investments/detect', f); };

const fmt = (n, ccy = 'EUR') => fmtCurrency(n, ccy);
const fmtQty = (n) => fmtNumber(n);

const BROKER_COLORS = {
  lightyear:     '#6366f1',
  swedbank_fund: '#10b981',
};

const BROKER_LABELS = {
  lightyear:     'LightYear',
  swedbank_fund: 'Swedbank Fund',
};

const HOLDING_COLORS = [
  '#6366f1','#10b981','#f97316','#3b82f6','#ec4899','#a855f7','#eab308','#06b6d4',
  '#84cc16','#f43f5e','#8b5cf6','#14b8a6',
];

// ── Import drop zone ─────────────────────────────────────────────────────────

function InvestmentImport({ onDone }) {
  const [stage,    setStage]    = useState('drop');
  const [file,     setFile]     = useState(null);
  const [preview,  setPreview]  = useState(null);
  const [detected, setDetected] = useState(null);
  const [error,    setError]    = useState(null);

  const onDrop = useCallback(async (accepted) => {
    const f = accepted[0];
    if (!f) return;
    setFile(f); setStage('detecting'); setError(null);
    try {
      // Step 1: detect broker
      const det = await detectBroker(f);
      setDetected(det);

      if (det.broker === 'unknown' || det.broker === 'lhv_bank') {
        setError(det.broker === 'lhv_bank'
          ? 'This looks like an LHV bank account CSV. Use the Bank Import page instead.'
          : 'Could not detect investment broker format.');
        setStage('error'); return;
      }

      // Step 2: preview
      setStage('previewing');
      const data = await previewInvestmentImport(f);
      setPreview(data); setStage('preview');
    } catch (e) { setError(e.message); setStage('error'); }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'text/csv': ['.csv'] }, maxFiles: 1,
  });

  const handleCommit = async () => {
    setStage('importing');
    try { await commitInvestmentImport(file); setStage('done'); onDone?.(); }
    catch (e) { setError(e.message); setStage('error'); }
  };

  const reset = () => { setStage('drop'); setFile(null); setPreview(null); setDetected(null); setError(null); };

  if (stage === 'done') return (
    <div className="card p-6 text-center">
      <CheckCircle size={36} className="mx-auto text-green-500 mb-3" />
      <p className="text-green-600 font-semibold text-lg mb-2">Import complete!</p>
      <button onClick={reset} className="btn-secondary">Import another file</button>
    </div>
  );

  // Detection result banner
  const DetectionBanner = detected && (
    <div className={clsx('rounded-lg p-3 flex items-start gap-3 mb-3 text-sm',
      detected.confidence >= 0.9
        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
        : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
    )}>
      {detected.confidence >= 0.9
        ? <CheckCircle size={16} className="mt-0.5 flex-shrink-0" />
        : <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />}
      <div>
        <p className="font-semibold">Detected: {detected.brokerName} ({Math.round(detected.confidence * 100)}% confidence)</p>
        <ul className="mt-1 space-y-0.5 text-xs opacity-80">
          {detected.notes?.map((n, i) => <li key={i}>• {n}</li>)}
        </ul>
      </div>
    </div>
  );

  if (stage === 'preview' && preview) return (
    <div className="card p-5 space-y-4">
      {DetectionBanner}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900 dark:text-white">{preview.filename}</p>
          <p className="text-sm text-gray-400">{preview.summary.dateFrom} → {preview.summary.dateTo}</p>
        </div>
        <div className="flex gap-6 text-center">
          <div><p className="text-2xl font-bold text-green-600">{preview.summary.newCount}</p><p className="text-xs text-gray-400">New</p></div>
          <div><p className="text-2xl font-bold text-gray-400">{preview.summary.duplicateCount}</p><p className="text-xs text-gray-400">Dupes</p></div>
          <div><p className="text-2xl font-bold text-blue-500">{preview.skipped}</p><p className="text-xs text-gray-400">Skipped</p></div>
        </div>
      </div>

      {/* Tickers */}
      {preview.summary.tickers?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {preview.summary.tickers.map((t) => (
            <span key={t} className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400">{t}</span>
          ))}
        </div>
      )}

      {/* Warnings */}
      {preview.warnings?.length > 0 && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3">
          {preview.warnings.map((w, i) => <p key={i} className="text-xs text-amber-600 dark:text-amber-400">⚠ {w}</p>)}
        </div>
      )}

      <div className="overflow-x-auto max-h-48">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
            <tr>{['Date','Ticker','Type','Fund/Details','Net Amt','Status'].map((h) => (
              <th key={h} className="text-left px-3 py-2 text-gray-500 font-medium">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {preview.preview?.slice(0, 25).map((tx, i) => (
              <tr key={i} className={clsx(tx.isDuplicate && 'opacity-40')}>
                <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{tx.date}</td>
                <td className="px-3 py-1.5 font-mono font-medium text-gray-900 dark:text-white">{tx.ticker || '—'}</td>
                <td className="px-3 py-1.5">{tx.type}</td>
                <td className="px-3 py-1.5 text-gray-400 max-w-[140px] truncate">{tx.fundName || tx.rawDetails?.slice(0,40) || '—'}</td>
                <td className="px-3 py-1.5 font-medium whitespace-nowrap">{fmt(tx.netAmount, tx.currency)}</td>
                <td className="px-3 py-1.5">
                  {tx.isDuplicate
                    ? <span className="text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">dupe</span>
                    : <span className="text-green-600 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded">new</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3">
        <button onClick={reset} className="btn-secondary">Cancel</button>
        <button onClick={handleCommit} disabled={preview.summary.newCount === 0} className="btn-primary">
          Import {preview.summary.newCount} transactions
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="card p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Supported Formats — Auto-detected</p>
        <div className="mt-2 space-y-1">
          {[
            ['LightYear',        'CSV from LightYear.io → Account Statement (comma-delimited)'],
            ['Swedbank Fund',    'CSV from Swedbank Investment Account → Account Statement (semicolon)'],
          ].map(([name, desc]) => (
            <div key={name} className="flex gap-2 text-xs text-blue-600 dark:text-blue-400">
              <span className="font-semibold w-28">{name}</span>
              <span className="opacity-75">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {stage === 'detecting' || stage === 'previewing' ? (
        <div className="card p-8 text-center"><LoadingSpinner /><p className="text-sm text-gray-400 mt-2">{stage === 'detecting' ? 'Detecting broker...' : 'Parsing transactions...'}</p></div>
      ) : (
        <div
          {...getRootProps()}
          className={clsx('card border-2 border-dashed p-10 text-center cursor-pointer transition-colors',
            isDragActive ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/10' : 'border-gray-300 dark:border-gray-700 hover:border-brand-400'
          )}
        >
          <input {...getInputProps()} />
          <Upload size={28} className="mx-auto text-gray-400 mb-2" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Drop investment CSV or click to browse</p>
          <p className="text-xs text-gray-400 mt-1">LightYear or Swedbank Fund — auto-detected</p>
          {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
        </div>
      )}
    </div>
  );
}

// ── Holdings table (handles both quantity-based and amount-based) ──────────────

function FundNameCell({ ticker, fundName, isin }) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncate = fundName && fundName.length > 22;
  return (
    <td className="px-4 py-2.5">
      <p className="font-mono font-bold text-brand-600 dark:text-brand-400">{ticker}</p>
      {fundName && (
        <button
          onClick={() => needsTruncate && setExpanded((e) => !e)}
          title={needsTruncate ? (expanded ? 'Click to collapse' : fundName) : undefined}
          className={clsx(
            'text-xs text-gray-400 text-left mt-0.5 leading-snug',
            needsTruncate && !expanded && 'truncate max-w-[180px] hover:text-brand-500',
            needsTruncate && 'cursor-pointer',
          )}
          style={!expanded ? {} : { maxWidth: '260px', whiteSpace: 'normal', wordBreak: 'break-word' }}
        >
          {fundName}
          {needsTruncate && !expanded && <span className="ml-1 text-gray-300 dark:text-gray-600">▸</span>}
          {needsTruncate && expanded  && <span className="ml-1 text-gray-300 dark:text-gray-600">▾</span>}
        </button>
      )}
      {isin && <p className="text-xs text-gray-300 dark:text-gray-600 font-mono">{isin}</p>}
    </td>
  );
}

function formatSyncTime(iso) {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleString('et-EE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function PriceSyncBar({ syncStatus, onSync, syncing, onClearAutoLinks, clearingAuto }) {
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

function SecurityBindModal({ holding, onClose, onBound }) {
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

function priceStatusLabel(h) {
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

function ManualAvgCostCell({ holding, onSaved }) {
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

function ManualQtyCell({ holding, onSaved }) {
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

function ManualCashBox({ valuation, brokerFilter, onSaved }) {
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

function MarketHoldingsTable({ data, valuation, onBind, onUnbind, showEur = true }) {
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
      <div className="card overflow-hidden">
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

function HoldingsTable({ data, title, open }) {
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
    <div className="card overflow-hidden">
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
                <FundNameCell ticker={h.ticker} fundName={h.fundName} isin={h.isin} />
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
  );
}

// ── Full investment transaction list + user notes ───────────────────────────

function InvestmentLedger({ brokerFilter }) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [hasNotesOnly, setHasNotesOnly] = useState(false);
  const [sourceType, setSourceType] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [auditTx, setAuditTx] = useState(null);
  const [manualFormError, setManualFormError] = useState('');
  const brokerOptions = Object.entries(BROKER_LABELS);

  const invalidateInvestmentQueries = () => {
    ['invTx', 'invHoldings', 'invValuations', 'invAnalytics', 'invDividends', 'assets', 'yahooHealth'].forEach((k) => {
      qc.invalidateQueries({ queryKey: [k] });
    });
  };

  const list = useQuery({
    queryKey: ['invTx', page, search, brokerFilter, hasNotesOnly, sourceType],
    queryFn: () =>
      getInvestmentTransactions({
        page,
        limit: 50,
        search: search.trim() || undefined,
        broker: brokerFilter || undefined,
        hasNotes: hasNotesOnly ? '1' : undefined,
        sourceType: sourceType || undefined,
      }),
  });

  const notesMut = useMutation({
    mutationFn: ({ id, notes }) => updateInvestmentTransaction(id, { notes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invTx'] }),
  });
  const manualMut = useMutation({
    mutationFn: ({ id, ...body }) =>
      id ? updateInvestmentTransaction(id, body) : createManualInvestmentTransaction(body),
    onSuccess: (res) => {
      if (res?.duplicateWarning) {
        setManualFormError('Potential duplicate detected. The transaction was still saved; please verify holdings/activity.');
      } else {
        setManualFormError('');
      }
      setManualOpen(false);
      setEditingTx(null);
      invalidateInvestmentQueries();
    },
    onError: (err) => setManualFormError(err.message || 'Failed to save manual transaction'),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => deleteInvestmentTransaction(id),
    onSuccess: () => {
      setManualOpen(false);
      setEditingTx(null);
      setManualFormError('');
      invalidateInvestmentQueries();
    },
    onError: (err) => setManualFormError(err.message || 'Failed to delete transaction'),
  });

  const auditQ = useQuery({
    queryKey: ['invTxAudit', auditTx?.id],
    queryFn: () => {
      if (!auditTx?.id) return Promise.resolve([]);
      return getInvestmentTransactionAudit(auditTx.id);
    },
    enabled: !!auditTx?.id,
  });

  const handleExport = async () => {
    const res = await exportInvestmentTransactionsCSV();
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'investment-transactions.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const rows = (list.data?.data ?? []).filter(Boolean);
  const openCreate = () => {
    setManualFormError('');
    setEditingTx(null);
    setManualOpen(true);
  };
  const openEdit = (tx) => {
    setManualFormError('');
    setEditingTx(tx);
    setManualOpen(true);
  };
  const handleManualSubmit = async (form) => {
    const payload = {
      type: form.type,
      ticker: form.ticker || null,
      isin: form.isin || null,
      fundName: form.fundName || null,
      quantity: form.quantity === '' ? null : Number(form.quantity),
      pricePerShare: form.pricePerShare === '' ? null : Number(form.pricePerShare),
      totalCost: form.totalCost === '' ? null : Number(form.totalCost),
      date: form.date,
      broker: form.broker,
      brokerAccountId: form.brokerAccountId || null,
      fee: form.fee === '' ? 0 : Number(form.fee),
      taxAmount: form.taxAmount === '' ? 0 : Number(form.taxAmount),
      currency: form.currency,
      notes: form.notes || null,
      reference: form.reference || null,
      rawDetails: form.rawDetails || null,
      rawType: form.rawType || null,
    };
    await manualMut.mutateAsync({ id: form.id, ...payload });
  };
  const handleDelete = async (form) => {
    if (!form?.id) return;
    if (!window.confirm('Delete this manual investment transaction permanently?')) return;
    await deleteMut.mutateAsync(form.id);
  };

  return (
    <div className="space-y-4">
      <ManualInvestmentTransactionModal
        open={manualOpen}
        initial={editingTx}
        brokerOptions={brokerOptions}
        onClose={() => { setManualOpen(false); setEditingTx(null); setManualFormError(''); }}
        onSubmit={handleManualSubmit}
        onDelete={handleDelete}
        saving={manualMut.isPending}
        deleting={deleteMut.isPending}
      />
      {auditTx && (
        <div className="fixed inset-0 z-50 bg-black/50 p-3 sm:p-6 flex items-end sm:items-center justify-center" onClick={() => setAuditTx(null)}>
          <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Transaction Audit History · #{auditTx.id}</h3>
              <button type="button" className="text-gray-400 hover:text-gray-600" onClick={() => setAuditTx(null)}>Close</button>
            </div>
            <div className="p-4 max-h-[65vh] overflow-y-auto">
              {auditQ.isLoading ? (
                <LoadingSpinner />
              ) : (
                <div className="space-y-2">
                  {(auditQ.data || []).map((a) => (
                    <div key={a.id} className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 text-xs">
                      <p className="font-medium text-gray-800 dark:text-gray-200">
                        {a.action} · {a.changed_at}
                      </p>
                      {!!a.changed_fields?.length && (
                        <p className="text-gray-500 mt-1">Fields: {a.changed_fields.join(', ')}</p>
                      )}
                    </div>
                  ))}
                  {!auditQ.data?.length && <p className="text-xs text-gray-400">No audit entries yet.</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-3xl">
          Broker trades and cash flows from imports and manual entries. Manual rows flow through the same holdings, valuation, and analytics pipeline.
        </p>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button type="button" onClick={openCreate} className="btn-primary gap-2 w-full sm:w-auto">
            <Plus size={15} /> Add Investment Transaction
          </button>
          <button type="button" onClick={handleExport} className="btn-secondary gap-2 w-full sm:w-auto shrink-0">
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>
      {manualFormError && <p className="text-xs text-red-500">{manualFormError}</p>}
      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search ticker, ISIN, details, notes…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="input pl-8 w-full"
            />
          </div>
          <select
            className="input w-full"
            value={sourceType}
            onChange={(e) => { setSourceType(e.target.value); setPage(1); }}
          >
            <option value="">All sources</option>
            <option value="manual">Manual only</option>
            <option value="imported">Imported only</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer touch-manipulation min-h-[44px]">
            <input
              type="checkbox"
              checked={hasNotesOnly}
              onChange={(e) => { setHasNotesOnly(e.target.checked); setPage(1); }}
              className="rounded border-gray-300 w-4 h-4"
            />
            Has my note only
          </label>
        </div>
      </div>
      <div className="card overflow-hidden">
        {list.isLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1120px]">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  {['Date', 'Broker', 'Source', 'Type', 'Ticker', 'Net', 'Fee', 'Your note', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{r.date}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className="text-xs px-1.5 py-0.5 rounded font-medium text-white"
                        style={{ background: BROKER_COLORS[r.broker] || '#94a3b8' }}
                      >
                        {BROKER_LABELS[r.broker] || r.broker}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={clsx(
                        'text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide font-semibold',
                        (r.manual_transaction === 1 || r.source_type === 'manual')
                          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                      )}>
                        {(r.manual_transaction === 1 || r.source_type === 'manual') ? 'Manual' : 'Imported'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{r.type}</td>
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-brand-600">{r.ticker || '—'}</td>
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">{fmt(r.net_amount, r.currency)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{fmt(r.fee, r.currency)}</td>
                    <td className="px-4 py-2.5 max-w-[240px] align-top">
                      <UserNoteField
                        value={r.notes}
                        onSave={(v) => notesMut.mutate({ id: r.id, notes: v })}
                        placeholder="Your note"
                        multiline={false}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-xs text-gray-500 hover:text-brand-600 inline-flex items-center gap-1"
                          onClick={() => setAuditTx(r)}
                          title="View audit history"
                        >
                          <History size={12} /> History
                        </button>
                        {(r.manual_transaction === 1 || r.source_type === 'manual') && (
                          <button
                            type="button"
                            className="text-xs text-gray-500 hover:text-brand-600 inline-flex items-center gap-1"
                            onClick={() => openEdit(r)}
                            title="Edit manual transaction"
                          >
                            <Pencil size={12} /> Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">
                      No rows match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center gap-2 justify-between text-xs text-gray-500">
          <span>
            Page {list.data?.page ?? 1} / {list.data?.totalPages ?? 1} · {list.data?.total ?? 0} rows
          </span>
          <div className="flex gap-1 justify-end">
            <button
              type="button"
              disabled={page <= 1}
              className="btn-ghost p-1.5 disabled:opacity-40"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <button
              type="button"
              disabled={page >= (list.data?.totalPages ?? 1)}
              className="btn-ghost p-1.5 disabled:opacity-40"
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function Investments() {
  usePrivacy();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [tab,          setTab]         = useState(
    ['overview', 'holdings', 'ledger', 'dividends', 'planner', 'history', 'import'].includes(initialTab)
      ? initialTab
      : 'overview'
  );
  const [brokerFilter, setBrokerFilter] = useState('');  // '' = all
  const [perfPeriod,   setPerfPeriod]  = useState('1Y');
  const [allocView,    setAllocView]   = useState('topHoldings');

  const holdings      = useQuery({ queryKey: ['invHoldings',   brokerFilter], queryFn: () => getInvestmentHoldings(brokerFilter) });
  const valuations    = useQuery({
    queryKey: ['invValuations', brokerFilter],
    queryFn: () => getInvestmentValuations(brokerFilter),
    refetchInterval: 60_000,
    retry: 2,
  });
  const analytics     = useQuery({
    queryKey: ['invAnalytics', brokerFilter, perfPeriod],
    queryFn: () => getInvestmentAnalytics({
      ...(brokerFilter ? { broker: brokerFilter } : {}),
      period: perfPeriod,
    }),
    refetchInterval: 120_000,
    retry: 1,
    staleTime: 30_000,
    enabled: tab === 'overview',
  });
  const syncStatus    = useQuery({
    queryKey: ['invPriceSync'],
    queryFn: getInvestmentPriceSyncStatus,
    refetchInterval: (q) => (q.state.data?.running ? 3000 : 30_000),
  });
  const syncMut       = useMutation({
    mutationFn: triggerInvestmentPriceSync,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invPriceSync'] });
      qc.invalidateQueries({ queryKey: ['invValuations'] });
      qc.invalidateQueries({ queryKey: ['invAnalytics'] });
      qc.invalidateQueries({ queryKey: ['invBrokerCash'] });
      qc.invalidateQueries({ queryKey: ['assets'] });
    },
  });
  const unbindMut     = useMutation({
    mutationFn: (h) => clearInvestmentBinding({ broker: h.broker, ticker: h.ticker, currency: h.currency }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invValuations'] }),
  });
  const clearAutoMut  = useMutation({
    mutationFn: clearAutoInvestmentBindings,
    onSuccess: () => refreshValuation(),
  });
  const dividends     = useQuery({ queryKey: ['invDividends',  brokerFilter], queryFn: () => getInvestmentDividends(brokerFilter) });
  const importHistory = useQuery({ queryKey: ['importHistory'], queryFn: getImportHistory, enabled: tab === 'history' });

  const openHoldings   = holdings.data?.filter((h) => !h.fullyExited) ?? [];
  const closedHoldings = holdings.data?.filter((h) => h.fullyExited && h.totalProceeds > 0) ?? [];
  const valuedOpen     = valuations.data?.openHoldings ?? [];
  const marketOpen     = valuedOpen.length > 0 ? valuedOpen : openHoldings;
  const valuationsFailed = valuations.isError;
  const valuationsPartial = !valuations.isLoading && !valuations.isError && valuedOpen.length === 0 && openHoldings.length > 0;

  const TABS = [
    { id: 'overview',  label: 'Overview'    },
    { id: 'holdings',  label: 'Holdings'    },
    { id: 'planner',   label: 'Wealth Planner' },
    { id: 'ledger',    label: 'Activity'    },
    { id: 'dividends', label: 'Dividends'   },
    { id: 'history',   label: 'Import Log'  },
    { id: 'import',    label: 'Import CSV'  },
  ];

  const invalidateAll = () => {
    ['invHoldings','invValuations','invAnalytics','invPriceSync','invDividends','importHistory','invTx','assets'].forEach(
      (k) => qc.invalidateQueries({ queryKey: [k] })
    );
  };

  const refreshValuation = () => {
    qc.invalidateQueries({ queryKey: ['invValuations'] });
    qc.invalidateQueries({ queryKey: ['invAnalytics'] });
    qc.invalidateQueries({ queryKey: ['invPriceSync'] });
    qc.invalidateQueries({ queryKey: ['assets'] });
  };

  return (
    <div className="space-y-6">
      {/* Header — title stacked; broker + tabs on scrollable rows (mobile) */}
      <div className="space-y-3 sm:space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Investments</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Live portfolio · allocation · performance</p>
        </div>

        <div className="w-full min-w-0">
          <div className="scroll-x touch-pan-x rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-1">
            {[['', 'All Brokers'], ...Object.entries(BROKER_LABELS)].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setBrokerFilter(key)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                  brokerFilter === key
                    ? 'bg-brand-600 border-brand-600 text-white'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-brand-400'
                )}
              >
                {key && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ background: BROKER_COLORS[key] }} />}
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full min-w-0">
          <div className="scroll-x touch-pan-x rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 text-sm">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={clsx(
                  'px-3 py-1.5 rounded-md font-medium transition-colors min-h-[40px]',
                  tab === t.id
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Overview — portfolio analytics ── */}
      {tab === 'overview' && (
        <PortfolioOverview
          analytics={analytics.data}
          isLoading={analytics.isLoading}
          isError={analytics.isError}
          errorMessage={analytics.error?.message}
          period={perfPeriod}
          onPeriodChange={setPerfPeriod}
          allocationView={allocView}
          onAllocationViewChange={setAllocView}
          brokerFilter={brokerFilter}
          onOpenHoldings={() => setTab('holdings')}
          priceSyncBar={
            <PriceSyncCompact
              syncStatus={syncStatus}
              syncing={syncMut.isPending || syncStatus.data?.running}
              onSync={() => syncMut.mutate()}
              onClearAutoLinks={() => clearAutoMut.mutate()}
              clearingAuto={clearAutoMut.isPending}
            />
          }
        />
      )}

      {/* ── Wealth planner (compound interest / FIRE) ── */}
      {tab === 'planner' && (
        <CompoundPlanner brokerFilter={brokerFilter} />
      )}

      {/* ── Holdings ── */}
      {tab === 'holdings' && (
        <div className="space-y-4">
          {(valuationsFailed || valuationsPartial) && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              {valuationsFailed ? (
                <>
                  Market valuations could not be loaded ({valuations.error?.message || 'request failed'}).
                  Showing {openHoldings.length} open position{openHoldings.length === 1 ? '' : 's'} from import data (cost basis only).
                  Try <strong>Sync now</strong> or restart the backend.
                </>
              ) : (
                <>
                  Market data is still loading or returned empty — showing {openHoldings.length} open position
                  {openHoldings.length === 1 ? '' : 's'} from imports until valuations load.
                </>
              )}
            </div>
          )}
          <PriceSyncBar
            syncStatus={syncStatus}
            syncing={syncMut.isPending || syncStatus.data?.running}
            onSync={() => syncMut.mutate()}
            onClearAutoLinks={() => clearAutoMut.mutate()}
            clearingAuto={clearAutoMut.isPending}
          />
          {!valuations.isLoading && (
            <ManualCashBox
              valuation={valuations.data}
              brokerFilter={brokerFilter}
              onSaved={refreshValuation}
            />
          )}
          {valuations.isLoading && !marketOpen.length ? <LoadingSpinner /> : marketOpen.length ? (
            <MarketHoldingsTable
              data={marketOpen}
              valuation={valuations.data}
              showEur={valuedOpen.length > 0}
              onBind={refreshValuation}
              onUnbind={(h) => unbindMut.mutate(h)}
            />
          ) : (
            <div className="card p-6 text-center text-sm text-gray-400">No open positions</div>
          )}
          <HoldingsTable data={closedHoldings} title="Closed Positions (cost basis)" open={false} />
        </div>
      )}

      {/* ── Investment transactions (user notes) ── */}
      {tab === 'ledger' && (
        <InvestmentLedger brokerFilter={brokerFilter} />
      )}

      {/* ── Dividends ── */}
      {tab === 'dividends' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Total Dividends" value={fmt(dividends.data?.dividends?.reduce((s,d) => s+d.net_amount,0))} icon={<DollarSign size={18}/>} color="green" />
            <StatCard label="Total Tax"       value={fmt(dividends.data?.dividends?.reduce((s,d) => s+d.tax_amount,0))} icon={<DollarSign size={18}/>} color="red" />
            <StatCard label="Payments"        value={dividends.data?.dividends?.length ?? 0} icon={<ArrowRightLeft size={18}/>} color="blue" />
          </div>
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">By Ticker</h2>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-gray-400">
                  Total earned:{' '}
                  <span className="font-semibold text-green-600">
                    {fmt(dividends.data?.byTicker?.reduce((s, r) => s + (r.totalNet || 0), 0))}
                  </span>
                </span>
                <span className="text-gray-400">
                  Total tax:{' '}
                  <span className="font-semibold text-red-500">
                    {fmt(dividends.data?.byTicker?.reduce((s, r) => s + (r.totalTax || 0), 0))}
                  </span>
                </span>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>{['Broker','Ticker','CCY','Payments','Net Total','Tax','First','Last'].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {dividends.data?.byTicker?.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2.5"><span className="text-xs px-1.5 py-0.5 rounded font-medium text-white" style={{ background: BROKER_COLORS[r.broker] || '#94a3b8' }}>{BROKER_LABELS[r.broker] || r.broker}</span></td>
                    <td className="px-4 py-2.5 font-mono font-bold text-brand-600 dark:text-brand-400">{r.ticker}</td>
                    <td className="px-4 py-2.5 text-gray-400">{r.currency}</td>
                    <td className="px-4 py-2.5">{r.payments}</td>
                    <td className="px-4 py-2.5 text-green-600 font-medium">{fmt(r.totalNet, r.currency)}</td>
                    <td className="px-4 py-2.5 text-red-500">{r.totalTax > 0 ? fmt(r.totalTax, r.currency) : '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{r.firstDate}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{r.lastDate}</td>
                  </tr>
                ))}
              </tbody>
              {/* Totals footer */}
              {(dividends.data?.byTicker?.length ?? 0) > 0 && (
                <tfoot className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <td className="px-4 py-2.5 text-xs font-semibold text-gray-500" colSpan={3}>TOTAL</td>
                    <td className="px-4 py-2.5 font-semibold text-gray-700 dark:text-gray-200">
                      {dividends.data?.byTicker?.reduce((s, r) => s + (r.payments || 0), 0)} payments
                    </td>
                    <td className="px-4 py-2.5 font-bold text-green-600 text-base">
                      {fmt(dividends.data?.byTicker?.reduce((s, r) => s + (r.totalNet || 0), 0))}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-red-500">
                      {fmt(dividends.data?.byTicker?.reduce((s, r) => s + (r.totalTax || 0), 0))}
                    </td>
                    <td className="px-4 py-2.5" colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Annual Dividends</h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dividends.data?.byYear?.slice().reverse()}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `€${v}`} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Bar dataKey="totalNet" name="Net Dividends" fill="#10b981" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Import Log ── */}
      {tab === 'history' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800"><h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Import History</h2></div>
          {importHistory.isLoading ? <LoadingSpinner /> : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>{['Date','File','Broker','Parser','Confidence','Imported','Dupes','Skipped','Date Range'].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {importHistory.data?.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{r.created_at?.slice(0,16)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600 dark:text-gray-300 max-w-[150px] truncate">{r.filename}</td>
                    <td className="px-4 py-2.5"><span className="text-xs px-1.5 py-0.5 rounded font-medium text-white" style={{ background: BROKER_COLORS[r.broker_key] || '#94a3b8' }}>{r.broker_name}</span></td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{r.parser_version}</td>
                    <td className="px-4 py-2.5 text-xs">{Math.round((r.detected_conf || 0) * 100)}%</td>
                    <td className="px-4 py-2.5 text-green-600 font-medium">{r.imported_count}</td>
                    <td className="px-4 py-2.5 text-gray-400">{r.duplicate_count}</td>
                    <td className="px-4 py-2.5 text-gray-400">{r.skipped_count}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{r.date_from} → {r.date_to}</td>
                  </tr>
                ))}
                {!importHistory.data?.length && <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">No imports yet</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Import ── */}
      {tab === 'import' && (
        <div className="max-w-2xl">
          <InvestmentImport onDone={() => { invalidateAll(); setTab('overview'); }} />
        </div>
      )}
    </div>
  );
}
