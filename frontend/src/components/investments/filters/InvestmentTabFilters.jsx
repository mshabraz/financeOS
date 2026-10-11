import { Search } from 'lucide-react';
import clsx from 'clsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/Select';
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
          <Select
            value={brokerFilter || 'all'}
            onValueChange={(val) => onBrokerChange(val === 'all' ? '' : val)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All brokers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All brokers</SelectItem>
              {brokerOptions.map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {showSource && onSourceTypeChange != null && (
          <Select
            value={sourceType || 'all'}
            onValueChange={(val) => onSourceTypeChange(val === 'all' ? '' : val)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="manual">Manual only</SelectItem>
              <SelectItem value="imported">Imported only</SelectItem>
            </SelectContent>
          </Select>
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
