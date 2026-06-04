import { Link } from 'react-router-dom';
import {
  Wallet, TrendingUp, TrendingDown, PiggyBank, Layers, Target, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import clsx from 'clsx';
import { fmtEur, fmtPct, fmtPkr } from '../../utils/displayFormat';
import MiniSparkline from './MiniSparkline';

function HeroKpi({
  label, value, sub, delta, spark, positive, icon: Icon, href,
}) {
  const inner = (
    <div className="rounded-2xl border border-gray-200/80 dark:border-gray-700/80 bg-white/50 dark:bg-gray-900/40 p-3.5 sm:p-4 h-full flex flex-col gap-2 min-w-0 overflow-hidden">
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 leading-tight">
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
                'text-[11px] font-medium mt-1 inline-flex flex-wrap items-center gap-0.5 leading-snug',
                delta >= 0 ? 'text-emerald-600' : 'text-red-600',
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
        className="block min-w-0 hover:ring-1 hover:ring-brand-500/30 rounded-2xl transition-shadow active:opacity-90"
      >
        {inner}
      </Link>
    );
  }
  return <div className="min-w-0">{inner}</div>;
}

export default function DashboardHero({
  totalAssets,
  totalAssetsPkr,
  fxNote,
  bankBalance,
  cashTotal,
  investmentsTotal,
  portfolio,
  summary,
  prevSummary,
  savingsRate,
  goalSnapshot,
  trendSpark,
}) {
  const expenseDelta = summary && prevSummary?.totalExpenses != null
    ? ((summary.totalExpenses - prevSummary.totalExpenses) / Math.abs(prevSummary.totalExpenses || 1)) * 100
    : null;

  const incomeDelta = summary && prevSummary?.totalIncome != null
    ? ((summary.totalIncome - prevSummary.totalIncome) / Math.abs(prevSummary.totalIncome || 1)) * 100
    : null;

  const netFlow = (summary?.totalIncome ?? 0) - (summary?.totalExpenses ?? 0);

  return (
    <section className="card overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-brand-500/8 via-transparent to-emerald-500/5">
        <div className="flex flex-col gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Net worth</p>
            <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 dark:text-white tabular-nums mt-0.5 break-words [overflow-wrap:anywhere] leading-tight">
              {fmtEur(totalAssets)}
            </p>
            {totalAssetsPkr > 0 && (
              <p className="text-xs sm:text-sm text-gray-500 mt-1 tabular-nums break-words">
                ≈ {fmtPkr(totalAssetsPkr)}{fxNote ? ` · ${fxNote}` : ''}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1 text-gray-600 dark:text-gray-300 tabular-nums">
              Bank {fmtEur(bankBalance)}
            </span>
            {cashTotal > 0 && (
              <span className="rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1 text-gray-600 dark:text-gray-300 tabular-nums">
                Inv. cash {fmtEur(cashTotal)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="p-3 sm:p-5 grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <HeroKpi
          label="Investments"
          value={fmtEur(investmentsTotal)}
          sub={portfolio ? `${portfolio.pricedPositions ?? 0}/${portfolio.openPositions ?? 0} priced` : null}
          spark={portfolio?.sparkline?.map((p) => p.value ?? p.totalPortfolio) ?? trendSpark}
          positive={(portfolio?.unrealizedPnLEur ?? 0) >= 0}
          icon={Layers}
          href="/investments"
        />
        <HeroKpi
          label="Unrealized P/L"
          value={portfolio?.unrealizedPnLEur != null ? fmtEur(portfolio.unrealizedPnLEur, { sign: true }) : '—'}
          sub={portfolio?.unrealizedPnLPct != null ? fmtPct(portfolio.unrealizedPnLPct, { sign: true }) : null}
          positive={(portfolio?.unrealizedPnLEur ?? 0) >= 0}
          icon={(portfolio?.unrealizedPnLEur ?? 0) >= 0 ? TrendingUp : TrendingDown}
          href="/investments?tab=holdings"
        />
        <HeroKpi
          label="Period spending"
          value={fmtEur(summary?.totalExpenses)}
          delta={expenseDelta}
          positive={false}
          icon={TrendingDown}
          href="/analytics"
        />
        <HeroKpi
          label="Period income"
          value={fmtEur(summary?.totalIncome)}
          delta={incomeDelta}
          positive
          icon={TrendingUp}
        />
        <HeroKpi
          label="Cash flow"
          value={fmtEur(netFlow, { sign: true })}
          sub="Income − spending"
          positive={netFlow >= 0}
          icon={Wallet}
        />
        <HeroKpi
          label="Savings rate"
          value={savingsRate != null ? fmtPct(savingsRate) : '—'}
          sub={summary?.totalSavings > 0 ? `Transfers ${fmtEur(summary.totalSavings)}` : null}
          positive={savingsRate >= 15}
          icon={PiggyBank}
          href="/analytics?focus=savings-rate"
        />
        {goalSnapshot && (
          <HeroKpi
            label="Goal progress"
            value={goalSnapshot.pct != null ? fmtPct(goalSnapshot.pct) : '—'}
            sub={goalSnapshot.name}
            href="/investments?tab=planner"
            icon={Target}
          />
        )}
      </div>
    </section>
  );
}
