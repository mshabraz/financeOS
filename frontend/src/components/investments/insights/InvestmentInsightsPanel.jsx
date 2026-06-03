import {
  Sparkles, AlertTriangle, ChevronRight, TrendingUp, TrendingDown,
  Shield, PieChart, Wallet, Info,
} from 'lucide-react';
import clsx from 'clsx';
import { fmtEur, fmtPct } from '../../../utils/investmentFormat';
import { BROKER_LABELS } from '../constants';

const INSIGHT_ACCENT = {
  warning: {
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/5',
    icon: AlertTriangle,
    iconClass: 'text-amber-500',
  },
  error: {
    border: 'border-red-500/30',
    bg: 'bg-red-500/5',
    icon: AlertTriangle,
    iconClass: 'text-red-500',
  },
  positive: {
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/5',
    icon: TrendingUp,
    iconClass: 'text-emerald-500',
  },
  negative: {
    border: 'border-red-500/30',
    bg: 'bg-red-500/5',
    icon: TrendingDown,
    iconClass: 'text-red-500',
  },
  info: {
    border: 'border-gray-500/25',
    bg: 'bg-gray-500/5',
    icon: Info,
    iconClass: 'text-gray-400',
  },
};

const WARNING_PILL = {
  high: 'bg-red-500/15 text-red-200 border-red-500/25',
  medium: 'bg-amber-500/15 text-amber-100 border-amber-500/25',
  low: 'bg-sky-500/15 text-sky-100 border-sky-500/25',
};

function diversificationLevel(score) {
  if (score == null) return null;
  if (score >= 70) return 'good';
  if (score >= 45) return 'moderate';
  return 'low';
}

function shortLabel(label, max = 28) {
  if (!label) return '—';
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

function PanelShell({ title, icon: Icon, children, className }) {
  return (
    <section
      className={clsx(
        'rounded-2xl border border-gray-200/80 dark:border-gray-700/80',
        'bg-white/50 dark:bg-gray-900/40 p-4 min-w-0',
        className,
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon size={14} className="text-brand-500 shrink-0" />}
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

function DiversificationCard({ diversification }) {
  const score = diversification?.score;
  const level = diversificationLevel(score);
  if (score == null) return null;

  const levelLabel =
    level === 'good' ? 'Well diversified'
      : level === 'moderate' ? 'Moderate concentration'
        : 'High concentration';

  const ringClass =
    level === 'good' ? 'stroke-emerald-500'
      : level === 'moderate' ? 'stroke-amber-500'
        : 'stroke-red-500';

  return (
    <PanelShell title="Diversification" icon={Shield} className="h-full">
      <div className="flex items-center gap-5">
        <div className="relative w-[72px] h-[72px] shrink-0">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            <circle
              cx="18" cy="18" r="15.5" fill="none"
              className="stroke-gray-200 dark:stroke-gray-700"
              strokeWidth="2.5"
            />
            <circle
              cx="18" cy="18" r="15.5" fill="none"
              className={ringClass}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={`${score}, 100`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-gray-900 dark:text-white tabular-nums">
            {score}
          </span>
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{levelLabel}</p>
          {diversification?.hhi != null && (
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              HHI <span className="font-mono tabular-nums">{diversification.hhi.toFixed(3)}</span>
              <span className="text-gray-400"> · lower = broader spread</span>
            </p>
          )}
        </div>
      </div>
    </PanelShell>
  );
}

function TopWeightsCard({ allocations }) {
  const rows = allocations?.topHoldings?.slice(0, 5) ?? [];
  if (!rows.length) return null;
  const maxPct = Math.max(...rows.map((r) => r.pct ?? r.portfolioPct ?? r.weightPct ?? 0), 1);

  return (
    <PanelShell title="Largest weights" icon={PieChart} className="h-full">
      <ul className="space-y-2.5">
        {rows.map((r, i) => {
          const pct = r.pct ?? r.portfolioPct ?? r.weightPct ?? 0;
          const label = r.label || r.ticker || r.name;
          return (
            <li key={`${label}-${i}`} className="min-w-0">
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span
                  className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate"
                  title={label}
                >
                  {shortLabel(label, 32)}
                </span>
                <span className="text-xs font-semibold tabular-nums text-gray-600 dark:text-gray-300 shrink-0">
                  {fmtPct(pct)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand-500/80 dark:bg-brand-400/70 transition-all"
                  style={{ width: `${Math.min(100, (pct / maxPct) * 100)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </PanelShell>
  );
}

function PerformerRow({ rank, ticker, name, pct, eur, positive }) {
  return (
    <li className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 py-1.5 border-b border-gray-100 dark:border-gray-800/80 last:border-0">
      <span className="text-[10px] font-medium text-gray-400 tabular-nums">{rank}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{ticker}</p>
        {name && name !== ticker && (
          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate" title={name}>
            {shortLabel(name, 24)}
          </p>
        )}
      </div>
      <div className="text-right shrink-0">
        <p className={clsx(
          'text-xs font-semibold tabular-nums',
          positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
        )}>
          {fmtPct(pct, { sign: true })}
        </p>
        {eur != null && (
          <p className="text-[10px] tabular-nums text-gray-500 dark:text-gray-400">
            {fmtEur(eur, { sign: true })}
          </p>
        )}
      </div>
    </li>
  );
}

function PerformersCard({ best, worst }) {
  if (!best?.length && !worst?.length) return null;

  return (
    <PanelShell title="Unrealized movers" icon={TrendingUp} className="md:col-span-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600/90 dark:text-emerald-400 mb-2">
            Best
          </p>
          <ul>
            {(best ?? []).slice(0, 3).map((p, i) => (
              <PerformerRow
                key={`b-${p.ticker}-${i}`}
                rank={i + 1}
                ticker={p.ticker}
                name={p.name}
                pct={p.pct}
                eur={p.eur}
                positive
              />
            ))}
          </ul>
        </div>
        <div className="min-w-0 md:border-l md:border-gray-200/80 md:dark:border-gray-700/80 md:pl-8">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-red-600/90 dark:text-red-400 mb-2">
            Worst
          </p>
          <ul>
            {(worst ?? []).slice(0, 3).map((p, i) => (
              <PerformerRow
                key={`w-${p.ticker}-${i}`}
                rank={i + 1}
                ticker={p.ticker}
                name={p.name}
                pct={p.pct}
                eur={p.eur}
                positive={false}
              />
            ))}
          </ul>
        </div>
      </div>
    </PanelShell>
  );
}

function InsightTile({ insight }) {
  const accent = INSIGHT_ACCENT[insight.severity] || INSIGHT_ACCENT.info;
  const Icon = accent.icon;

  return (
    <article
      className={clsx(
        'rounded-xl border p-3 min-w-0',
        accent.border,
        accent.bg,
      )}
    >
      <div className="flex gap-2">
        <Icon size={14} className={clsx('shrink-0 mt-0.5', accent.iconClass)} />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 leading-snug">
            {insight.title}
          </p>
          {insight.detail && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
              {insight.detail}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

export default function InvestmentInsightsPanel({
  insights,
  diversification,
  allocations,
  hero,
  onOpenHoldings,
}) {
  const items = insights?.items ?? [];
  const warnings = diversification?.warnings ?? [];
  const actionItems = items.filter((i) => i.type === 'action');
  const hasMetrics = diversification?.score != null
    || (allocations?.topHoldings?.length ?? 0) > 0
    || (insights?.bestPerformers?.length ?? 0) > 0;

  if (!hasMetrics && !items.length && !warnings.length) return null;

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-brand-500/5 via-transparent to-transparent">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
              <Sparkles size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Portfolio insights</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Concentration, data quality, and performance highlights
              </p>
            </div>
          </div>
          {hero?.pricedPositions != null && (
            <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/80 px-3 py-1 text-xs text-gray-600 dark:text-gray-300 shrink-0">
              <Wallet size={12} className="text-brand-500" />
              <span className="tabular-nums font-medium">
                {hero.pricedPositions}/{hero.openPositions}
              </span>
              <span className="text-gray-400">priced</span>
            </span>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {/* Concentration warnings */}
        {warnings.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {warnings.map((w) => (
              <span
                key={w.code + w.message}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
                  WARNING_PILL[w.level] || WARNING_PILL.low,
                )}
              >
                <AlertTriangle size={11} className="shrink-0 opacity-80" />
                {w.message}
              </span>
            ))}
          </div>
        )}

        {/* Metrics grid — performers span 2 cols on large screens to avoid squeeze */}
        {hasMetrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DiversificationCard diversification={diversification} />
            <TopWeightsCard allocations={allocations} />
            <PerformersCard best={insights?.bestPerformers} worst={insights?.worstPerformers} />
          </div>
        )}

        {/* Narrative insight tiles — uniform auto-fit grid */}
        {items.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {items.map((ins, i) => (
              <InsightTile key={`${ins.title}-${i}`} insight={ins} />
            ))}
          </div>
        )}

        {actionItems.length > 0 && onOpenHoldings && (
          <div className="pt-1">
            <button
              type="button"
              className="btn-secondary text-xs gap-1"
              onClick={onOpenHoldings}
            >
              Resolve on Holdings
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {hero?.brokerCashBreakdown?.length > 1 && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-800">
            Cash by broker:{' '}
            {hero.brokerCashBreakdown
              .filter((r) => (r.amountEur ?? r.amount) > 0)
              .map((r) => `${BROKER_LABELS[r.broker] || r.label || r.broker} ${fmtEur(r.amountEur ?? r.amount)}`)
              .join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
}
