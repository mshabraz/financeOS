import { useState } from 'react';
import { fmtCurrency } from '../../utils/displayFormat';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';

export default function ObligationSettleModal({ row, onClose, onSubmit, saving }) {
  const [amount, setAmount] = useState(String(row?.amount_remaining ?? row?.amount ?? ''));
  const [notes, setNotes] = useState('');

  if (!row) return null;
  const fmt = (n) => fmtCurrency(n, row.currency || 'EUR');

  return (
    <Dialog open={!!row} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent className="max-w-sm p-6 space-y-4">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-gray-900 dark:text-white">
            Record payment
          </DialogTitle>
          <p className="text-xs text-gray-500">{row.title} · remaining {fmt(row.amount_remaining)}</p>
        </DialogHeader>

        <form
          className="space-y-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ amount: parseFloat(amount), notes: notes.trim() || null });
          }}
        >
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Amount</span>
            <input className="input w-full mt-1 tabular-nums" type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Notes</span>
            <input className="input w-full mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="flex gap-2 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Saving…' : 'Record'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
