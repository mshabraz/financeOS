import { useEffect, useState } from 'react';
import { Loader2, Trash2, X } from 'lucide-react';
import clsx from 'clsx';
import { searchInvestmentSecurities } from '../../api/client';

const TX_TYPES = [
  'Buy',
  'Sell',
  'Dividend',
  'Interest',
  'Deposit',
  'Withdrawal',
  'Fee',
  'Stock Split',
  'Transfer',
  'Other',
];

function toInputDate(v) {
  if (!v) return '';
  return String(v).slice(0, 10);
}

function numOrEmpty(v) {
  if (v == null || Number.isNaN(Number(v))) return '';
  return String(v);
}

function defaults(initial) {
  const tx = initial ?? {};
  let preferredBroker = 'lightyear';
  try {
    preferredBroker = localStorage.getItem('financeos.lastManualInvestmentBroker') || preferredBroker;
  } catch {
    /* ignore */
  }
  return {
    id: tx.id ?? null,
    type: tx.type || 'Buy',
    ticker: tx.ticker || '',
    isin: tx.isin || '',
    fundName: tx.fund_name || tx.fundName || '',
    quantity: numOrEmpty(tx.quantity),
    pricePerShare: numOrEmpty(tx.price_per_share ?? tx.pricePerShare),
    totalCost: numOrEmpty(tx.gross_amount ?? tx.grossAmount),
    date: toInputDate(tx.date) || toInputDate(new Date().toISOString()),
    broker: tx.broker || preferredBroker,
    brokerAccountId: tx.broker_account_id || '',
    fee: numOrEmpty(tx.fee ?? 0),
    taxAmount: numOrEmpty(tx.tax_amount ?? 0),
    currency: tx.currency || 'EUR',
    notes: tx.notes || '',
    reference: tx.reference || '',
    rawDetails: tx.raw_details || '',
    rawType: tx.raw_type && tx.type === 'Other' ? tx.raw_type : '',
  };
}

export default function ManualInvestmentTransactionModal({
  open,
  initial,
  brokerOptions = [],
  onClose,
  onSubmit,
  onDelete,
  saving,
  deleting,
}) {
  const [form, setForm] = useState(defaults(initial));
  const [error, setError] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupHint, setLookupHint] = useState('');

  const isEdit = !!form.id;

  useEffect(() => {
    setForm(defaults(initial));
    setError('');
    setLookupHint('');
  }, [initial, open]);

  if (!open) return null;

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const recalcFromQtyPrice = (nextQty, nextPrice) => {
    const q = Number(nextQty);
    const p = Number(nextPrice);
    if (Number.isFinite(q) && Number.isFinite(p)) {
      setField('totalCost', String(Math.round(q * p * 10000) / 10000));
    }
  };

  const handleQty = (v) => {
    setField('quantity', v);
    recalcFromQtyPrice(v, form.pricePerShare);
  };
  const handlePrice = (v) => {
    setField('pricePerShare', v);
    recalcFromQtyPrice(form.quantity, v);
  };
  const handleTotal = (v) => {
    setField('totalCost', v);
    const q = Number(form.quantity);
    const t = Number(v);
    if (Number.isFinite(q) && q > 0 && Number.isFinite(t)) {
      setField('pricePerShare', String(Math.round((t / q) * 1000000) / 1000000));
    }
  };

  const handleTickerBlur = async () => {
    const t = String(form.ticker || '').trim();
    if (!t) return;
    setLookupLoading(true);
    setLookupHint('');
    try {
      const res = await searchInvestmentSecurities(t);
      const hits = res?.results || [];
      const exact = hits.find((h) => String(h.symbol || '').toUpperCase() === t.toUpperCase())
        || hits.find((h) => String(h.providerSymbol || '').toUpperCase().split('.')[0] === t.toUpperCase());
      if (exact) {
        if (!form.fundName) setField('fundName', exact.name || form.fundName);
        if (!form.currency && exact.currency) setField('currency', exact.currency);
        setLookupHint(`Matched: ${exact.providerSymbol}`);
      } else {
        setLookupHint('No exact ticker match. You can still save and bind manually later.');
      }
    } catch {
      setLookupHint('Lookup unavailable. You can still save this transaction.');
    } finally {
      setLookupLoading(false);
    }
  };

  const validate = () => {
    if (!form.type) return 'Transaction type is required';
    if (!form.date) return 'Transaction date is required';
    if (!form.broker) return 'Broker/account is required';
    if (!form.currency) return 'Currency is required';
    if (['Buy', 'Sell', 'Stock Split'].includes(form.type) && !form.ticker.trim()) {
      return 'Ticker is required for this type';
    }
    if (['Buy', 'Sell', 'Stock Split'].includes(form.type) && (!Number.isFinite(Number(form.quantity)) || Number(form.quantity) <= 0)) {
      return 'Quantity must be greater than 0';
    }
    if (['Buy', 'Sell'].includes(form.type)) {
      const hasTotal = Number.isFinite(Number(form.totalCost));
      const hasPair = Number.isFinite(Number(form.quantity)) && Number.isFinite(Number(form.pricePerShare));
      if (!hasTotal && !hasPair) return 'Enter total cost or quantity + price per share';
    }
    if (form.type === 'Other' && !form.rawType.trim()) return 'Custom type is required for Other';
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    setError('');
    try {
      localStorage.setItem('financeos.lastManualInvestmentBroker', form.broker || 'lightyear');
    } catch {
      /* ignore */
    }
    await onSubmit?.(form);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 p-3 sm:p-6 flex items-end sm:items-center justify-center" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">
            {isEdit ? 'Edit Manual Investment Transaction' : 'Add Investment Transaction'}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto">
          <label className="text-xs text-gray-500">Type
            <select className="input mt-1" value={form.type} onChange={(e) => setField('type', e.target.value)}>
              {TX_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-500">Date
            <input className="input mt-1" type="date" value={form.date} onChange={(e) => setField('date', e.target.value)} />
          </label>

          <label className="text-xs text-gray-500">Ticker
            <input className="input mt-1 font-mono" value={form.ticker} onBlur={handleTickerBlur} onChange={(e) => setField('ticker', e.target.value.toUpperCase())} placeholder="VUSA" />
          </label>
          <label className="text-xs text-gray-500">ISIN
            <input className="input mt-1 font-mono" value={form.isin} onChange={(e) => setField('isin', e.target.value.toUpperCase())} placeholder="optional" />
          </label>

          <label className="text-xs text-gray-500 sm:col-span-2">Security name
            <input className="input mt-1" value={form.fundName} onChange={(e) => setField('fundName', e.target.value)} placeholder="optional / auto-filled from ticker" />
          </label>

          <label className="text-xs text-gray-500">Quantity
            <input className="input mt-1" type="number" step="any" value={form.quantity} onChange={(e) => handleQty(e.target.value)} />
          </label>
          <label className="text-xs text-gray-500">Price per share
            <input className="input mt-1" type="number" step="any" value={form.pricePerShare} onChange={(e) => handlePrice(e.target.value)} />
          </label>

          <label className="text-xs text-gray-500">Total cost / proceeds
            <input className="input mt-1" type="number" step="any" value={form.totalCost} onChange={(e) => handleTotal(e.target.value)} />
          </label>
          <label className="text-xs text-gray-500">Currency
            <input className="input mt-1" value={form.currency} onChange={(e) => setField('currency', e.target.value.toUpperCase())} />
          </label>

          <label className="text-xs text-gray-500">Broker / account
            <select className="input mt-1" value={form.broker} onChange={(e) => setField('broker', e.target.value)}>
              {(brokerOptions.length ? brokerOptions : [['lightyear', 'LightYear'], ['swedbank_fund', 'Swedbank Fund']]).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-500">Broker account id
            <input className="input mt-1" value={form.brokerAccountId} onChange={(e) => setField('brokerAccountId', e.target.value)} />
          </label>

          <label className="text-xs text-gray-500">Fees
            <input className="input mt-1" type="number" step="any" value={form.fee} onChange={(e) => setField('fee', e.target.value)} />
          </label>
          <label className="text-xs text-gray-500">Tax
            <input className="input mt-1" type="number" step="any" value={form.taxAmount} onChange={(e) => setField('taxAmount', e.target.value)} />
          </label>

          <label className="text-xs text-gray-500">Reference
            <input className="input mt-1" value={form.reference} onChange={(e) => setField('reference', e.target.value)} />
          </label>
          <label className="text-xs text-gray-500">Custom type (for Other)
            <input className="input mt-1" value={form.rawType} onChange={(e) => setField('rawType', e.target.value)} />
          </label>

          <label className="text-xs text-gray-500 sm:col-span-2">Description / raw details
            <input className="input mt-1" value={form.rawDetails} onChange={(e) => setField('rawDetails', e.target.value)} />
          </label>
          <label className="text-xs text-gray-500 sm:col-span-2">Notes
            <textarea className="input mt-1 min-h-[70px]" value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
          </label>
        </div>

        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 space-y-2">
          {lookupLoading && <p className="text-xs text-gray-400">Checking ticker…</p>}
          {lookupHint && <p className="text-xs text-gray-500">{lookupHint}</p>}
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className={clsx('flex items-center gap-2', isEdit ? 'justify-between' : 'justify-end')}>
            {isEdit && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(form)}
                disabled={deleting}
                className="inline-flex items-center gap-1 text-xs px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Delete
              </button>
            )}
            <div className="flex items-center gap-2">
              <button type="button" className="btn-secondary text-xs" onClick={onClose}>Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary text-xs inline-flex items-center gap-1">
                {saving && <Loader2 size={13} className="animate-spin" />}
                {isEdit ? 'Save changes' : 'Create transaction'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
