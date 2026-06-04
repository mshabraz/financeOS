import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { OBLIGATION_KINDS, RECURRENCE_OPTIONS } from './obligationConstants';

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
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <form
        role="dialog"
        aria-labelledby="obligation-form-title"
        className="relative w-full sm:max-w-lg bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl max-h-[92vh] overflow-y-auto"
        onSubmit={handleSubmit}
      >
        <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
          <h2 id="obligation-form-title" className="text-sm font-semibold text-gray-900 dark:text-white">
            {initial ? 'Edit obligation' : 'Add payment or IOU'}
          </h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                direction === 'payable'
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500'
              }`}
              onClick={() => setDirection('payable')}
            >
              I need to pay
            </button>
            <button
              type="button"
              className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                direction === 'receivable'
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500'
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
            <label className="block">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Type</span>
              <select className="input w-full mt-1" value={obligationKind} onChange={(e) => setObligationKind(e.target.value)}>
                {OBLIGATION_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>{k.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                Recurrence <span className="text-gray-400 font-normal">(needs due date)</span>
              </span>
              <select
                className="input w-full mt-1"
                value={recurrence}
                disabled={!hasDueDate}
                onChange={(e) => setRecurrence(e.target.value)}
              >
                {RECURRENCE_OPTIONS.map((r) => (
                  <option key={r.id || 'none'} value={r.id}>{r.label}</option>
                ))}
              </select>
            </label>
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

        <div className="sticky bottom-0 p-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex gap-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary flex-1" disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  );
}
