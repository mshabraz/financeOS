import { useState } from 'react';
import { Plus, Check, X, Pencil, Trash2, Wallet } from 'lucide-react';
import LoadingSpinner from '../ui/LoadingSpinner';
import TableSkeleton from '../ui/TableSkeleton';
import InlineAmountEditor from '../ui/InlineAmountEditor';
import { fmtEur, fmtCurrency, privText, fmtPct } from '../../utils/displayFormat';
import { usePrivacy } from '../../context/PrivacyContext';

const BUILT_IN = new Set(['pension', 'investments', 'investment_cash', 'paypal']);

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
  const [label, setLabel] = useState('');
  const isComputedInvestments = row.key === 'investments' && portfolio;

  const startEdit = () => {
    if (isComputedInvestments) return;
    setVal(String(row.amount ?? 0));
    setLabel(row.label || '');
    setEditing(true);
  };
  const cancel = () => setEditing(false);
  const save = () => {
    onSave({
      amount: parseFloat(val) || 0,
      label: isBuiltIn ? undefined : label.trim() || row.label,
    });
    setEditing(false);
  };

  const displayCcy = portfolio?.currency || 'EUR';
  const fmtCcy = (n) => fmtCurrency(n, displayCcy);

  return (
    <div className="py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl">{row.icon}</span>
          <div className="min-w-0">
            {editing && !isBuiltIn ? (
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="input py-1 text-sm w-full max-w-[180px]"
              />
            ) : (
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate block">
                {privText(row.label)}
              </span>
            )}
            {isComputedInvestments && (
              <p className="text-[10px] text-gray-400">Live portfolio · EUR</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {editing ? (
            <InlineAmountEditor
              value={val}
              currency="€"
              onSave={(newVal) => {
                const parsed = parseFloat(newVal);
                if (!isNaN(parsed)) onSave(row.key, parsed, label);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
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
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 shrink-0">
            <Wallet size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Manual assets</h3>
            <p className="text-xs text-gray-500">
              Add cash on hand, property, or other values — they count toward net worth
            </p>
          </div>
        </div>
        <button type="button" onClick={() => setAddingAsset((v) => !v)} className="btn-secondary text-xs gap-1 shrink-0">
          <Plus size={12} /> Add asset
        </button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} />
      ) : (
        <>
          <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800 text-sm">
            <span className="text-gray-600">
              Bank
              {assets?.bankBalanceSource === 'open_banking' && (
                <span className="text-[10px] text-gray-400 block">Live from bank</span>
              )}
            </span>
            <span className="font-semibold tabular-nums">{fmtEur(assets?.bankBalance)}</span>
          </div>
          {assets?.revolutClosingBalance != null && (
            <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800 text-sm gap-2">
              <span className="text-gray-600">
                Revolut
                {assets?.revolutBalanceSource === 'open_banking' && (
                  <span className="text-[10px] text-gray-400 block">Live from bank</span>
                )}
              </span>
              <span className="font-semibold tabular-nums text-purple-600">
                {fmtEur(assets.revolutClosingBalance)}
              </span>
            </div>
          )}
          {(assets?.manuals ?? manuals)?.map((row) => (
            <AssetRow
              key={row.key}
              row={row}
              portfolio={row.key === 'investments' ? (assets?.investmentPortfolio ?? row.portfolio) : null}
              isBuiltIn={BUILT_IN.has(row.key)}
              onSave={(payload) => onUpdate(row.key, payload.amount, payload.label)}
              onDelete={() => onDelete(row.key)}
            />
          ))}
          {addingAsset && (
            <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="💵"
                  value={newAssetForm.icon}
                  onChange={(e) => setNewAssetForm((f) => ({ ...f, icon: e.target.value }))}
                  className="input w-14 text-center"
                  title="Icon"
                />
                <input
                  type="text"
                  placeholder="Name (e.g. Cash on hand)"
                  value={newAssetForm.label}
                  onChange={(e) => setNewAssetForm((f) => ({ ...f, label: e.target.value }))}
                  className="input flex-1"
                />
                <input
                  type="number"
                  placeholder="€"
                  value={newAssetForm.amount}
                  onChange={(e) => setNewAssetForm((f) => ({ ...f, amount: e.target.value }))}
                  className="input w-28"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setAddingAsset(false)} className="btn-secondary text-xs">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onAdd}
                  disabled={!newAssetForm.label.trim()}
                  className="btn-primary text-xs gap-1"
                >
                  <Check size={14} /> Save
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
