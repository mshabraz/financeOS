import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { fmt } from '../investmentPageFmt';
import { HoldingsTable } from './index';

export default function ClosedPositionsSection({ data }) {
  const [open, setOpen] = useState(false);
  if (!data?.length) return null;

  const totalPnL = data.reduce((s, h) => s + (h.realizedPnL || 0), 0);

  return (
    <section className="rounded-2xl border border-gray-200/80 dark:border-gray-700/80 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-50/80 dark:bg-gray-800/40 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Closed positions</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {data.length} position{data.length === 1 ? '' : 's'} · Realized {totalPnL >= 0 ? '+' : ''}{fmt(totalPnL)}
          </p>
        </div>
        {open ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 dark:border-gray-800">
          <HoldingsTable data={data} open={false} />
        </div>
      )}
    </section>
  );
}
