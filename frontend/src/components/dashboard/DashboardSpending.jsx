import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { ChevronRight } from 'lucide-react';
import LoadingSpinner from '../ui/LoadingSpinner';
import { fmtEur } from '../../utils/displayFormat';

export default function DashboardSpending({
  periodLabel,
  trendData,
  trendLoading,
  categories,
  categoriesLoading,
  recurring,
}) {
  const topCats = (categories ?? []).slice(0, 8);
  const maxCat = Math.max(...topCats.map((c) => c.total), 1);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2 px-1">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Spending</h2>
          <p className="text-xs text-gray-500">{periodLabel}</p>
        </div>
        <Link to="/analytics" className="text-xs text-brand-600 hover:underline inline-flex items-center gap-0.5">
          Full analytics <ChevronRight size={12} />
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4 sm:p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Income vs expenses
          </h3>
          {trendLoading ? (
            <LoadingSpinner />
          ) : (
            <div className="h-52 sm:h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} barGap={2} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `€${v}`} width={48} />
                  <Tooltip formatter={(v) => fmtEur(v)} />
                  <Bar dataKey="income" name="Income" fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#f43f5e" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card p-4 sm:p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Top categories
          </h3>
          {categoriesLoading ? (
            <LoadingSpinner />
          ) : !topCats.length ? (
            <p className="text-sm text-gray-400 py-8 text-center">No spending this period</p>
          ) : (
            <ul className="space-y-2.5">
              {topCats.map((c) => (
                <li key={c.id ?? c.name}>
                  <div className="flex justify-between text-xs mb-1 gap-2">
                    <span className="font-medium text-gray-700 dark:text-gray-200 truncate">
                      {c.icon} {c.name}
                    </span>
                    <span className="tabular-nums text-gray-500 shrink-0">{fmtEur(c.total)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(c.total / maxCat) * 100}%`,
                        background: c.color || '#6366f1',
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {recurring?.length > 0 && (
        <div className="card p-4 max-w-md">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Recurring merchants
          </h3>
          <ul className="space-y-1.5">
            {recurring.slice(0, 5).map((r) => (
              <li key={r.merchant} className="flex justify-between text-xs">
                <span className="truncate text-gray-700 dark:text-gray-300">{r.merchant}</span>
                <span className="tabular-nums text-gray-500 shrink-0 ml-2">~{fmtEur(r.avgAmount)}/mo</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
