import { Link } from 'react-router-dom';
import { ChevronRight, Bell, AlertCircle, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { fmtEur } from '../../utils/displayFormat';

export default function DashboardObligations({ summary, upcoming = [], reminders = [] }) {
  if (!summary && !upcoming?.length && !reminders?.length) return null;

  const s = summary ?? {};
  const hasOverdue = (s.counts?.overdue ?? 0) > 0;

  return (
    <section className="card p-4 sm:p-5" aria-labelledby="due-owed-dash-title">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <h2 id="due-owed-dash-title" className="text-sm font-semibold text-gray-900 dark:text-white">
            Due & Owed
          </h2>
          <p className="text-xs text-gray-500">Next 7 days & balances</p>
        </div>
        <Link to="/due" className="text-xs text-brand-600 hover:underline inline-flex items-center gap-0.5">
          Open <ChevronRight size={12} />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-2.5">
          <p className="text-[10px] text-gray-400 flex items-center gap-1"><Bell size={10} /> Due 7d</p>
          <p className="text-sm font-bold tabular-nums">{fmtEur(s.totals?.dueWeekEur ?? 0)}</p>
        </div>
        <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-2.5">
          <p className="text-[10px] text-gray-400 flex items-center gap-1"><ArrowUpRight size={10} className="text-emerald-500" /> To collect</p>
          <p className="text-sm font-bold tabular-nums text-emerald-600">{fmtEur(s.totals?.owedToMeEur ?? 0)}</p>
        </div>
        <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 p-2.5">
          <p className="text-[10px] text-gray-400 flex items-center gap-1"><ArrowDownLeft size={10} className="text-amber-600" /> I owe</p>
          <p className="text-sm font-bold tabular-nums text-amber-700">{fmtEur(s.totals?.iOweEur ?? 0)}</p>
        </div>
        <div className={`rounded-lg p-2.5 ${hasOverdue ? 'bg-red-500/5 border border-red-500/20' : 'bg-gray-50 dark:bg-gray-800/50'}`}>
          <p className="text-[10px] text-gray-400 flex items-center gap-1"><AlertCircle size={10} /> Overdue</p>
          <p className="text-sm font-bold tabular-nums">{s.counts?.overdue ?? 0}</p>
        </div>
      </div>

      {reminders.length > 0 && (
        <div className="mb-3 rounded-lg border border-brand-500/20 bg-brand-500/5 px-3 py-2">
          <p className="text-xs font-medium text-brand-700 dark:text-brand-300">
            {reminders.length} reminder{reminders.length > 1 ? 's' : ''} today
          </p>
        </div>
      )}

      {upcoming.length > 0 && (
        <ul className="space-y-1.5">
          {upcoming.slice(0, 4).map((r) => (
            <li key={r.id}>
              <Link
                to="/due"
                className="flex justify-between gap-2 rounded-lg border border-gray-100 dark:border-gray-800 px-2.5 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <span className="font-medium truncate">{r.title}</span>
                <span className="tabular-nums text-gray-500 shrink-0">
                  {r.due_date} · {fmtEur(r.amount_remaining ?? r.amount)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
