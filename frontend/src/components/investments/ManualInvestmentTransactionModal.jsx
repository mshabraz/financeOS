import { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { searchInvestmentSecurities } from '../../api/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/Select';

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
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose?.(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <DialogTitle className="text-base font-semibold text-gray-900 dark:text-white">
            {isEdit ? 'Edit Manual Investment Transaction' : 'Add Investment Transaction'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3.5 overflow-y-auto flex-1">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Type</label>
              <Select value={form.type} onValueChange={(val) => setField('type', val)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {TX_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Date</label>
              <input className="input" type="date" value={form.date} onChange={(e) => setField('date', e.target.value)} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Ticker</label>
              <input className="input font-mono uppercase" value={form.ticker} onBlur={handleTickerBlur} onChange={(e) => setField('ticker', e.target.value.toUpperCase())} placeholder="VUSA" />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">ISIN</label>
              <input className="input font-mono uppercase" value={form.isin} onChange={(e) => setField('isin', e.target.value.toUpperCase())} placeholder="optional" />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Security name</label>
              <input className="input" value={form.fundName} onChange={(e) => setField('fundName', e.target.value)} placeholder="optional / auto-filled from ticker" />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Quantity</label>
              <input className="input tabular-nums" type="number" step="any" value={form.quantity} onChange={(e) => handleQty(e.target.value)} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Price per share</label>
              <input className="input tabular-nums" type="number" step="any" value={form.pricePerShare} onChange={(e) => handlePrice(e.target.value)} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Total cost / proceeds</label>
              <input className="input tabular-nums" type="number" step="any" value={form.totalCost} onChange={(e) => handleTotal(e.target.value)} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Currency</label>
              <input className="input uppercase" value={form.currency} onChange={(e) => setField('currency', e.target.value.toUpperCase())} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Broker / account</label>
              <Select value={form.broker} onValueChange={(val) => setField('broker', val)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {(brokerOptions.length ? brokerOptions : [['lightyear', 'LightYear'], ['swedbank_fund', 'Swedbank Fund']]).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Broker account id</label>
              <input className="input" value={form.brokerAccountId} onChange={(e) => setField('brokerAccountId', e.target.value)} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Fees</label>
              <input className="input tabular-nums" type="number" step="any" value={form.fee} onChange={(e) => setField('fee', e.target.value)} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Tax</label>
              <input className="input tabular-nums" type="number" step="any" value={form.taxAmount} onChange={(e) => setField('taxAmount', e.target.value)} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Reference</label>
              <input className="input" value={form.reference} onChange={(e) => setField('reference', e.target.value)} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Custom type (for Other)</label>
              <input className="input" value={form.rawType} onChange={(e) => setField('rawType', e.target.value)} />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Description / raw details</label>
              <input className="input" value={form.rawDetails} onChange={(e) => setField('rawDetails', e.target.value)} />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Notes</label>
              <textarea className="input min-h-[70px]" value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
            </div>
          </div>

          <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-800 space-y-2 bg-gray-50/50 dark:bg-gray-900/50 shrink-0">
            {lookupLoading && <p className="text-xs text-gray-400">Checking ticker…</p>}
            {lookupHint && <p className="text-xs text-gray-500">{lookupHint}</p>}
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className={clsx('flex items-center gap-2', isEdit ? 'justify-between' : 'justify-end')}>
              {isEdit && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(form)}
                  disabled={deleting}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 transition-colors"
                >
                  {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  Delete
                </button>
              )}
              <div className="flex items-center gap-2">
                <button type="button" className="btn-secondary text-xs" onClick={onClose}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary text-xs inline-flex items-center gap-1.5">
                  {saving && <Loader2 size={13} className="animate-spin" />}
                  {isEdit ? 'Save changes' : 'Create transaction'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
