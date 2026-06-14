import { Link } from 'react-router-dom';
import { Users, CreditCard, ChevronRight } from 'lucide-react';
import { fmtEur } from '../../utils/displayFormat';

export function DashboardRevolut({ assets, tagSummary, monthLabel }) {
  if (assets?.revolutClosingBalance == null && !tagSummary?.length) return null;

  const ratio = Math.round((assets?.revolutSplitRatio ?? 0.5) * 100);

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CreditCard size={16} className="text-purple-500" />
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Revolut</h2>
        </div>
        <Link to="/transactions?source=revolut" className="text-xs text-brand-600 hover:underline inline-flex items-center gap-0.5">
          Transactions <ChevronRight size={12} />
        </Link>
      </div>
      {assets?.revolutClosingBalance != null && (
        <div className="rounded-xl bg-purple-500/5 border border-purple-500/20 p-3 mb-3">
          <p className="text-xs text-gray-500">Balance</p>
          <p className="text-xl font-bold text-purple-600 dark:text-purple-400 tabular-nums">
            {fmtEur(assets.revolutClosingBalance)}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">
            {assets.revolutBalanceSource === 'open_banking' ? 'Live from bank' : 'From statement'}
            {assets.revolutBalanceDate ? ` · ${assets.revolutBalanceDate}` : ''}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            Joint expenses counted at {ratio}% in analytics
          </p>
        </div>
      )}
      {tagSummary?.length > 0 && (
        <>
          <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">Top tags · {monthLabel}</p>
          <ul className="space-y-1.5">
            {tagSummary.slice(0, 5).map((t) => (
              <li key={t.id ?? t.name} className="flex justify-between text-xs">
                <span className="truncate" style={{ color: t.color }}>{t.name}</span>
                <span className="tabular-nums font-medium shrink-0 ml-2">{fmtEur(t.totalSpending ?? t.total)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function DashboardShared({ events }) {
  const list = events ?? [];
  if (!list.length) return null;

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-sky-500" />
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Shared expenses</h2>
        </div>
        <Link to="/shared" className="text-xs text-brand-600 hover:underline inline-flex items-center gap-0.5">
          Open <ChevronRight size={12} />
        </Link>
      </div>
      <ul className="space-y-2">
        {list.slice(0, 4).map((e) => (
          <li key={e.id}>
            <Link
              to={`/shared/${e.id}`}
              className="flex justify-between gap-2 rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 text-sm"
            >
              <span className="font-medium truncate">{e.name}</span>
              <span className="text-xs text-gray-500 shrink-0 tabular-nums">
                {e.participant_count} people · {fmtEur(e.total_spend)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
