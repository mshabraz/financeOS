import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Plus, Download, History, Pencil } from 'lucide-react';
import clsx from 'clsx';
import {
  getInvestmentTransactions, updateInvestmentTransaction, exportInvestmentTransactionsCSV,
  createManualInvestmentTransaction, deleteInvestmentTransaction, getInvestmentTransactionAudit,
} from '../../../api/client';
import LoadingSpinner from '../../ui/LoadingSpinner';
import UserNoteField from '../../transactions/UserNoteField';
import ManualInvestmentTransactionModal from '../ManualInvestmentTransactionModal';
import InvestmentTabFilters from '../filters/InvestmentTabFilters';
import { BROKER_COLORS, BROKER_LABELS } from '../constants';
import { fmt } from '../investmentPageFmt';

export default function InvestmentLedger({ brokerFilter }) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [hasNotesOnly, setHasNotesOnly] = useState(false);
  const [sourceType, setSourceType] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [auditTx, setAuditTx] = useState(null);
  const [manualFormError, setManualFormError] = useState('');
  const brokerOptions = Object.entries(BROKER_LABELS);
  const [localBroker, setLocalBroker] = useState('');
  const effectiveBroker = brokerFilter || localBroker;

  const invalidateInvestmentQueries = () => {
    ['invTx', 'invHoldings', 'invValuations', 'invAnalytics', 'invDividends', 'assets', 'yahooHealth'].forEach((k) => {
      qc.invalidateQueries({ queryKey: [k] });
    });
  };

  const list = useQuery({
    queryKey: ['invTx', page, search, effectiveBroker, hasNotesOnly, sourceType],
    queryFn: () =>
      getInvestmentTransactions({
        page,
        limit: 50,
        search: search.trim() || undefined,
        broker: effectiveBroker || undefined,
        hasNotes: hasNotesOnly ? '1' : undefined,
        sourceType: sourceType || undefined,
      }),
  });

  const notesMut = useMutation({
    mutationFn: ({ id, notes }) => updateInvestmentTransaction(id, { notes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invTx'] }),
  });
  const manualMut = useMutation({
    mutationFn: ({ id, ...body }) =>
      id ? updateInvestmentTransaction(id, body) : createManualInvestmentTransaction(body),
    onSuccess: (res) => {
      if (res?.duplicateWarning) {
        setManualFormError('Potential duplicate detected. The transaction was still saved; please verify holdings/activity.');
      } else {
        setManualFormError('');
      }
      setManualOpen(false);
      setEditingTx(null);
      invalidateInvestmentQueries();
    },
    onError: (err) => setManualFormError(err.message || 'Failed to save manual transaction'),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => deleteInvestmentTransaction(id),
    onSuccess: () => {
      setManualOpen(false);
      setEditingTx(null);
      setManualFormError('');
      invalidateInvestmentQueries();
    },
    onError: (err) => setManualFormError(err.message || 'Failed to delete transaction'),
  });

  const auditQ = useQuery({
    queryKey: ['invTxAudit', auditTx?.id],
    queryFn: () => {
      if (!auditTx?.id) return Promise.resolve([]);
      return getInvestmentTransactionAudit(auditTx.id);
    },
    enabled: !!auditTx?.id,
  });

  const handleExport = async () => {
    const res = await exportInvestmentTransactionsCSV();
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'investment-transactions.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const rows = (list.data?.data ?? []).filter(Boolean);
  const openCreate = () => {
    setManualFormError('');
    setEditingTx(null);
    setManualOpen(true);
  };
  const openEdit = (tx) => {
    setManualFormError('');
    setEditingTx(tx);
    setManualOpen(true);
  };
  const handleManualSubmit = async (form) => {
    const payload = {
      type: form.type,
      ticker: form.ticker || null,
      isin: form.isin || null,
      fundName: form.fundName || null,
      quantity: form.quantity === '' ? null : Number(form.quantity),
      pricePerShare: form.pricePerShare === '' ? null : Number(form.pricePerShare),
      totalCost: form.totalCost === '' ? null : Number(form.totalCost),
      date: form.date,
      broker: form.broker,
      brokerAccountId: form.brokerAccountId || null,
      fee: form.fee === '' ? 0 : Number(form.fee),
      taxAmount: form.taxAmount === '' ? 0 : Number(form.taxAmount),
      currency: form.currency,
      notes: form.notes || null,
      reference: form.reference || null,
      rawDetails: form.rawDetails || null,
      rawType: form.rawType || null,
    };
    await manualMut.mutateAsync({ id: form.id, ...payload });
  };
  const handleDelete = async (form) => {
    if (!form?.id) return;
    if (!window.confirm('Delete this manual investment transaction permanently?')) return;
    await deleteMut.mutateAsync(form.id);
  };

  return (
    <div className="space-y-4">
      <ManualInvestmentTransactionModal
        open={manualOpen}
        initial={editingTx}
        brokerOptions={brokerOptions}
        onClose={() => { setManualOpen(false); setEditingTx(null); setManualFormError(''); }}
        onSubmit={handleManualSubmit}
        onDelete={handleDelete}
        saving={manualMut.isPending}
        deleting={deleteMut.isPending}
      />
      {auditTx && (
        <div className="fixed inset-0 z-50 bg-black/50 p-3 sm:p-6 flex items-end sm:items-center justify-center" onClick={() => setAuditTx(null)}>
          <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Transaction Audit History · #{auditTx.id}</h3>
              <button type="button" className="text-gray-400 hover:text-gray-600" onClick={() => setAuditTx(null)}>Close</button>
            </div>
            <div className="p-4 max-h-[65vh] overflow-y-auto">
              {auditQ.isLoading ? (
                <LoadingSpinner />
              ) : (
                <div className="space-y-2">
                  {(auditQ.data || []).map((a) => (
                    <div key={a.id} className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 text-xs">
                      <p className="font-medium text-gray-800 dark:text-gray-200">
                        {a.action} · {a.changed_at}
                      </p>
                      {!!a.changed_fields?.length && (
                        <p className="text-gray-500 mt-1">Fields: {a.changed_fields.join(', ')}</p>
                      )}
                    </div>
                  ))}
                  {!auditQ.data?.length && <p className="text-xs text-gray-400">No audit entries yet.</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-3xl">
          Broker trades and cash flows from imports and manual entries. Manual rows flow through the same holdings, valuation, and analytics pipeline.
        </p>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button type="button" onClick={openCreate} className="btn-primary gap-2 w-full sm:w-auto">
            <Plus size={15} /> Add Investment Transaction
          </button>
          <button type="button" onClick={handleExport} className="btn-secondary gap-2 w-full sm:w-auto shrink-0">
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>
      {manualFormError && <p className="text-xs text-red-500">{manualFormError}</p>}
      <InvestmentTabFilters
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search ticker, ISIN, details, notes…"
        brokerFilter={brokerFilter || localBroker}
        onBrokerChange={brokerFilter ? undefined : (v) => { setLocalBroker(v); setPage(1); }}
        showBroker={!brokerFilter}
        sourceType={sourceType}
        onSourceTypeChange={(v) => { setSourceType(v); setPage(1); }}
        showSource
        hasNotesOnly={hasNotesOnly}
        onHasNotesOnlyChange={(v) => { setHasNotesOnly(v); setPage(1); }}
        showNotes
      />
      <div className="card overflow-hidden">
        {list.isLoading ? (
          <LoadingSpinner />
        ) : (
          <>
          <ul className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map((r) => (
              <li key={r.id} className="px-4 py-3 space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-brand-600">{r.ticker || '—'}</span>
                  <span className="text-sm font-medium tabular-nums">{fmt(r.net_amount, r.currency)}</span>
                </div>
                <p className="text-xs text-gray-500">{r.date} · {BROKER_LABELS[r.broker] || r.broker} · {r.type}</p>
                {r.notes && <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{r.notes}</p>}
              </li>
            ))}
          </ul>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm min-w-[1120px]">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  {['Date', 'Broker', 'Source', 'Type', 'Ticker', 'Net', 'Fee', 'Your note', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{r.date}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className="text-xs px-1.5 py-0.5 rounded font-medium text-white"
                        style={{ background: BROKER_COLORS[r.broker] || '#94a3b8' }}
                      >
                        {BROKER_LABELS[r.broker] || r.broker}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={clsx(
                        'text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide font-semibold',
                        (r.manual_transaction === 1 || r.source_type === 'manual')
                          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                      )}>
                        {(r.manual_transaction === 1 || r.source_type === 'manual') ? 'Manual' : 'Imported'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{r.type}</td>
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-brand-600">{r.ticker || '—'}</td>
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">{fmt(r.net_amount, r.currency)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{fmt(r.fee, r.currency)}</td>
                    <td className="px-4 py-2.5 max-w-[240px] align-top">
                      <UserNoteField
                        value={r.notes}
                        onSave={(v) => notesMut.mutate({ id: r.id, notes: v })}
                        placeholder="Your note"
                        multiline={false}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-xs text-gray-500 hover:text-brand-600 inline-flex items-center gap-1"
                          onClick={() => setAuditTx(r)}
                          title="View audit history"
                        >
                          <History size={12} /> History
                        </button>
                        {(r.manual_transaction === 1 || r.source_type === 'manual') && (
                          <button
                            type="button"
                            className="text-xs text-gray-500 hover:text-brand-600 inline-flex items-center gap-1"
                            onClick={() => openEdit(r)}
                            title="Edit manual transaction"
                          >
                            <Pencil size={12} /> Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">
                      No rows match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </>
        )}
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center gap-2 justify-between text-xs text-gray-500">
          <span>
            Page {list.data?.page ?? 1} / {list.data?.totalPages ?? 1} · {list.data?.total ?? 0} rows
          </span>
          <div className="flex gap-1 justify-end">
            <button
              type="button"
              disabled={page <= 1}
              className="btn-ghost p-1.5 disabled:opacity-40"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <button
              type="button"
              disabled={page >= (list.data?.totalPages ?? 1)}
              className="btn-ghost p-1.5 disabled:opacity-40"
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
