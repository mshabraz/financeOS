import { useState } from 'react';
import { Plus, Check, X, Pencil, Trash2, ChevronDown, ChevronUp, Wallet } from 'lucide-react';
import clsx from 'clsx';
import LoadingSpinner from '../ui/LoadingSpinner';
import { fmtEur, fmtCurrency, privText, fmtPct } from '../../utils/displayFormat';
import { usePrivacy } from '../../context/PrivacyContext';

function formatPortfolioTime(iso) {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleString('et-EE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function AssetRow({ row, onSave, onDelete, isBuiltIn, portfolio }) {
  usePrivacy();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const isComputedInvestments = row.key === 'investments' && portfolio;

  const startEdit = () => {
    if (isComputedInvestments) return;
    setVal(String(row.amount ?? 0));
    setEditing(true);
  };
  const cancel = () => setEditing(false);
  const save = () => { onSave(parseFloat(val) || 0); setEditing(false); };

  const displayCcy = portfolio?.currency || 'EUR';
  const fmtCcy = (n) => fmtCurrency(n, displayCcy);

  return (
    <div className="py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl">{row.icon}</span>
          <div className="min-w-0">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate block">{privText(row.label)}</span>
            {isComputedInvestments && (
              <p className="text-[10px] text-gray-400">Live portfolio · EUR</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {editing ? (
            <>
              <span className="text-sm text-gray-500">€</span>
              <input
                type="number"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
                className="input w-28 py-1 text-sm text-right"
                autoFocus
              />
              <button type="button" onClick={save} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50">
                <Check size={14} />
              </button>
              <button type="button" onClick={cancel} className="p-1.5 rounded-lg text-gray-400">
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <span className="text-base font-semibold text-gray-900 dark:text-white tabular-nums">
                {isComputedInvestments ? fmtCcy(portfolio.totalPortfolio) : fmtEur(row.amount)}
              </span>
              {!isComputedInvestments && (
                <button type="button" onClick={startEdit} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600">
                  <Pencil size={13} />
                </button>
              )}
              {!isBuiltIn && (
                <button type="button" onClick={onDelete} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500">
                  <Trash2 size={13} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {isComputedInvestments && portfolio && (
        <div className="mt-2 ml-9 text-xs text-gray-500 space-y-0.5">
          <p>Holdings {fmtCcy(portfolio.holdingsValue)} · Cash {fmtCcy(portfolio.cashBalance)}</p>
          {portfolio.unrealizedPnLEur != null && (
            <p className={portfolio.unrealizedPnLEur >= 0 ? 'text-emerald-600' : 'text-red-600'}>
              Unrealized {fmtCcy(portfolio.unrealizedPnLEur)}
              {portfolio.unrealizedPnLPct != null && ` (${fmtPct(portfolio.unrealizedPnLPct)})`}
            </p>
          )}
          <p className="text-[10px]">Updated {formatPortfolioTime(portfolio.lastPriceUpdate)}</p>
        </div>
      )}
    </div>
  );
}

export default function DashboardAssets({
  assets,
  manuals,
  isLoading,
  onUpdate,
  onAdd,
  onDelete,
  addingAsset,
  setAddingAsset,
  newAssetForm,
  setNewAssetForm,
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-gray-200/80 dark:border-gray-700/80 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-50/80 dark:bg-gray-800/40 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Wallet size={16} className="text-gray-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Edit manual balances</p>
            <p className="text-xs text-gray-500">Pension, property, and custom assets · investments are live</p>
          </div>
        </div>
        {open ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
      </button>
      {open && (
        <div className="p-4 border-t border-gray-100 dark:border-gray-800">
          {isLoading ? (
            <LoadingSpinner />
          ) : (
            <>
              <div className="flex justify-end mb-2">
                <button type="button" onClick={() => setAddingAsset((v) => !v)} className="btn-ghost text-xs gap-1">
                  <Plus size={12} /> Add asset
                </button>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800 text-sm">
                <span className="text-gray-600">Bank</span>
                <span className="font-semibold tabular-nums">{fmtEur(assets?.bankBalance)}</span>
              </div>
              {assets?.revolutClosingBalance != null && (
                <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800 text-sm gap-2">
                  <span className="text-gray-600">Revolut share</span>
                  <span className="font-semibold tabular-nums text-purple-600">{fmtEur(assets.revolutSharedAsset)}</span>
                </div>
              )}
              {(assets?.manuals ?? manuals)?.map((row) => (
                <AssetRow
                  key={row.key}
                  row={row}
                  portfolio={row.key === 'investments' ? (assets?.investmentPortfolio ?? row.portfolio) : null}
                  isBuiltIn={['pension', 'investments'].includes(row.key)}
                  onSave={(amount) => onUpdate(row.key, amount)}
                  onDelete={() => onDelete(row.key)}
                />
              ))}
              {addingAsset && (
                <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Icon"
                      value={newAssetForm.icon}
                      onChange={(e) => setNewAssetForm((f) => ({ ...f, icon: e.target.value }))}
                      className="input w-14 text-center"
                    />
                    <input
                      type="text"
                      placeholder="Label"
                      value={newAssetForm.label}
                      onChange={(e) => setNewAssetForm((f) => ({ ...f, label: e.target.value }))}
                      className="input flex-1"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="key"
                      value={newAssetForm.key}
                      onChange={(e) => setNewAssetForm((f) => ({ ...f, key: e.target.value.replace(/\s/g, '_') }))}
                      className="input flex-1 font-mono text-xs"
                    />
                    <input
                      type="number"
                      placeholder="€"
                      value={newAssetForm.amount}
                      onChange={(e) => setNewAssetForm((f) => ({ ...f, amount: e.target.value }))}
                      className="input w-24"
                    />
                    <button type="button" onClick={onAdd} disabled={!newAssetForm.key || !newAssetForm.label} className="btn-primary">
                      <Check size={14} />
                    </button>
                    <button type="button" onClick={() => setAddingAsset(false)} className="btn-secondary">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
