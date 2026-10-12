import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet, Plus, Check, X, Pencil, Trash2 } from 'lucide-react';
import { getManualBalances, updateManualBalance, addManualBalance, deleteManualBalance } from '../../api/client';
import { invalidateAssets } from '../../lib/queryKeys';
import LoadingSpinner from '../ui/LoadingSpinner';
import InlineAmountEditor from '../ui/InlineAmountEditor';
import ConfirmDialog from '../ui/ConfirmDialog';
import { fmtEur, privText } from '../../utils/displayFormat';
import { usePrivacy } from '../../context/PrivacyContext';

const BUILT_IN = new Set(['pension', 'investments', 'investment_cash', 'paypal']);

function AssetRow({ row, onSave, onDelete, isBuiltIn }) {
  usePrivacy();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const [label, setLabel] = useState('');

  const startEdit = () => {
    setVal(String(row.amount ?? 0));
    setLabel(row.label || '');
    setEditing(true);
  };

  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-black/[0.04] dark:border-white/[0.05] last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-xl shrink-0">{row.icon || '💵'}</span>
        <div className="min-w-0">
          {editing && !isBuiltIn ? (
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="input py-1 text-sm w-full max-w-[180px]"
              placeholder="Asset name"
            />
          ) : (
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
              {privText(row.label)}
            </p>
          )}
          <p className="text-[10px] text-gray-400">
            {isBuiltIn ? 'Built-in asset · feeds into net worth' : 'Custom asset · feeds into net worth'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {editing ? (
          <InlineAmountEditor
            value={val}
            currency="€"
            onSave={(newVal) => {
              const parsed = parseFloat(newVal);
              if (!isNaN(parsed)) {
                onSave({
                  amount: parsed,
                  label: isBuiltIn ? undefined : (label.trim() || row.label),
                });
              }
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <span className="text-base font-semibold text-gray-900 dark:text-white tabular-nums">
              {fmtEur(row.amount)}
            </span>
            <button
              type="button"
              onClick={startEdit}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Edit asset"
              aria-label="Edit asset"
            >
              <Pencil size={13} />
            </button>
            {!isBuiltIn && (
              <button
                type="button"
                onClick={onDelete}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                title="Remove asset"
                aria-label="Remove asset"
              >
                <Trash2 size={13} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function ManualBalancesPanel({ showToast }) {
  const qc = useQueryClient();
  const [addingAsset, setAddingAsset] = useState(false);
  const [newAssetForm, setNewAssetForm] = useState({ key: '', label: '', icon: '💵', amount: '' });
  const [assetToDelete, setAssetToDelete] = useState(null);

  const manualsQ = useQuery({
    queryKey: ['manualBalances'],
    queryFn: getManualBalances,
  });

  const updateMut = useMutation({
    mutationFn: ({ key, amount, label }) => updateManualBalance(key, amount, label),
    onSuccess: () => {
      invalidateAssets(qc);
      showToast?.('Asset updated', 'success');
    },
    onError: (e) => showToast?.(e.message, 'error'),
  });

  const addMut = useMutation({
    mutationFn: (data) => addManualBalance(data),
    onSuccess: () => {
      invalidateAssets(qc);
      setAddingAsset(false);
      setNewAssetForm({ key: '', label: '', icon: '💵', amount: '' });
      showToast?.('Asset added', 'success');
    },
    onError: (e) => showToast?.(e.message, 'error'),
  });

  const deleteMut = useMutation({
    mutationFn: (key) => deleteManualBalance(key),
    onSuccess: () => {
      invalidateAssets(qc);
      setAssetToDelete(null);
      showToast?.('Asset removed', 'success');
    },
    onError: (e) => showToast?.(e.message, 'error'),
  });

  const handleAddAsset = () => {
    const label = newAssetForm.label.trim();
    if (!label) return;
    const key =
      newAssetForm.key.trim() ||
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 40) ||
      `asset_${Date.now()}`;

    addMut.mutate({
      key,
      label,
      icon: newAssetForm.icon || '💵',
      amount: parseFloat(newAssetForm.amount) || 0,
    });
  };

  const rows = (manualsQ.data ?? []).filter((r) => r.key !== 'investments' && r.key !== 'investment_cash');

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Wallet size={20} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Manual assets</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Add cash on hand, property, or other values — they count toward your net worth.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAddingAsset((v) => !v)}
          className="btn-secondary text-xs gap-1 shrink-0"
        >
          <Plus size={13} /> Add asset
        </button>
      </div>

      {addingAsset && (
        <div className="p-3 bg-gray-50 dark:bg-gray-800/60 border border-black/[0.05] dark:border-white/[0.06] rounded-xl space-y-2.5">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">New manual asset</p>
          <div className="flex flex-wrap sm:flex-nowrap gap-2">
            <input
              type="text"
              placeholder="💵"
              value={newAssetForm.icon}
              onChange={(e) => setNewAssetForm((f) => ({ ...f, icon: e.target.value }))}
              className="input w-12 text-center text-base"
              title="Emoji icon"
            />
            <input
              type="text"
              placeholder="Name (e.g. Cash on hand, Car value)"
              value={newAssetForm.label}
              onChange={(e) => setNewAssetForm((f) => ({ ...f, label: e.target.value }))}
              className="input flex-1 min-w-[160px]"
            />
            <input
              type="number"
              step="any"
              placeholder="Amount (€)"
              value={newAssetForm.amount}
              onChange={(e) => setNewAssetForm((f) => ({ ...f, amount: e.target.value }))}
              className="input w-28 sm:w-32"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setAddingAsset(false)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddAsset}
              disabled={!newAssetForm.label.trim() || addMut.isPending}
              className="btn-primary text-xs gap-1"
            >
              <Check size={14} /> Save asset
            </button>
          </div>
        </div>
      )}

      <div className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
        {manualsQ.isLoading ? (
          <LoadingSpinner />
        ) : manualsQ.isError ? (
          <p className="text-sm text-red-600">{manualsQ.error.message}</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">No manual assets configured</p>
        ) : (
          rows.map((row) => (
            <AssetRow
              key={row.key}
              row={row}
              isBuiltIn={BUILT_IN.has(row.key)}
              onSave={(payload) => updateMut.mutate({ key: row.key, ...payload })}
              onDelete={() => setAssetToDelete(row)}
            />
          ))
        )}
      </div>

      <ConfirmDialog
        isOpen={!!assetToDelete}
        title="Remove manual asset"
        message={`Are you sure you want to remove "${assetToDelete?.label || 'this asset'}" from your net worth? This action cannot be undone.`}
        confirmText="Remove asset"
        onConfirm={() => {
          if (assetToDelete?.key) deleteMut.mutate(assetToDelete.key);
        }}
        onCancel={() => setAssetToDelete(null)}
      />
    </section>
  );
}
