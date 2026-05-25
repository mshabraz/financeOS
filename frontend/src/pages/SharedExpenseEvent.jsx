import { useState, useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Plus, Trash2, Users, Receipt, Scale, HandCoins, Pencil, UserPlus, Check, Circle,
} from 'lucide-react';
import {
  getSharedEvent,
  getSharedEvents,
  addSharedParticipant,
  deleteSharedParticipant,
  importSharedParticipants,
  setSharedTransfersSettledBatch,
  createSharedExpense,
  updateSharedExpense,
  deleteSharedExpense,
  deleteSharedEvent,
} from '../api/client';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import SettlementSharePanel from '../components/shared/SettlementSharePanel';
import { transferToPayload, transferRowId, isValidTransfer } from '../utils/sharedTransfer';
import clsx from 'clsx';

const fmt = (n, currency = 'EUR') =>
  new Intl.NumberFormat('et-EE', { style: 'currency', currency }).format(n ?? 0);

const SPLIT_TYPES = [
  { id: 'equal_all', label: 'Split equally (everyone)' },
  { id: 'equal_subset', label: 'Split equally (selected)' },
  { id: 'single', label: 'One person owes all' },
  { id: 'custom', label: 'Custom amounts' },
];

const TABS = [
  { id: 'expenses', label: 'Expenses', icon: Receipt },
  { id: 'people', label: 'People', icon: Users },
  { id: 'balances', label: 'Balances', icon: Scale },
  { id: 'settlement', label: 'Settlement', icon: HandCoins },
];

function emptyExpenseForm(participants) {
  const first = participants[0]?.id ?? '';
  return {
    description: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    category: '',
    total: '',
    splitType: 'equal_all',
    subsetIds: participants.map((p) => p.id),
    assigneeId: first,
    payerId: first,
    splitPay: false,
    payerAmounts: Object.fromEntries(participants.map((p) => [p.id, ''])),
    customAmounts: Object.fromEntries(participants.map((p) => [p.id, ''])),
  };
}

function buildExpensePayload(form, participants) {
  const total = parseFloat(form.total) || 0;
  const payers = [];
  if (form.splitPay) {
    for (const p of participants) {
      const a = parseFloat(form.payerAmounts[p.id]);
      if (a > 0) payers.push({ participantId: p.id, amount: a });
    }
  } else if (form.payerId) {
    payers.push({ participantId: Number(form.payerId), amount: total });
  }

  const body = {
    description: form.description,
    expenseDate: form.expenseDate || null,
    category: form.category,
    notes: '',
    splitType: form.splitType,
    payers,
  };

  if (form.splitType === 'equal_subset') {
    body.splitParticipantIds = form.subsetIds.map(Number);
  }
  if (form.splitType === 'single') {
    body.assigneeId = Number(form.assigneeId);
  }
  if (form.splitType === 'custom') {
    body.customShares = participants
      .map((p) => ({ participantId: p.id, amount: parseFloat(form.customAmounts[p.id]) || 0 }))
      .filter((s) => s.amount > 0);
  }
  return body;
}

export default function SharedExpenseEvent() {
  const { eventId } = useParams();
  const [searchParams] = useSearchParams();
  const id = Number(eventId);
  const qc = useQueryClient();
  const initialTab = ['expenses', 'people', 'balances', 'settlement'].includes(searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'expenses';
  const [tab, setTab] = useState(initialTab);
  const [newPerson, setNewPerson] = useState('');
  const [importSourceId, setImportSourceId] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [selectedTransferRows, setSelectedTransferRows] = useState(() => new Set());
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editExpenseId, setEditExpenseId] = useState(null);
  const [expenseForm, setExpenseForm] = useState(null);

  const eventQ = useQuery({
    queryKey: ['sharedEvent', id],
    queryFn: () => getSharedEvent(id),
  });

  const allEventsQ = useQuery({
    queryKey: ['sharedEvents'],
    queryFn: getSharedEvents,
  });
  const otherEvents = (allEventsQ.data ?? []).filter((e) => e.id !== id);

  const data = eventQ.data;
  const currency = data?.event?.currency ?? 'EUR';
  const participants = data?.participants ?? [];

  const initForm = () => setExpenseForm(emptyExpenseForm(participants));

  const [saveError, setSaveError] = useState('');

  const saveExpenseMut = useMutation({
    mutationFn: () => {
      const body = buildExpensePayload(expenseForm, participants);
      return editExpenseId
        ? updateSharedExpense(editExpenseId, body)
        : createSharedExpense(id, body);
    },
    onSuccess: () => {
      setSaveError('');
      qc.invalidateQueries({ queryKey: ['sharedEvent', id] });
      setShowExpenseForm(false);
      setEditExpenseId(null);
      setExpenseForm(null);
    },
    onError: (err) => setSaveError(err.message || 'Save failed'),
  });

  const addPersonMut = useMutation({
    mutationFn: () => addSharedParticipant(id, newPerson),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sharedEvent', id] });
      setNewPerson('');
    },
  });

  const deletePersonMut = useMutation({
    mutationFn: deleteSharedParticipant,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sharedEvent', id] }),
  });

  const deleteExpenseMut = useMutation({
    mutationFn: deleteSharedExpense,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sharedEvent', id] }),
  });

  const deleteEventMut = useMutation({
    mutationFn: () => deleteSharedEvent(id),
    onSuccess: () => { window.location.href = '/shared'; },
  });

  const importPeopleMut = useMutation({
    mutationFn: () => importSharedParticipants(id, Number(importSourceId)),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['sharedEvent', id] });
      setImportSourceId('');
      const parts = [];
      if (result.addedCount) parts.push(`Added ${result.addedCount}`);
      if (result.skippedCount) parts.push(`${result.skippedCount} already in list`);
      setImportMessage(parts.join(' · ') || 'Done');
      setTimeout(() => setImportMessage(''), 4000);
    },
    onError: (err) => setImportMessage(err.message || 'Import failed'),
  });

  const [settleError, setSettleError] = useState('');

  const applySettledMut = useMutation({
    mutationFn: ({ transfers, settled }) =>
      setSharedTransfersSettledBatch(id, transfers, settled),
    onSuccess: (updated) => {
      setSettleError('');
      setSelectedTransferRows(new Set());
      qc.setQueryData(['sharedEvent', id], (old) => (
        old ? { ...old, settlement: updated } : old
      ));
      qc.invalidateQueries({ queryKey: ['sharedEvent', id] });
    },
    onError: (err) => setSettleError(err.message || 'Could not update settlement'),
  });

  useEffect(() => {
    if (tab !== 'settlement') setSelectedTransferRows(new Set());
  }, [tab]);

  const toggleTransferSelect = (rowId) => {
    setSelectedTransferRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const startEdit = (exp) => {
    const payMap = Object.fromEntries(participants.map((p) => [p.id, '']));
    for (const pay of exp.payments) payMap[pay.participant_id] = String(pay.amount);
    const shareIds = (exp.shares ?? []).map((s) => s.participant_id);
    const customMap = Object.fromEntries(participants.map((p) => [p.id, '']));
    for (const sh of exp.shares) customMap[sh.participant_id] = String(sh.amount);

    setExpenseForm({
      description: exp.description,
      expenseDate: exp.expense_date?.slice?.(0, 10) || '',
      category: exp.category || '',
      total: String(exp.amount),
      splitType: exp.split_type,
      subsetIds: shareIds.length ? shareIds : participants.map((p) => p.id),
      assigneeId: exp.split_type === 'single' ? shareIds[0] : participants[0]?.id,
      payerId: exp.payments[0]?.participant_id ?? participants[0]?.id,
      splitPay: exp.payments.length > 1,
      payerAmounts: payMap,
      customAmounts: customMap,
    });
    setEditExpenseId(exp.id);
    setShowExpenseForm(true);
  };

  const toggleSubset = (pid) => {
    setExpenseForm((f) => {
      const set = new Set(f.subsetIds);
      if (set.has(pid)) set.delete(pid);
      else set.add(pid);
      return { ...f, subsetIds: [...set] };
    });
  };

  const summary = data?.summary;
  const settlement = data?.settlement;

  const getSelectedTransfers = () => {
    const list = settlement?.transfers ?? [];
    return list
      .map((t, index) => ({ t, index }))
      .filter(({ index }) => selectedTransferRows.has(transferRowId(index)))
      .map(({ t }) => transferToPayload(t))
      .filter((p) => p.fromParticipantId && p.toParticipantId && p.amount > 0);
  };

  if (eventQ.isLoading) return <LoadingSpinner />;
  if (!data?.event) {
    return (
      <div className="card p-6 text-center">
        <p>Event not found.</p>
        <Link to="/shared" className="text-brand-600 text-sm mt-2 inline-block">Back to list</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-24 lg:pb-6">
      <div className="flex items-start gap-3">
        <Link to="/shared" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{data.event.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {summary ? fmt(summary.totalSpend, currency) : '—'} total · {participants.length} people
          </p>
        </div>
        <button
          type="button"
          className="text-xs text-red-500 hover:underline shrink-0"
          onClick={() => {
            if (window.confirm('Delete this entire event?')) deleteEventMut.mutate();
          }}
        >
          Delete
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map(({ id: tid, label, icon: Icon }) => (
          <button
            key={tid}
            type="button"
            onClick={() => setTab(tid)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0',
              tab === tid
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
            )}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'people' && (
        <div className="space-y-4">
          {otherEvents.length > 0 && (
            <div className="card p-4 space-y-2">
              <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                <UserPlus size={16} className="text-brand-600" />
                Import from another event
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Copy participant names from a past trip or dinner (skips duplicates).
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  className="input flex-1"
                  value={importSourceId}
                  onChange={(e) => setImportSourceId(e.target.value)}
                >
                  <option value="">Select event…</option>
                  {otherEvents.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.participant_count} people)
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  disabled={!importSourceId || importPeopleMut.isPending}
                  onClick={() => importPeopleMut.mutate()}
                >
                  Import
                </button>
              </div>
              {importMessage && (
                <p className="text-xs text-brand-600 dark:text-brand-400">{importMessage}</p>
              )}
            </div>
          )}
          <div className="card p-4 flex gap-2">
            <input
              className="input flex-1"
              placeholder="Add participant name"
              value={newPerson}
              onChange={(e) => setNewPerson(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && newPerson.trim() && addPersonMut.mutate()}
            />
            <button type="button" className="btn-primary" disabled={!newPerson.trim()} onClick={() => addPersonMut.mutate()}>
              <Plus size={16} />
            </button>
          </div>
          <ul className="card divide-y divide-gray-100 dark:divide-gray-800">
            {participants.map((p) => (
              <li key={p.id} className="px-4 py-3 flex justify-between items-center">
                <span className="font-medium text-gray-900 dark:text-white">{p.name}</span>
                <button
                  type="button"
                  className="text-gray-400 hover:text-red-500"
                  onClick={() => {
                    if (window.confirm(`Remove ${p.name}?`)) deletePersonMut.mutate(p.id);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'expenses' && (
        <div className="space-y-4">
          <button
            type="button"
            className="btn-primary w-full sm:w-auto"
            onClick={() => {
              initForm();
              setEditExpenseId(null);
              setShowExpenseForm(true);
            }}
            disabled={participants.length === 0}
          >
            <Plus size={16} />
            Add expense
          </button>
          {participants.length === 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400">Add people first before logging expenses.</p>
          )}

          {showExpenseForm && expenseForm && (
            <div className="card p-4 space-y-4">
              <p className="font-semibold text-gray-900 dark:text-white">
                {editExpenseId ? 'Edit expense' : 'New expense'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  className="input sm:col-span-2"
                  placeholder="Description"
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                />
                <input
                  type="date"
                  className="input"
                  value={expenseForm.expenseDate}
                  onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="Category (optional)"
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  placeholder="Total amount"
                  value={expenseForm.total}
                  onChange={(e) => setExpenseForm({ ...expenseForm, total: e.target.value })}
                />
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Who paid</p>
                <label className="flex items-center gap-2 text-sm mb-2">
                  <input
                    type="checkbox"
                    checked={expenseForm.splitPay}
                    onChange={(e) => setExpenseForm({ ...expenseForm, splitPay: e.target.checked })}
                  />
                  Split payment across multiple people
                </label>
                {!expenseForm.splitPay ? (
                  <select
                    className="input"
                    value={expenseForm.payerId}
                    onChange={(e) => setExpenseForm({ ...expenseForm, payerId: e.target.value })}
                  >
                    {participants.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {participants.map((p) => (
                      <label key={p.id} className="text-xs">
                        <span className="text-gray-500 block mb-0.5">{p.name}</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="input py-1.5 text-sm"
                          value={expenseForm.payerAmounts[p.id]}
                          onChange={(e) => setExpenseForm({
                            ...expenseForm,
                            payerAmounts: { ...expenseForm.payerAmounts, [p.id]: e.target.value },
                          })}
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Fair split</p>
                <select
                  className="input mb-2"
                  value={expenseForm.splitType}
                  onChange={(e) => setExpenseForm({ ...expenseForm, splitType: e.target.value })}
                >
                  {SPLIT_TYPES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>

                {expenseForm.splitType === 'equal_subset' && (
                  <div className="flex flex-wrap gap-2">
                    {participants.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleSubset(p.id)}
                        className={clsx(
                          'px-2.5 py-1 rounded-full text-xs font-medium border',
                          expenseForm.subsetIds.includes(p.id)
                            ? 'bg-brand-600 border-brand-600 text-white'
                            : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                        )}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}

                {expenseForm.splitType === 'single' && (
                  <select
                    className="input"
                    value={expenseForm.assigneeId}
                    onChange={(e) => setExpenseForm({ ...expenseForm, assigneeId: e.target.value })}
                  >
                    {participants.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} owes full amount</option>
                    ))}
                  </select>
                )}

                {expenseForm.splitType === 'custom' && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {participants.map((p) => (
                      <label key={p.id} className="text-xs">
                        <span className="text-gray-500 block mb-0.5">{p.name} owes</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="input py-1.5 text-sm"
                          value={expenseForm.customAmounts[p.id]}
                          onChange={(e) => setExpenseForm({
                            ...expenseForm,
                            customAmounts: { ...expenseForm.customAmounts, [p.id]: e.target.value },
                          })}
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {saveError && <p className="text-sm text-red-600">{saveError}</p>}

              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary flex-1"
                  disabled={saveExpenseMut.isPending}
                  onClick={() => saveExpenseMut.mutate()}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => { setShowExpenseForm(false); setEditExpenseId(null); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <ul className="space-y-2">
            {(data.expenses ?? []).map((exp) => (
              <li key={exp.id} className="card p-4">
                <div className="flex justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white">{exp.description}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {exp.expense_date?.slice?.(0, 10)} · {exp.category || 'General'} · {exp.split_type.replace(/_/g, ' ')}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Paid: {(exp.payments ?? []).map((p) => `${p.participant_name} ${fmt(p.amount, currency)}`).join(', ')}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-brand-600 dark:text-brand-400">{fmt(exp.amount, currency)}</p>
                    <div className="flex gap-1 mt-2 justify-end">
                      <button type="button" className="p-1.5 text-gray-400 hover:text-brand-500" onClick={() => startEdit(exp)}>
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="p-1.5 text-gray-400 hover:text-red-500"
                        onClick={() => {
                          if (window.confirm('Delete this expense?')) deleteExpenseMut.mutate(exp.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'balances' && summary && (
        <div className="space-y-4">
          <div className="card p-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500">Total spend</p>
              <p className="font-bold text-lg">{fmt(summary.totalSpend, currency)}</p>
            </div>
            <div>
              <p className="text-gray-500">Checks</p>
              <p className={summary.checks.balancesSumToZero ? 'text-green-600' : 'text-red-600'}>
                Balances {summary.checks.balancesSumToZero ? 'OK' : 'mismatch'}
              </p>
            </div>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/80 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2">Person</th>
                  <th className="px-4 py-2 text-right">Paid</th>
                  <th className="px-4 py-2 text-right">Should</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {(summary.balances ?? []).map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-2.5 font-medium">{b.name}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(b.paid, currency)}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(b.shouldPay, currency)}</td>
                    <td className={clsx(
                      'px-4 py-2.5 text-right font-semibold',
                      b.balance > 0.01 && 'text-amber-600 dark:text-amber-400',
                      b.balance < -0.01 && 'text-green-600 dark:text-green-400'
                    )}>
                      {fmt(b.balance, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 px-1">
            Positive balance = owes the group. Negative = paid more than their fair share.
          </p>
        </div>
      )}

      {tab === 'settlement' && settlement && (
        <div className="space-y-4">
          <SettlementSharePanel
            eventName={data.event.name}
            currency={currency}
            totalSpend={summary?.totalSpend}
            transfers={settlement.transfers}
            pendingCount={settlement.pendingCount ?? 0}
          />

          {settlement.transfers.length === 0 ? (
            <div className="card p-6 text-center text-gray-500">Everyone is settled up — no payments needed.</div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm px-1">
                <span className="text-gray-500">
                  {settlement.settledCount ?? 0} of {settlement.transfers.length} marked paid
                  {selectedTransferRows.size > 0 && (
                    <span className="text-brand-600 dark:text-brand-400">
                      {' '}· {selectedTransferRows.size} selected
                    </span>
                  )}
                </span>
                {settlement.allSettled && (
                  <span className="text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                    <Check size={14} />
                    All done
                  </span>
                )}
              </div>

              {settleError && (
                <p className="text-sm text-red-600 dark:text-red-400 px-1">{settleError}</p>
              )}

              <div className="card p-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary text-sm py-1.5"
                  disabled={selectedTransferRows.size === 0 || applySettledMut.isPending}
                  onClick={() => applySettledMut.mutate({ transfers: getSelectedTransfers(), settled: true })}
                >
                  <Check size={14} />
                  Mark selected as paid
                </button>
                <button
                  type="button"
                  className="btn-secondary text-sm py-1.5"
                  disabled={selectedTransferRows.size === 0 || applySettledMut.isPending}
                  onClick={() => applySettledMut.mutate({ transfers: getSelectedTransfers(), settled: false })}
                >
                  Mark selected as unpaid
                </button>
                <button
                  type="button"
                  className="btn-secondary text-sm py-1.5"
                  onClick={() => {
                    setSelectedTransferRows(
                      new Set(
                        settlement.transfers
                          .map((t, index) => (!t.settled ? transferRowId(index) : null))
                          .filter(Boolean)
                      )
                    );
                  }}
                >
                  Select all pending
                </button>
                <button
                  type="button"
                  className="btn-secondary text-sm py-1.5"
                  disabled={selectedTransferRows.size === 0}
                  onClick={() => setSelectedTransferRows(new Set())}
                >
                  Clear selection
                </button>
              </div>

              <ul className="space-y-2">
                {(settlement.transfers ?? []).map((t, index) => {
                  const rowId = transferRowId(index);
                  const rowSelected = selectedTransferRows.has(rowId);
                  return (
                  <li
                    key={rowId}
                    className={clsx(
                      'card p-4 flex flex-col sm:flex-row sm:items-center gap-3',
                      t.settled && 'border-green-200 dark:border-green-900/50 bg-green-50/30 dark:bg-green-900/10',
                      rowSelected && 'ring-2 ring-brand-500/40'
                    )}
                  >
                    <label className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-1 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        checked={rowSelected}
                        disabled={applySettledMut.isPending}
                        onChange={() => toggleTransferSelect(rowId)}
                      />
                      <div className="min-w-0">
                        <p className="text-gray-900 dark:text-white">
                          <span className={clsx('font-semibold', t.settled && 'text-gray-500')}>
                            {t.fromName}
                          </span>
                          <span className="text-gray-500 mx-2">pays</span>
                          <span className={clsx('font-semibold', t.settled && 'text-gray-500')}>
                            {t.toName}
                          </span>
                        </p>
                        {t.settled && t.settledAt && (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-0.5 flex items-center gap-1">
                            <Check size={12} />
                            Paid · {t.settledAt.slice(0, 10)}
                          </p>
                        )}
                        {!t.settled && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1">
                            <Circle size={10} />
                            Pending
                          </p>
                        )}
                      </div>
                    </label>
                    <div className="flex items-center gap-2 shrink-0 sm:flex-col sm:items-end">
                      <p className={clsx(
                        'text-lg font-bold',
                        t.settled ? 'text-gray-500' : 'text-brand-600 dark:text-brand-400'
                      )}>
                        {fmt(t.amount, currency)}
                      </p>
                      {!t.settled ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                          disabled={applySettledMut.isPending || !isValidTransfer(t)}
                          onClick={() => applySettledMut.mutate({
                            transfers: [transferToPayload(t)],
                            settled: true,
                          })}
                        >
                          Mark paid
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-xs font-medium text-gray-500 hover:underline"
                          disabled={applySettledMut.isPending || !isValidTransfer(t)}
                          onClick={() => applySettledMut.mutate({
                            transfers: [transferToPayload(t)],
                            settled: false,
                          })}
                        >
                          Mark unpaid
                        </button>
                      )}
                    </div>
                  </li>
                  );
                })}
              </ul>
            </>
          )}
          <p className="text-xs text-gray-500">
            Simplified payment plan — fewer transfers than settling every pairwise balance. Tick when paid in real life.
          </p>
        </div>
      )}
    </div>
  );
}
