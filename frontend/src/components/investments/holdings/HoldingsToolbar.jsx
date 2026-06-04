import { useState } from 'react';
import { Search, SlidersHorizontal, LayoutList, LayoutGrid, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import PriceSyncCompact from '../PriceSyncCompact';
import { HOLDINGS_COLUMNS } from './holdingsUtils';

export default function HoldingsToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  compact,
  onCompactChange,
  visibleColumns,
  onVisibleColumnsChange,
  syncStatus,
  syncing,
  onSync,
  onClearAutoLinks,
  clearingAuto,
  resultCount,
  totalCount,
}) {
  const [showCols, setShowCols] = useState(false);

  const toggleColumn = (id) => {
    const set = new Set(visibleColumns);
    if (set.has(id)) {
      if (set.size <= 4) return;
      set.delete(id);
    } else {
      set.add(id);
    }
    onVisibleColumnsChange([...set]);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search ticker, name, sector…"
            className="input pl-9 w-full text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input text-sm w-auto min-w-[140px]"
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
          >
            <option value="">All positions</option>
            <option value="priced">Priced only</option>
            <option value="needs_action">Needs action</option>
          </select>
          <button
            type="button"
            className={clsx('btn-secondary text-xs gap-1', compact && 'ring-1 ring-brand-500/40')}
            onClick={() => onCompactChange(!compact)}
            title="Compact rows"
          >
            {compact ? <LayoutGrid size={14} /> : <LayoutList size={14} />}
            {compact ? 'Compact' : 'Comfort'}
          </button>
          <div className="relative">
            <button
              type="button"
              className="btn-secondary text-xs gap-1"
              onClick={() => setShowCols((s) => !s)}
            >
              <SlidersHorizontal size={14} />
              Columns
              <ChevronDown size={12} className={clsx('transition', showCols && 'rotate-180')} />
            </button>
            {showCols && (
              <div className="absolute right-0 top-full mt-1 z-20 w-52 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-2 max-h-64 overflow-y-auto">
                {HOLDINGS_COLUMNS.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(c.id)}
                      onChange={() => toggleColumn(c.id)}
                      className="rounded"
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-gray-500">
        <span>
          Showing <span className="font-medium text-gray-700 dark:text-gray-300">{resultCount}</span>
          {resultCount !== totalCount && ` of ${totalCount}`} positions
        </span>
        <PriceSyncCompact
          syncStatus={syncStatus}
          syncing={syncing}
          onSync={onSync}
          onClearAutoLinks={onClearAutoLinks}
          clearingAuto={clearingAuto}
        />
      </div>
    </div>
  );
}
