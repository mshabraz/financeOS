import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DollarSign, ArrowRightLeft } from 'lucide-react';
import StatCard from '../../ui/StatCard';
import InvestmentTabFilters from '../filters/InvestmentTabFilters';
import { DividendTickerCards } from '../holdings/HoldingsCardGrid';
import { BROKER_COLORS, BROKER_LABELS } from '../constants';
import { fmt } from '../investmentPageFmt';

export default function DividendsTab({ dividends, brokerFilter: chromeBroker }) {
  const [search, setSearch] = useState('');
  const [localBroker, setLocalBroker] = useState('');
  const effectiveBroker = chromeBroker || localBroker;

  const filtered = useMemo(() => {
    let rows = dividends?.byTicker ?? [];
    if (effectiveBroker) rows = rows.filter((r) => r.broker === effectiveBroker);
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.ticker?.toLowerCase().includes(q));
    return rows;
  }, [dividends?.byTicker, effectiveBroker, search]);

  const filteredPayments = useMemo(() => {
    let rows = dividends?.dividends ?? [];
    if (effectiveBroker) rows = rows.filter((r) => r.broker === effectiveBroker);
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.ticker?.toLowerCase().includes(q));
    return rows;
  }, [dividends?.dividends, effectiveBroker, search]);

  const totalNet = filtered.reduce((s, r) => s + (r.totalNet || 0), 0);
  const totalTax = filtered.reduce((s, r) => s + (r.totalTax || 0), 0);

  return (
    <div className="space-y-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-5 shadow-sm">
      <InvestmentTabFilters
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search ticker…"
        brokerFilter={chromeBroker || localBroker}
        onBrokerChange={chromeBroker ? undefined : setLocalBroker}
        showBroker={!chromeBroker}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Dividends"
          value={fmt(filteredPayments.reduce((s, d) => s + d.net_amount, 0))}
          icon={<DollarSign size={18} />}
          color="green"
        />
        <StatCard
          label="Total Tax"
          value={fmt(filteredPayments.reduce((s, d) => s + d.tax_amount, 0))}
          icon={<DollarSign size={18} />}
          color="red"
        />
        <StatCard
          label="Payments"
          value={filteredPayments.length}
          icon={<ArrowRightLeft size={18} />}
          color="blue"
        />
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">By Ticker</h2>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-gray-400">
              Total earned: <span className="font-semibold text-green-600">{fmt(totalNet)}</span>
            </span>
            <span className="text-gray-400">
              Total tax: <span className="font-semibold text-red-500">{fmt(totalTax)}</span>
            </span>
          </div>
        </div>
        <DividendTickerCards rows={filtered} />
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                {['Broker', 'Ticker', 'CCY', 'Payments', 'Net Total', 'Tax', 'First', 'Last'].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-2.5">
                    <span
                      className="text-xs px-1.5 py-0.5 rounded font-medium text-white"
                      style={{ background: BROKER_COLORS[r.broker] || '#94a3b8' }}
                    >
                      {BROKER_LABELS[r.broker] || r.broker}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono font-bold text-brand-600 dark:text-brand-400">{r.ticker}</td>
                  <td className="px-4 py-2.5 text-gray-400">{r.currency}</td>
                  <td className="px-4 py-2.5">{r.payments}</td>
                  <td className="px-4 py-2.5 text-green-600 font-medium">{fmt(r.totalNet, r.currency)}</td>
                  <td className="px-4 py-2.5 text-red-500">{r.totalTax > 0 ? fmt(r.totalTax, r.currency) : '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{r.firstDate}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{r.lastDate}</td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">No dividends match filters</td>
                </tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <td className="px-4 py-2.5 text-xs font-semibold text-gray-500" colSpan={3}>TOTAL</td>
                  <td className="px-4 py-2.5 font-semibold text-gray-700 dark:text-gray-200">
                    {filtered.reduce((s, r) => s + (r.payments || 0), 0)} payments
                  </td>
                  <td className="px-4 py-2.5 font-bold text-green-600 text-base">{fmt(totalNet)}</td>
                  <td className="px-4 py-2.5 font-semibold text-red-500">{fmt(totalTax)}</td>
                  <td className="px-4 py-2.5" colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Annual Dividends</h2>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dividends?.byYear?.slice().reverse()}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `€${v}`} />
            <Tooltip formatter={(v) => fmt(v)} />
            <Bar dataKey="totalNet" name="Net Dividends" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
