import { useState } from 'react';
import { X } from 'lucide-react';
import { fmtCurrency } from '../../utils/displayFormat';

export default function ObligationSettleModal({ row, onClose, onSubmit, saving }) {
  const [amount, setAmount] = useState(String(row?.amount_remaining ?? row?.amount ?? ''));
  const [notes, setNotes] = useState('');

  if (!row) return null;
  const fmt = (n) => fmtCurrency(n, row.currency || 'EUR');

  return (
    <div className="fixed inset-0 z-[61] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <form
        className="relative w-full sm:max-w-sm bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl p-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ amount: parseFloat(amount), notes: notes.trim() || null });
        }}
      >
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Record payment</h3>
          <button type="button" onClick={onClose} className="p-1 text-gray-400"><X size={18} /></button>
        </div>
        <p className="text-xs text-gray-500">{row.title} · remaining {fmt(row.amount_remaining)}</p>
        <label className="block">
          <span className="text-xs font-medium">Amount</span>
          <input className="input w-full mt-1 tabular-nums" type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs font-medium">Notes</span>
          <input className="input w-full mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button type="submit" className="btn-primary w-full" disabled={saving}>{saving ? 'Saving…' : 'Record'}</button>
      </form>
    </div>
  );
}
