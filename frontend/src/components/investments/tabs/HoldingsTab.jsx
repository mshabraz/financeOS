import LoadingSpinner from '../../ui/LoadingSpinner';
import {
  PriceSyncBar, ManualCashBox, MarketHoldingsTable, HoldingsTable,
} from '../holdings';

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
}) {
  return (
    <div className="space-y-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-5 shadow-sm">
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
        syncing={syncing}
        onSync={onSync}
        onClearAutoLinks={onClearAutoLinks}
        clearingAuto={clearingAuto}
      />
      {!valuations.isLoading && (
        <ManualCashBox
          valuation={valuations.data}
          brokerFilter={brokerFilter}
          onSaved={refreshValuation}
        />
      )}
      {valuations.isLoading && !marketOpen.length ? (
        <LoadingSpinner />
      ) : marketOpen.length ? (
        <MarketHoldingsTable
          data={marketOpen}
          valuation={valuations.data}
          showEur={valuedOpen.length > 0}
          onBind={refreshValuation}
          onUnbind={onUnbind}
        />
      ) : (
        <div className="card p-6 text-center text-sm text-gray-400">No open positions</div>
      )}
      <HoldingsTable data={closedHoldings} title="Closed Positions (cost basis)" open={false} />
    </div>
  );
}
