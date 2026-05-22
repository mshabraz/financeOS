import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import { getInvestmentMarketHealth } from '../../api/client';
import { fmtShortDate } from '../../utils/investmentFormat';

function formatSyncTime(iso) {
  if (!iso) return 'never';
  try {
    return new Date(iso).toLocaleString('et-EE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function PriceSyncCompact({
  syncStatus,
  onSync,
  syncing,
  onClearAutoLinks,
  clearingAuto,
}) {
  const [expanded, setExpanded] = useState(false);
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

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2 px-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/40 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={clsx(
            'w-1.5 h-1.5 rounded-full shrink-0',
            running ? 'bg-amber-400 animate-pulse' : err && st?.status === 'error' ? 'bg-red-500' : 'bg-emerald-500'
          )}
        />
        <span className="text-gray-500 dark:text-gray-400 truncate">
          Prices {running ? 'syncing…' : fmtShortDate(lastOk)}
          {!running && st?.securities_updated != null && (
            <span className="text-gray-400"> · {st.securities_updated} updated</span>
          )}
        </span>
        {err && st?.status === 'error' && (
          <span className="text-red-500 truncate max-w-[120px]" title={err}> · error</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          aria-label="More sync options"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button
          type="button"
          onClick={onSync}
          disabled={running}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-brand-400 disabled:opacity-50"
        >
          {running ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Sync
        </button>
      </div>
      {expanded && (
        <div className="w-full sm:col-span-2 flex flex-wrap items-center gap-2 pt-1 border-t border-gray-200/80 dark:border-gray-700/80 sm:border-0 sm:pt-0">
          {onClearAutoLinks && (
            <button type="button" onClick={onClearAutoLinks} disabled={clearingAuto} className="text-[10px] text-gray-500 hover:text-brand-600">
              Clear auto-links
            </button>
          )}
          <button
            type="button"
            onClick={() => yahooHealth.refetch()}
            disabled={yahooHealth.isFetching}
            className="text-[10px] text-gray-500 hover:text-brand-600"
          >
            Test Yahoo
          </button>
          <span className="text-[10px] text-gray-400">
            Yahoo:{' '}
            {yahooHealth.data?.ok ? (
              <span className="text-emerald-600">ok</span>
            ) : (
              <span className="text-red-500">{yahooHealth.data?.error || 'unavailable'}</span>
            )}
          </span>
          {err && <span className="text-[10px] text-red-500 truncate w-full">{err}</span>}
        </div>
      )}
    </div>
  );
}
