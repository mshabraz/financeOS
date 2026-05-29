import clsx from 'clsx';
import { fmtCurrency } from '../../utils/displayFormat';
import { usePrivacy } from '../../context/PrivacyContext';

const fmt = (n) => fmtCurrency(n, 'EUR', { abs: true });

export default function TransactionSourceBadges({ tx, className }) {
  usePrivacy();
  const isRevolut = tx.source === 'revolut';
  const shared = !!tx.applies_shared_split;
  const excluded = !!tx.exclude_from_analytics;
  const showAdjusted =
    isRevolut &&
    !excluded &&
    tx.effective_amount != null &&
    Math.abs((tx.amount ?? 0) - (tx.effective_amount ?? 0)) > 0.001;

  return (
    <div className={clsx('flex flex-wrap gap-1 items-center', className)}>
      {isRevolut && (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300 bg-purple-500/15 px-1.5 py-0.5 rounded">
          Revolut
        </span>
      )}
      {excluded && (
        <span
          className="text-[10px] font-medium text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded"
          title="Wallet top-up / funding — not counted in spending totals"
        >
          Funding
        </span>
      )}
      {shared && !excluded && (
        <span
          className="text-[10px] font-medium text-amber-700 dark:text-amber-300 bg-amber-500/15 px-1.5 py-0.5 rounded"
          title={`Shared expense: ${Math.round((tx.split_ratio ?? 0.5) * 100)}% counted in analytics`}
        >
          {Math.round((tx.split_ratio ?? 0.5) * 100)}% share
        </span>
      )}
      {showAdjusted && (
        <span className="text-[10px] text-gray-500 dark:text-gray-400" title="Amount used in charts and totals">
          Analytics: {fmt(tx.effective_amount)}
        </span>
      )}
    </div>
  );
}

export function TransactionAmountDetail({ tx }) {
  usePrivacy();
  if (tx.source !== 'revolut' && tx.amount === tx.effective_amount) return null;

  return (
    <div className="rounded-lg border border-purple-200/60 dark:border-purple-900/40 bg-purple-50/50 dark:bg-purple-950/20 p-3 text-xs space-y-1">
      <p className="font-medium text-purple-900 dark:text-purple-200">Amount breakdown</p>
      <div className="flex justify-between gap-4">
        <span className="text-gray-500">Original (statement)</span>
        <span className="font-medium text-gray-800 dark:text-gray-200">{fmt(tx.amount)}</span>
      </div>
      {tx.exclude_from_analytics ? (
        <p className="text-gray-500 italic">Excluded from dashboards and spending totals (wallet funding).</p>
      ) : (
        <>
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">Used in analytics</span>
            <span className="font-semibold text-gray-900 dark:text-white">{fmt(tx.effective_amount ?? tx.amount)}</span>
          </div>
          {tx.applies_shared_split && tx.split_ratio != null && (
            <p className="text-gray-500">
              Shared household split: {Math.round(tx.split_ratio * 100)}% of expenses (
              {Math.round((1 - tx.split_ratio) * 100)}% partner share not counted).
            </p>
          )}
        </>
      )}
    </div>
  );
}
