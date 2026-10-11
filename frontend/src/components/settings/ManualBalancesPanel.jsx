import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet, Check, X, Pencil } from 'lucide-react';
import { getManualBalances, updateManualBalance } from '../../api/client';
import { invalidateAssets } from '../../lib/queryKeys';
import LoadingSpinner from '../ui/LoadingSpinner';
import InlineAmountEditor from '../ui/InlineAmountEditor';
import { fmtEur } from '../../utils/displayFormat';

const EDITABLE_KEYS = ['pension', 'paypal'];

function BalanceRow({ row, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');

  const startEdit = () => {
    setVal(String(row.amount ?? 0));
    setEditing(true);
  };
  const cancel = () => setEditing(false);
  const save = () => {
    onSave(parseFloat(val) || 0);
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-xl">{row.icon}</span>
        <div>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{row.label}</p>
          <p className="text-[10px] text-gray-400">Manual balance · included in net worth</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {editing ? (
          <InlineAmountEditor
            value={val}
            currency="€"
            onSave={(newVal) => {
              onSave(parseFloat(newVal) || 0);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <span className="text-base font-semibold tabular-nums">{fmtEur(row.amount)}</span>
            <button
              type="button"
              onClick={startEdit}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Edit balance"
              aria-label="Edit balance"
            >
              <Pencil size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function ManualBalancesPanel({ showToast }) {
  const qc = useQueryClient();
  const manualsQ = useQuery({
    queryKey: ['manualBalances'],
    queryFn: getManualBalances,
  });

  const updateMut = useMutation({
    mutationFn: ({ key, amount }) => updateManualBalance(key, amount),
    onSuccess: () => {
      invalidateAssets(qc);
      showToast('Balance updated', 'success');
    },
    onError: (e) => showToast(e.message, 'error'),
  });

  const rows = (manualsQ.data ?? []).filter((r) => EDITABLE_KEYS.includes(r.key));
  const ordered = EDITABLE_KEYS.map((key) => rows.find((r) => r.key === key)).filter(Boolean);

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <Wallet size={20} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Manual asset balances</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Bank, Revolut, and investments sync automatically. Update pension and PayPal here — amounts feed into
            dashboard net worth.
          </p>
          <div className="mt-4">
            {manualsQ.isLoading ? (
              <LoadingSpinner />
            ) : manualsQ.isError ? (
              <p className="text-sm text-red-600">{manualsQ.error.message}</p>
            ) : (
              ordered.map((row) => (
                <BalanceRow
                  key={row.key}
                  row={row}
                  onSave={(amount) => updateMut.mutate({ key: row.key, amount })}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
