import { useState, useEffect } from 'react';
import { OBLIGATION_KINDS, RECURRENCE_OPTIONS } from './obligationConstants';
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

export default function ObligationFormModal({ open, onClose, onSubmit, initial, saving }) {
  const [direction, setDirection] = useState('payable');
  const [obligationKind, setObligationKind] = useState('bill');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [recurrence, setRecurrence] = useState('');

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDirection(initial.direction || 'payable');
      setObligationKind(initial.obligation_kind || 'custom');
      setTitle(initial.title || '');
      setAmount(String(initial.amount ?? ''));
      setDueDate(initial.due_date || '');
      setCounterparty(initial.counterparty || '');
      setCategory(initial.category || '');
      setDescription(initial.description || '');
      setRecurrence(initial.recurrence_rule?.frequency || '');
    } else {
      setDirection('payable');
      setObligationKind('bill');
      setTitle('');
      setAmount('');
      setDueDate('');
      setCounterparty('');
      setCategory('');
      setDescription('');
      setRecurrence('');
    }
  }, [open, initial]);

  if (!open) return null;

  const hasDueDate = !!dueDate;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      direction,
      obligation_kind: obligationKind,
      title: title.trim(),
      amount: parseFloat(amount),
      due_date: dueDate || null,
      counterparty: counterparty.trim() || null,
      category: category.trim() || null,
      description: description.trim() || null,
      recurrence_rule: hasDueDate && recurrence
        ? { frequency: recurrence, interval: 1 }
        : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose?.(); }}>
      <DialogContent className="max-w-lg p-0 flex flex-col overflow-hidden max-h-[92vh]">
        <DialogHeader className="p-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <DialogTitle className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">
            {initial ? 'Edit obligation' : 'Add payment or IOU'}
          </DialogTitle>
        </DialogHeader>

        <form className="flex flex-col flex-1 overflow-hidden" onSubmit={handleSubmit}>
          <div className="p-4 space-y-3.5 overflow-y-auto flex-1">
            <div className="flex gap-2">
              <button
                type="button"
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  direction === 'payable'
                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200'
                    : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
                onClick={() => setDirection('payable')}
              >
                I need to pay
              </button>
              <button
                type="button"
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  direction === 'receivable'
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                    : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
                onClick={() => setDirection('receivable')}
              >
                Owed to me
              </button>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Title</span>
              <input className="input w-full mt-1" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rent, Netflix, John reimbursement…" />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Amount (EUR)</span>
                <input className="input w-full mt-1 tabular-nums" type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  Due date <span className="text-gray-400 font-normal">(optional)</span>
                </span>
                <input
                  className="input w-full mt-1"
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDueDate(v);
                    if (!v) setRecurrence('');
                  }}
                />
                {dueDate && (
                  <button
                    type="button"
                    className="text-[10px] text-brand-600 mt-1 hover:underline"
                    onClick={() => {
                      setDueDate('');
                      setRecurrence('');
                    }}
                  >
                    Clear due date
                  </button>
                )}
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Type</label>
                <Select value={obligationKind} onValueChange={(val) => setObligationKind(val)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OBLIGATION_KINDS.map((k) => (
                      <SelectItem key={k.id} value={k.id}>{k.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  Recurrence <span className="text-gray-400 font-normal">(needs due date)</span>
                </label>
                <Select
                  value={recurrence || 'none'}
                  disabled={!hasDueDate}
                  onValueChange={(val) => setRecurrence(val === 'none' ? '' : val)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="One-time (no repeat)" />
                  </SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_OPTIONS.map((r) => (
                      <SelectItem key={r.id || 'none'} value={r.id || 'none'}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Counterparty</span>
              <input className="input w-full mt-1" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="Person, company, landlord…" />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Notes</span>
              <textarea className="input w-full mt-1 min-h-[3rem]" value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </div>

          <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 flex gap-2 shrink-0">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Saving…' : initial ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
