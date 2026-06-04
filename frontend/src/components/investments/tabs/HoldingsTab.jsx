import { useMemo, useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, Wallet } from 'lucide-react';
import LoadingSpinner from '../../ui/LoadingSpinner';
import { ManualCashBox } from '../holdings';
import HoldingsSummaryHeader from '../holdings/HoldingsSummaryHeader';
import HoldingsToolbar from '../holdings/HoldingsToolbar';
import HoldingsPortfolioTable from '../holdings/HoldingsPortfolioTable';
import HoldingsMobileList from '../holdings/HoldingsMobileList';
import HoldingDetailDrawer from '../holdings/HoldingDetailDrawer';
import ClosedPositionsSection from '../holdings/ClosedPositionsSection';
import {
  mergePortfolioRows,
  computeHoldingsSummary,
  filterAndSortRows,
  DEFAULT_VISIBLE_COLUMNS,
  positionKey,
} from '../holdings/holdingsUtils';

export default function HoldingsTab({
  brokerFilter,
  syncStatus,
  syncing,
  onSync,
  onClearAutoLinks,
  clearingAuto,
  valuations,
  valuationsFailed,
  valuationsPartial,
  openHoldings,
  marketOpen,
  valuedOpen,
  closedHoldings,
  refreshValuation,
  onUnbind,
  analytics,
  onOpenLedger,
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [compact, setCompact] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_VISIBLE_COLUMNS);
  const [sortKey, setSortKey] = useState('marketValueEur');
  const [sortDir, setSortDir] = useState('desc');
  const [selected, setSelected] = useState(null);
  const [cashOpen, setCashOpen] = useState(false);

  const showEur = valuedOpen.length > 0;
  const valuation = valuations.data;
  const composition = analytics?.composition ?? [];

  const portfolioRows = useMemo(
    () => mergePortfolioRows(marketOpen, composition, valuation?.primary?.totalPortfolio ?? 0),
    [marketOpen, composition, valuation?.primary?.totalPortfolio],
  );

  const summary = useMemo(
    () => computeHoldingsSummary(portfolioRows, valuation, analytics),
    [portfolioRows, valuation, analytics],
  );

  const filteredRows = useMemo(
    () =>
      filterAndSortRows(portfolioRows, {
        search,
        sortKey,
        sortDir,
        brokerFilter,
        statusFilter,
      }),
    [portfolioRows, search, sortKey, sortDir, brokerFilter, statusFilter],
  );

  const handleSort = useCallback((key) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir('desc');
      return key;
    });
  }, []);

  const selectedKey = selected ? positionKey(selected) : null;
  const statusAlerts = [];
  if (valuationsFailed) statusAlerts.push('Market data unavailable — showing import cost basis.');
  if (valuationsPartial) statusAlerts.push('Market valuations loading — limited live data.');

  const isLoading = valuations.isLoading && !marketOpen.length;

  return (
    <div className="space-y-5">
      {(valuationsFailed || valuationsPartial) && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          {valuationsFailed ? (
            <>
              Market valuations could not be loaded ({valuations.error?.message || 'request failed'}).
              Showing {openHoldings.length} open position{openHoldings.length === 1 ? '' : 's'} from import data.
              Try <strong>Sync</strong> below or restart the backend.
            </>
          ) : (
            <>
              Market data is still loading — {openHoldings.length} position{openHoldings.length === 1 ? '' : 's'} from imports until valuations load.
            </>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="card p-12 flex justify-center">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          <HoldingsSummaryHeader summary={summary} alerts={statusAlerts} />

          <div className="card p-4 sm:p-5 space-y-4">
            <HoldingsToolbar
              search={search}
              onSearchChange={setSearch}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              compact={compact}
              onCompactChange={setCompact}
              visibleColumns={visibleColumns}
              onVisibleColumnsChange={setVisibleColumns}
              syncStatus={syncStatus}
              syncing={syncing}
              onSync={onSync}
              onClearAutoLinks={onClearAutoLinks}
              clearingAuto={clearingAuto}
              resultCount={filteredRows.length}
              totalCount={portfolioRows.length}
            />

            {portfolioRows.length ? (
              <>
                <HoldingsPortfolioTable
                  rows={filteredRows}
                  visibleColumns={visibleColumns}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  compact={compact}
                  showEur={showEur}
                  selectedKey={selectedKey}
                  onSelect={setSelected}
                />
                <HoldingsMobileList
                  rows={filteredRows}
                  showEur={showEur}
                  onSelect={setSelected}
                />
              </>
            ) : (
              <div className="py-16 text-center text-sm text-gray-400">
                No open positions. Import a broker CSV or add a manual transaction.
              </div>
            )}
          </div>

          <section className="rounded-2xl border border-gray-200/80 dark:border-gray-700/80 overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-50/80 dark:bg-gray-800/40 text-left"
              onClick={() => setCashOpen((o) => !o)}
            >
              <div className="flex items-center gap-2">
                <Wallet size={16} className="text-gray-400" />
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Cash & adjustments</p>
                  <p className="text-xs text-gray-500">Uninvested cash by broker · optional overrides</p>
                </div>
              </div>
              {cashOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
            </button>
            {cashOpen && !valuations.isLoading && (
              <div className="p-4 border-t border-gray-100 dark:border-gray-800">
                <ManualCashBox
                  valuation={valuation}
                  brokerFilter={brokerFilter}
                  onSaved={refreshValuation}
                />
              </div>
            )}
          </section>

          <ClosedPositionsSection data={closedHoldings} />
        </>
      )}

      <HoldingDetailDrawer
        row={selected}
        showEur={showEur}
        onClose={() => setSelected(null)}
        onBind={refreshValuation}
        onUnbind={onUnbind}
        onOpenLedger={onOpenLedger}
      />
    </div>
  );
}
