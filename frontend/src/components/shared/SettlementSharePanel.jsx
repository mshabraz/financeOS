import { useRef } from 'react';
import { Download, Share2 } from 'lucide-react';
import { downloadSettlementShareImage } from '../../utils/settlementShareImage';

const fmt = (n, currency = 'EUR') =>
  new Intl.NumberFormat('et-EE', { style: 'currency', currency }).format(n ?? 0);

/**
 * Settlement tab: preview card + download PNG for group chats.
 */
export default function SettlementSharePanel({
  eventName,
  currency,
  totalSpend,
  transfers,
  pendingCount,
}) {
  const previewRef = useRef(null);
  const pending = (transfers ?? []).filter((t) => !t.settled);
  const shareRows = pending.length ? pending : transfers ?? [];

  const handleDownload = () => {
    downloadSettlementShareImage({
      eventName,
      currency,
      totalSpend,
      transfers: shareRows,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {pendingCount > 0
            ? `${pendingCount} payment${pendingCount === 1 ? '' : 's'} still owed — share this image in your group chat.`
            : 'All payments marked settled. You can still download a summary.'}
        </p>
        <button type="button" className="btn-primary shrink-0" onClick={handleDownload}>
          <Download size={16} />
          Download image
        </button>
      </div>

      <div
        ref={previewRef}
        className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-lg max-w-md mx-auto sm:mx-0"
        style={{
          background: 'linear-gradient(145deg, #0f172a 0%, #1e3a5f 100%)',
          padding: '12px',
        }}
      >
        <div className="bg-white dark:bg-gray-900 rounded-xl p-5 space-y-4">
          <div>
            <p className="text-teal-700 dark:text-teal-400 text-sm font-semibold flex items-center gap-1">
              <Share2 size={14} />
              Settlement
            </p>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mt-1 leading-tight">
              {eventName}
            </h3>
            {totalSpend != null && (
              <p className="text-sm text-gray-500 mt-1">Total: {fmt(totalSpend, currency)}</p>
            )}
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-2 max-h-80 overflow-y-auto">
            {shareRows.length === 0 ? (
              <p className="text-green-600 dark:text-green-400 text-sm font-medium">
                Everyone is settled up!
              </p>
            ) : (
              shareRows.map((t, index) => (
                <div
                  key={`share-${index}-${t.fromId ?? t.from_id}-${t.toId ?? t.to_id}`}
                  className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm ${
                    t.settled
                      ? 'bg-green-50 dark:bg-green-900/20'
                      : 'bg-orange-50 dark:bg-orange-900/20'
                  }`}
                >
                  <span className="font-medium text-gray-900 dark:text-white min-w-0 truncate">
                    <span className="font-semibold">{t.fromName}</span>
                    <span className="text-gray-400 mx-1">→</span>
                    <span className="font-semibold">{t.toName}</span>
                  </span>
                  <span className="font-bold text-teal-700 dark:text-teal-400 shrink-0">
                    {fmt(t.amount, currency)}
                  </span>
                </div>
              ))
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
