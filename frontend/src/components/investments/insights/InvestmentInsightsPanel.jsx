import {
  Sparkles, AlertTriangle, ChevronRight, TrendingUp, TrendingDown,
  Shield, PieChart, Wallet,
} from 'lucide-react';
import clsx from 'clsx';
import { fmtEur, fmtPct } from '../../../utils/investmentFormat';
import { BROKER_LABELS } from '../constants';

const SEVERITY_STYLES = {
  warning: 'border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-900/20',
  error: 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/20',
  positive: 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-900/20',
  negative: 'border-red-200 bg-red-50/50',
  info: 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50',
};

function diversificationLevel(score) {
  if (score == null) return null;
  if (score >= 70) return 'good';
  if (score >= 45) return 'moderate';
  return 'low';
}

function DiversificationGauge({ diversification }) {
  const score = diversification?.score;
  const level = diversificationLevel(score);
  if (score == null) return null;

  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-3 bg-white/60 dark:bg-gray-800/40">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-gray-400 mb-2">
        <Shield size={12} className="text-brand-600" />
        Diversification
      </div>
      <div className="flex items-center gap-4">
        <div className="relative w-14 h-14 shrink-0">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" className="stroke-gray-200 dark:stroke-gray-700" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="15.5" fill="none"
              className={clsx(
                level === 'good' && 'stroke-emerald-500',
                level === 'moderate' && 'stroke-amber-500',
                level === 'low' && 'stroke-red-500',
              )}
              strokeWidth="3"
              strokeDasharray={`${score}, 100`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{score}</span>
        </div>
        <div className="text-xs text-gray-500 space-y-0.5">
          <p className="font-medium text-gray-700 dark:text-gray-300">
            {level === 'good' && 'Well diversified'}
            {level === 'moderate' && 'Moderate concentration'}
            {level === 'low' && 'High concentration'}
          </p>
          {diversification?.hhi != null && (
            <p>HHI {diversification.hhi.toFixed(3)} · lower is broader</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TopWeights({ allocations }) {
  const rows = allocations?.topHoldings?.slice(0, 5) ?? [];
  if (!rows.length) return null;
  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-gray-400 mb-2">
        <PieChart size={12} />
        Largest weights
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label || r.ticker || r.name} className="flex justify-between text-xs gap-2">
            <span className="font-medium truncate">{r.label || r.ticker || r.name}</span>
            <span className="tabular-nums text-gray-500 shrink-0">{fmtPct(r.pct ?? r.portfolioPct ?? r.weightPct)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PerformersBlock({ title, rows, positive }) {
  if (!rows?.length) return null;
  return (
    <div>
      <p className="text-[10px] uppercase text-gray-400 mb-1.5">{title}</p>
      <div className="space-y-1">
        {rows.slice(0, 5).map((p) => (
          <div key={`${p.broker || ''}-${p.ticker}`} className="flex justify-between gap-2 text-xs py-0.5">
            <div className="min-w-0">
              <span className="font-medium">{p.ticker}</span>
              {p.name && <span className="text-gray-400 ml-1 truncate hidden sm:inline">{p.name}</span>}
            </div>
            <div className="text-right shrink-0 tabular-nums">
              <span className={positive ? 'text-emerald-600' : 'text-red-600'}>
                {fmtPct(p.pct, { sign: true })}
              </span>
              {p.eur != null && (
                <span className="block text-[10px] text-gray-400">{fmtEur(p.eur, { sign: true })}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
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
  const hasContent = items.length || warnings.length || insights?.bestPerformers?.length;

  if (!hasContent && !diversification?.score) return null;

  return (
    <div className="card p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-brand-600" />
          <div>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Portfolio insights</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Concentration, data quality, and performance highlights
            </p>
          </div>
        </div>
        {hero?.pricedPositions != null && (
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <Wallet size={12} />
            {hero.pricedPositions}/{hero.openPositions} positions priced
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <DiversificationGauge diversification={diversification} />
        <TopWeights allocations={allocations} />
        {(insights?.bestPerformers?.length > 0 || insights?.worstPerformers?.length > 0) && (
          <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-3 sm:col-span-2 lg:col-span-1">
            <div className="grid grid-cols-2 gap-4">
              <PerformersBlock title="Best performers" rows={insights.bestPerformers} positive />
              <PerformersBlock title="Worst performers" rows={insights.worstPerformers} positive={false} />
            </div>
          </div>
        )}
      </div>

      {(warnings.length > 0 || items.length > 0) && (
        <div className="space-y-2">
          {warnings.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {warnings.map((w) => (
                <span
                  key={w.code + w.message}
                  className={clsx(
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
                    w.level === 'high' && 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
                    w.level === 'medium' && 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
                    w.level === 'low' && 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
                  )}
                >
                  <AlertTriangle size={10} />
                  {w.message}
                </span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {items.map((ins, i) => (
              <div
                key={i}
                className={clsx(
                  'rounded-lg px-3 py-2.5 text-xs border',
                  SEVERITY_STYLES[ins.severity] || SEVERITY_STYLES.info,
                )}
              >
                <p className="font-medium text-gray-800 dark:text-gray-200 flex items-start gap-1">
                  {ins.severity === 'positive' && <TrendingUp size={12} className="text-emerald-500 shrink-0 mt-0.5" />}
                  {ins.severity === 'negative' && <TrendingDown size={12} className="text-red-500 shrink-0 mt-0.5" />}
                  {ins.title}
                </p>
                {ins.detail && (
                  <p className="text-gray-500 dark:text-gray-400 mt-1 leading-snug">{ins.detail}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {actionItems.length > 0 && onOpenHoldings && (
        <button
          type="button"
          className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1"
          onClick={onOpenHoldings}
        >
          Resolve on Holdings tab <ChevronRight size={12} />
        </button>
      )}

      {hero?.brokerCashBreakdown?.length > 1 && (
        <p className="text-[11px] text-gray-500 border-t border-gray-100 dark:border-gray-800 pt-3">
          Cash by broker:{' '}
          {hero.brokerCashBreakdown
            .filter((r) => (r.amountEur ?? r.amount) > 0)
            .map((r) => `${BROKER_LABELS[r.broker] || r.label || r.broker} ${fmtEur(r.amountEur ?? r.amount)}`)
            .join(' · ')}
        </p>
      )}
    </div>
  );
}
