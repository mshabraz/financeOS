import { Check, Clock, Ban } from 'lucide-react';
import clsx from 'clsx';
import { fmtCurrency, privText } from '../../utils/displayFormat';
import { STATUS_LABELS, STATUS_STYLES, OBLIGATION_KINDS } from './obligationConstants';

function kindLabel(id) {
  return OBLIGATION_KINDS.find((k) => k.id === id)?.label || id;
}

export default function ObligationCard({
  row,
  onMarkPaid,
  onSettle,
  onSnooze,
  onCancel,
  onEdit,
  compact = false,
}) {
  const fmt = (n) => fmtCurrency(n, row.currency || 'EUR');
  const isReceivable = row.direction === 'receivable';

  return (
    <article
      className={clsx(
        'rounded-xl border px-3 py-3 sm:px-4 transition-colors',
        row.status === 'overdue'
          ? 'border-red-500/30 bg-red-500/5'
          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/40',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={clsx(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
            isReceivable ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/15 text-amber-700',
          )}
          aria-hidden
        >
          {isReceivable ? 'IN' : 'OUT'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {privText(row.title)}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {row.counterparty ? privText(row.counterparty) : kindLabel(row.obligation_kind)}
                {row.due_date && (
                  <span className="tabular-nums"> · {row.due_date}</span>
                )}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">
                {fmt(row.amount_remaining ?? row.amount)}
              </p>
              {row.amount_paid > 0 && (
                <p className="text-[10px] text-gray-400 tabular-nums">
                  of {fmt(row.amount)} · paid {fmt(row.amount_paid)}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span
              className={clsx(
                'inline-flex text-[10px] font-medium px-2 py-0.5 rounded-full border',
                STATUS_STYLES[row.status] || STATUS_STYLES.upcoming,
              )}
            >
              {STATUS_LABELS[row.status] || row.status}
            </span>
            {row.is_series_template && (
              <span className="text-[10px] text-brand-600 dark:text-brand-400">Recurring</span>
            )}
          </div>
        </div>
      </div>

      {!compact && !['paid', 'settled', 'cancelled'].includes(row.status) && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          <button
            type="button"
            className="btn-primary text-xs py-1.5 gap-1"
            onClick={() => onMarkPaid?.(row)}
          >
            <Check size={14} />
            {isReceivable ? 'Mark received' : 'Mark paid'}
          </button>
          <button type="button" className="btn-secondary text-xs py-1.5" onClick={() => onSettle?.(row)}>
            Partial
          </button>
          <button type="button" className="btn-secondary text-xs py-1.5 gap-1" onClick={() => onSnooze?.(row)}>
            <Clock size={14} />
            Snooze
          </button>
          <button type="button" className="btn-secondary text-xs py-1.5" onClick={() => onEdit?.(row)}>
            Edit
          </button>
          <button
            type="button"
            className="text-xs text-gray-400 hover:text-red-500 ml-auto inline-flex items-center gap-1"
            onClick={() => onCancel?.(row)}
          >
            <Ban size={12} />
            Cancel
          </button>
        </div>
      )}
    </article>
  );
}
