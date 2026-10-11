import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { fmt } from '../investmentPageFmt';
import { HoldingsTable } from './index';

export default function ClosedPositionsSection({ data }) {
  const [open, setOpen] = useState(false);
  if (!data?.length) return null;

  const totalPnL = data.reduce((s, h) => s + (h.realizedPnL || 0), 0);

  return (
    <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/70 dark:bg-slate-900/60 backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors text-left"
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
        <div className="border-t border-black/[0.06] dark:border-white/[0.08]">
          <HoldingsTable data={data} open={false} />
        </div>
      )}
    </section>
  );
}
