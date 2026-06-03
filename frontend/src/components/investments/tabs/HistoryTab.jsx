import { useMemo, useState } from 'react';
import LoadingSpinner from '../../ui/LoadingSpinner';
import InvestmentTabFilters from '../filters/InvestmentTabFilters';
import { ImportHistoryCards } from '../holdings/HoldingsCardGrid';
import { BROKER_COLORS } from '../constants';

export default function HistoryTab({ importHistory, brokerFilter: chromeBroker }) {
  const [search, setSearch] = useState('');
  const [localBroker, setLocalBroker] = useState('');
  const effectiveBroker = chromeBroker || localBroker;

  const filtered = useMemo(() => {
    let rows = importHistory.data ?? [];
    if (effectiveBroker) rows = rows.filter((r) => r.broker_key === effectiveBroker);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.filename?.toLowerCase().includes(q) ||
          r.broker_name?.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [importHistory.data, effectiveBroker, search]);

  return (
    <div className="space-y-4">
      <InvestmentTabFilters
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search filename or broker…"
        brokerFilter={chromeBroker || localBroker}
        onBrokerChange={chromeBroker ? undefined : setLocalBroker}
        showBroker={!chromeBroker}
      />
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800 hidden md:block">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Import History</h2>
        </div>
        {importHistory.isLoading ? (
          <LoadingSpinner />
        ) : (
          <>
            <ImportHistoryCards rows={filtered} />
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    {['Date', 'File', 'Broker', 'Parser', 'Confidence', 'Imported', 'Dupes', 'Skipped', 'Date Range'].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{r.created_at?.slice(0, 16)}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-600 dark:text-gray-300 max-w-[150px] truncate">{r.filename}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className="text-xs px-1.5 py-0.5 rounded font-medium text-white"
                          style={{ background: BROKER_COLORS[r.broker_key] || '#94a3b8' }}
                        >
                          {r.broker_name}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">{r.parser_version}</td>
                      <td className="px-4 py-2.5 text-xs">{Math.round((r.detected_conf || 0) * 100)}%</td>
                      <td className="px-4 py-2.5 text-green-600 font-medium">{r.imported_count}</td>
                      <td className="px-4 py-2.5 text-gray-400">{r.duplicate_count}</td>
                      <td className="px-4 py-2.5 text-gray-400">{r.skipped_count}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">{r.date_from} → {r.date_to}</td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">
                        {importHistory.data?.length ? 'No imports match filters' : 'No imports yet'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
