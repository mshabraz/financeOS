import { Link } from 'react-router-dom';
import {
  Wallet, TrendingUp, TrendingDown, PiggyBank, Layers,
  ArrowUpRight, ArrowDownRight, Landmark,
} from 'lucide-react';
import clsx from 'clsx';
import { fmtEur, fmtPct, fmtCurrency } from '../../utils/displayFormat';
import MiniSparkline from './MiniSparkline';

function HeroKpi({
  label, value, sub, delta, spark, positive, icon: Icon, href,
}) {
  const inner = (
    <div className="rounded-xl bg-white/60 dark:bg-slate-800/40 hover:bg-white/80 dark:hover:bg-slate-800/60 backdrop-blur-sm border border-black/[0.06] dark:border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] p-3.5 sm:p-4 h-full flex flex-col gap-2 min-w-0 overflow-hidden transition-colors">
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 leading-tight">
            {label}
          </p>
          <p className="text-[1.0625rem] leading-snug sm:text-xl font-bold text-gray-900 dark:text-white tabular-nums mt-1 break-words [overflow-wrap:anywhere]">
            {value}
          </p>
          {sub && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 break-words leading-snug">
              {sub}
            </p>
          )}
          {delta != null && (
            <p
              className={clsx(
                'text-[11px] font-semibold mt-1 inline-flex flex-wrap items-center gap-0.5 leading-snug tabular-nums',
                delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
              )}
            >
              {delta >= 0 ? <ArrowUpRight size={11} className="shrink-0" /> : <ArrowDownRight size={11} className="shrink-0" />}
              <span className="break-words">{fmtPct(Math.abs(delta), { sign: false })} vs prior</span>
            </p>
          )}
        </div>
        {Icon && (
          <div className="p-1.5 sm:p-2 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 shrink-0 hidden sm:flex">
            <Icon size={15} className="sm:w-4 sm:h-4" />
          </div>
        )}
      </div>
      {spark?.length > 1 && (
        <div className="flex justify-end pt-0.5">
          <MiniSparkline data={spark} positive={positive} height={32} />
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link
        to={href}
        className="block min-w-0 hover:ring-1 hover:ring-brand-500/30 rounded-xl transition-shadow active:opacity-90"
      >
        {inner}
      </Link>
    );
  }
  return <div className="min-w-0">{inner}</div>;
}

/** Sole location for top-level financial KPIs (single source of truth). */
export default function DashboardHero({
  snapshot,
  netWorthConversion,
  portfolio,
  summary,
  trendSpark,
}) {
  if (!snapshot) return null;

  return (
    <section className="card overflow-hidden" aria-labelledby="dash-snapshot-title">
      <div className="px-4 sm:px-6 py-4 border-b border-black/[0.06] dark:border-white/[0.08] bg-gradient-to-r from-brand-500/8 via-transparent to-emerald-500/6">
        <p id="dash-snapshot-title" className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Financial snapshot
        </p>
        <div className="mt-1 min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Net worth</p>
          <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 dark:text-white tabular-nums break-words [overflow-wrap:anywhere] leading-tight">
            {fmtEur(snapshot.netWorth)}
          </p>
          {netWorthConversion?.enabled && netWorthConversion?.amount != null && (
            <p className="text-xs sm:text-sm text-gray-500 mt-1 tabular-nums break-words">
              ≈ {fmtCurrency(
                netWorthConversion.amount,
                netWorthConversion.currency,
                { decimals: netWorthConversion.currency === 'JPY' ? 0 : 2 },
              )}
              {netWorthConversion.stale
                ? ` · ${netWorthConversion.currency} est.`
                : netWorthConversion.fxDate
                  ? ` · ${netWorthConversion.currency} ${netWorthConversion.fxDate}`
                  : ''}
            </p>
          )}
        </div>
      </div>

      <div className="p-3 sm:p-5 grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <HeroKpi
          label="Total investments"
          value={fmtEur(snapshot.investmentsTotal)}
          sub={snapshot.contextLine('Portfolio', snapshot.investmentsPct)}
          spark={portfolio?.sparkline?.map((p) => p.value ?? p.totalPortfolio) ?? trendSpark}
          positive={(portfolio?.unrealizedPnLEur ?? 0) >= 0}
          icon={Layers}
          href="/investments"
        />
        <HeroKpi
          label="Total cash"
          value={fmtEur(snapshot.totalCash)}
          sub={snapshot.contextLine('Liquid', snapshot.cashPct)}
          positive
          icon={Landmark}
        />
        <HeroKpi
          label="Period spending"
          value={fmtEur(snapshot.periodSpending)}
          delta={snapshot.expenseDelta}
          positive={false}
          icon={TrendingDown}
          href="/analytics"
        />
        <HeroKpi
          label="Savings rate"
          value={snapshot.savingsRate != null ? fmtPct(snapshot.savingsRate) : '—'}
          sub={summary?.totalSavings > 0 ? `Transfers ${fmtEur(summary.totalSavings)}` : 'Income − spending'}
          positive={snapshot.savingsRate != null && snapshot.savingsRate >= 15}
          icon={PiggyBank}
          href="/analytics?focus=savings-rate"
        />
        <HeroKpi
          label="Cash flow"
          value={fmtEur(snapshot.netFlow, { sign: true })}
          sub="This period"
          positive={snapshot.netFlow >= 0}
          icon={Wallet}
        />
        <HeroKpi
          label="Unrealized P/L"
          value={snapshot.unrealizedPnLEur != null ? fmtEur(snapshot.unrealizedPnLEur, { sign: true }) : '—'}
          sub={snapshot.unrealizedPnLPct != null ? fmtPct(snapshot.unrealizedPnLPct, { sign: true }) : null}
          positive={(snapshot.unrealizedPnLEur ?? 0) >= 0}
          icon={(snapshot.unrealizedPnLEur ?? 0) >= 0 ? TrendingUp : TrendingDown}
          href="/investments?tab=holdings"
        />
      </div>
    </section>
  );
}
