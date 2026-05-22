import { useState } from 'react';
import clsx from 'clsx';
import { ExternalLink, Layers } from 'lucide-react';
import { fmtEur } from '../../utils/investmentFormat';
import { CHART_COLORS } from './constants';

function BreakdownList({ rows, valueKey = 'pct' }) {
  if (!rows?.length) return <p className="text-xs text-gray-400">No data</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((row, i) => (
        <li key={`${row.label}-${i}`} className="flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-2 min-w-0 truncate text-gray-700 dark:text-gray-200">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span className="truncate">{row.label || row.name}</span>
          </span>
          <span className="tabular-nums font-medium text-gray-600 dark:text-gray-400 shrink-0">
            {Number(row[valueKey]).toFixed(2)}%
          </span>
        </li>
      ))}
    </ul>
  );
}

function FundCard({ fund }) {
  const [tab, setTab] = useState('countries');
  const tabs = [
    { id: 'countries', label: 'Countries' },
    { id: 'sectors', label: 'Sectors' },
    { id: 'holdings', label: 'Top holdings' },
  ];

  const holdingRows = (fund.holdings || []).map((h) => ({
    label: h.name || h.symbol,
    pct: h.pct,
  }));

  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {fund.ticker}
            {fund.portfolioPct != null && (
              <span className="ml-2 text-gray-400 font-normal tabular-nums">
                {fund.portfolioPct.toFixed(1)}% of portfolio
              </span>
            )}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{fund.fundName}</p>
          <p className="text-xs text-brand-600 dark:text-brand-400 mt-0.5">
            Benchmark: {fund.benchmark}
            {fund.ter != null && ` · TER ${fund.ter}%`}
          </p>
        </div>
        {fund.marketValueEur != null && (
          <p className="text-sm font-medium tabular-nums shrink-0">{fmtEur(fund.marketValueEur)}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={clsx(
              'px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors',
              tab === t.id
                ? 'bg-brand-600 text-white'
                : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-[120px]">
        {tab === 'countries' && <BreakdownList rows={fund.countries} />}
        {tab === 'sectors' && <BreakdownList rows={fund.sectors} />}
        {tab === 'holdings' && <BreakdownList rows={holdingRows} />}
      </div>

      <p className="text-[10px] text-gray-400 leading-snug">
        {fund.dataSource === 'benchmark_profile' ? 'Benchmark profile' : 'Fund data'}
        {fund.asOf && ` · as of ${fund.asOf}`}
        {fund.source && ` · ${fund.source}`}
        {fund.holdingsCount && ` · ${fund.holdingsCount.toLocaleString()} holdings`}
        {fund.sourceUrl && (
          <>
            {' · '}
            <a
              href={fund.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:underline inline-flex items-center gap-0.5"
            >
              Source <ExternalLink size={10} />
            </a>
          </>
        )}
      </p>
    </div>
  );
}

export default function FundBenchmarkSection({ fundProfiles }) {
  if (!fundProfiles?.length) {
    return (
      <div className="card p-5 text-sm text-gray-400">
        <p className="font-medium text-gray-600 dark:text-gray-300 mb-1">Fund breakdown</p>
        <p>No ETF or fund holdings with breakdown data in this view. Commodity ETCs appear under Portfolio breakdown → Commodities.</p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Layers size={16} className="text-brand-600" />
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Fund breakdown
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Per-fund countries, sectors, and top holdings (benchmark profiles and Yahoo look-through). Shown for every ETF and fund in your portfolio.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {fundProfiles.map((fund) => (
          <FundCard key={`${fund.broker}-${fund.ticker}-${fund.profileId}`} fund={fund} />
        ))}
      </div>
    </div>
  );
}
