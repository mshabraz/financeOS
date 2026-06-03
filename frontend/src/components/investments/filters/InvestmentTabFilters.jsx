import { Search } from 'lucide-react';
import clsx from 'clsx';
import { BROKER_LABELS } from '../constants';

/**
 * Shared filter row for ledger, dividends, import history, and similar tabs.
 */
export default function InvestmentTabFilters({
  search = '',
  onSearchChange,
  searchPlaceholder = 'Search ticker, ISIN, file, notes…',
  brokerFilter = '',
  onBrokerChange,
  showBroker = true,
  sourceType = '',
  onSourceTypeChange,
  showSource = false,
  hasNotesOnly = false,
  onHasNotesOnlyChange,
  showNotes = false,
  className,
  children,
}) {
  const brokerOptions = Object.entries(BROKER_LABELS);

  return (
    <div className={clsx('card p-4 space-y-3', className)}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {onSearchChange != null && (
          <div className="relative sm:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="input pl-8 w-full"
            />
          </div>
        )}
        {showBroker && onBrokerChange != null && (
          <select
            className="input w-full"
            value={brokerFilter}
            onChange={(e) => onBrokerChange(e.target.value)}
          >
            <option value="">All brokers</option>
            {brokerOptions.map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        )}
        {showSource && onSourceTypeChange != null && (
          <select
            className="input w-full"
            value={sourceType}
            onChange={(e) => onSourceTypeChange(e.target.value)}
          >
            <option value="">All sources</option>
            <option value="manual">Manual only</option>
            <option value="imported">Imported only</option>
          </select>
        )}
        {showNotes && onHasNotesOnlyChange != null && (
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer touch-manipulation min-h-[44px]">
            <input
              type="checkbox"
              checked={hasNotesOnly}
              onChange={(e) => onHasNotesOnlyChange(e.target.checked)}
              className="rounded border-gray-300 w-4 h-4"
            />
            Has my note only
          </label>
        )}
      </div>
      {children}
    </div>
  );
}
