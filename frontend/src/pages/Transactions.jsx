import { useState, useMemo, Fragment, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, Download, ChevronLeft, ChevronRight, Check, X,
  Tag, Layers, AlertCircle, ChevronDown, ChevronRight as ChevronRt, Copy, Upload, Trash2,
} from 'lucide-react';
import {
  getTransactions, updateTransaction, getCategories,
  exportTransactionsCSV, getTags, assignTag, removeTag, assignRevolutTag, removeRevolutTag,
  bulkCategorizePrev, bulkCategorizeApply, bulkUpdateCategory, bulkAssignTag, bulkDeleteTransactions,
} from '../api/client';
import TransactionSourceBadges, { TransactionAmountDetail } from '../components/transactions/TransactionSourceBadges';
import CategoryBadge from '../components/ui/CategoryBadge';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import QueryErrorPanel from '../components/ui/QueryErrorPanel';
import PageHeader from '../components/ui/PageHeader';
import MonthFilterSelect from '../components/ui/MonthFilterSelect';
import DatePicker from '../components/ui/DatePicker';
import TransactionImportPanel from '../components/transactions/TransactionImportPanel';
import UserNoteField from '../components/transactions/UserNoteField';
import { getMonthRange } from '../utils/dateFilters';
import { fmtCurrency, privText } from '../utils/displayFormat';
import { usePrivacy } from '../context/PrivacyContext';
import clsx from 'clsx';

const fmt = (n) => fmtCurrency(n, 'EUR', { abs: true });

// ── Bulk categorize modal ─────────────────────────────────────────────────────
// Lets the user apply a category to a batch of similar/exact transactions at
// once. Rules are managed separately on the Categories page.
function BulkCategorizeModal({ merchant, onClose, onApplied }) {
  usePrivacy();
  const [mode, setMode]         = useState('similar');
  const [catId, setCatId]       = useState('');
  const [applying, setApplying] = useState(false);

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: getCategories });
  const preview = useQuery({
    queryKey: ['bulkPrev', merchant, mode],
    queryFn: () => bulkCategorizePrev({ merchant, exactOnly: mode === 'exact' }),
    enabled: !!merchant,
  });

  const handleApply = async () => {
    if (!catId || !preview.data?.transactions?.length) return;
    setApplying(true);
    try {
      const ids = preview.data.transactions.map((t) => t.id);
      await bulkCategorizeApply({ transactionIds: ids, categoryId: parseInt(catId) });
      onApplied?.(); onClose();
    } finally { setApplying(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-panel space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Apply category to similar</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Merchant: <span className="font-mono">{privText(merchant)}</span></p>
        </div>
        <div className="flex gap-2">
          {[['exact','Exact matches only'],['similar','Similar merchants']].map(([val, label]) => (
            <button key={val} onClick={() => setMode(val)}
              className={clsx('flex-1 py-2 rounded-lg text-sm font-medium border transition-colors',
                mode === val ? 'bg-brand-600 border-brand-600 text-white' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
              )}
            >{label}</button>
          ))}
        </div>
        {preview.isLoading ? <LoadingSpinner /> : (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800 flex items-center gap-2">
              <AlertCircle size={14} className="text-amber-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{preview.data?.count ?? 0} matching transactions</span>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-40 overflow-y-auto">
              {preview.data?.examples?.map((tx) => (
                <div key={tx.id} className="flex justify-between px-4 py-2 text-sm">
                  <span className="text-gray-700 dark:text-gray-300 truncate">{privText(tx.merchant)}</span>
                  <span className="text-gray-500 ml-4 whitespace-nowrap">{tx.date} · {fmt(tx.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <select value={catId} onChange={(e) => setCatId(e.target.value)} className="input w-full">
          <option value="">Select new category...</option>
          {categories?.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
        <p className="text-xs text-gray-400">
          To make this categorization apply to future imports, create a rule on the Categories page.
        </p>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleApply} disabled={!catId || applying || !preview.data?.count} className="btn-primary flex-1">
            {applying ? 'Applying...' : `Apply to ${preview.data?.count ?? 0} transactions`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tag chip ──────────────────────────────────────────────────────────────────
function TagChip({ tag, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium"
      style={{ background: `${tag.color}25`, color: tag.color }}>
      {tag.name}
      {onRemove && <button onClick={onRemove} className="hover:opacity-70 ml-0.5"><X size={9} /></button>}
    </span>
  );
}

// ── Expanded detail row ───────────────────────────────────────────────────────
function txnKey(tx) {
  return tx.id ?? (tx.source === 'revolut' ? `r${tx.revolut_id}` : tx.bank_id);
}

function isRevolutId(id) {
  return String(id).startsWith('r');
}

function revolutNumericId(txOrId) {
  if (typeof txOrId === 'object') {
    return txOrId.revolut_id ?? parseInt(String(txOrId.id).replace(/^r/, ''), 10);
  }
  return parseInt(String(txOrId).slice(1), 10);
}

function splitSelectedIds(selected) {
  const bankIds = [];
  const revolutIds = [];
  for (const id of selected) {
    if (isRevolutId(id)) revolutIds.push(revolutNumericId(id));
    else bankIds.push(parseInt(id, 10));
  }
  return { bankIds, revolutIds };
}

function signedAnalyticsAmount(tx) {
  const raw = tx.exclude_from_analytics ? 0 : (tx.effective_amount ?? tx.amount ?? 0);
  return tx.direction === 'K' ? Math.abs(raw) : -Math.abs(raw);
}

function ExpandedRow({ tx, colSpan, onSaveNote, onRevolutPatch }) {
  const copy = (text) => navigator.clipboard?.writeText(text);
  const [splitRatio, setSplitRatio] = useState(tx.split_ratio ?? 0.5);
  const [excludeAnalytics, setExcludeAnalytics] = useState(!!tx.exclude_from_analytics);

  useEffect(() => {
    setSplitRatio(tx.split_ratio ?? 0.5);
    setExcludeAnalytics(!!tx.exclude_from_analytics);
  }, [tx.id, tx.split_ratio, tx.exclude_from_analytics]);

  const fields = [
    { label: 'Merchant',         value: tx.merchant },
    { label: 'Beneficiary',      value: tx.beneficiary },
    { label: 'Details',          value: tx.details },
    { label: 'Transfer Ref',     value: tx.transfer_ref },
    { label: 'Transaction Type', value: tx.transaction_type },
    { label: 'Account',          value: tx.account || tx.beneficiary_account },
  ].filter((f) => f.value);

  return (
    <tr className="bg-gray-50 dark:bg-gray-800/60">
      <td colSpan={colSpan} className="px-4 py-3">
        <div className="mb-3">
          <TransactionSourceBadges tx={tx} />
        </div>
        <div className="mb-4 max-w-2xl">
          <TransactionAmountDetail tx={tx} />
        </div>
        {tx.source === 'revolut' && onRevolutPatch && (
          <div className="mb-4 max-w-md space-y-3 rounded-lg border border-purple-200 dark:border-purple-800 p-3 bg-purple-50/30 dark:bg-purple-950/20">
            <p className="text-xs font-semibold text-purple-800 dark:text-purple-200">Revolut analytics</p>
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={excludeAnalytics}
                onChange={(e) => setExcludeAnalytics(e.target.checked)}
              />
              Exclude from analytics (e.g. top-ups / transfers)
            </label>
            {!excludeAnalytics && (
              <label className="block text-xs">
                <span className="text-gray-500">Expense split ratio (0–1)</span>
                <input
                  type="number"
                  min={0.05}
                  max={1}
                  step={0.05}
                  className="input w-full mt-1"
                  value={splitRatio}
                  onChange={(e) => setSplitRatio(Number(e.target.value))}
                />
              </label>
            )}
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() =>
                onRevolutPatch({
                  splitRatio: excludeAnalytics ? null : splitRatio,
                  excludeFromAnalytics: excludeAnalytics,
                })
              }
            >
              Save Revolut settings
            </button>
          </div>
        )}
        <div className="mb-4 max-w-2xl">
          <p className="text-xs font-medium text-gray-500 mb-1">Your note</p>
          <UserNoteField
            value={tx.notes}
            onSave={(v) => onSaveNote(v)}
            placeholder="What was this for?"
            multiline
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2">
          {fields.map(({ label, value }) => (
            <div key={label} className="flex items-start gap-2 min-w-0">
              <span className="text-xs font-medium text-gray-400 w-28 flex-shrink-0 mt-0.5">{label}</span>
              <div className="flex items-start gap-1 flex-1 min-w-0">
                <span className="text-xs text-gray-700 dark:text-gray-200 break-all leading-relaxed">{privText(value)}</span>
                <button
                  onClick={() => copy(value)}
                  className="flex-shrink-0 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 mt-0.5"
                  title="Copy"
                  type="button"
                >
                  <Copy size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </td>
    </tr>
  );
}

// ── Main Transactions page ────────────────────────────────────────────────────
export default function Transactions() {
  usePrivacy();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'import' ? 'import' : 'list';
  const setTab = (t) => {
    const next = new URLSearchParams(searchParams);
    if (t === 'import') next.set('tab', 'import');
    else next.delete('tab');
    setSearchParams(next, { replace: true });
  };

  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [category, setCategory] = useState('');
  const [direction, setDir]     = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [dateFrom, setFrom]     = useState('');
  const [dateTo, setTo]         = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [hasNotesOnly, setHasNotesOnly] = useState(false);
  const [editId, setEditId]     = useState(null);
  const [editCat, setEditCat]   = useState('');
  const [tagEditId, setTagEditId] = useState(null);
  const [newTagId, setNewTagId] = useState('');
  const [expandedId, setExpandedId] = useState(null); // ← expanded row
  const [selected, setSelected] = useState(new Set());
  const [bulkCatId, setBulkCatId] = useState('');
  const [bulkTagId, setBulkTagId] = useState('');
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkTagApplying, setBulkTagApplying] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkModal, setBulkModal] = useState(null);
  const [bulkError, setBulkError] = useState('');

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: getCategories });
  const { data: allTags }    = useQuery({ queryKey: ['tags'],       queryFn: getTags });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['transactions', page, search, category, direction, dateFrom, dateTo, tagFilter, sourceFilter, hasNotesOnly],
    queryFn: () => getTransactions({
      page, limit: 50, search,
      category: category || undefined,
      direction: direction || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      tag: tagFilter || undefined,
      source: sourceFilter || undefined,
      hasNotes: hasNotesOnly ? '1' : undefined,
    }),
  });

  const selectedSum = useMemo(() => {
    if (!selected.size || !data?.data) return 0;
    return data.data
      .filter((tx) => selected.has(txnKey(tx)))
      .reduce((sum, tx) => sum + signedAnalyticsAmount(tx), 0);
  }, [selected, data]);

  const updateMut = useMutation({
    mutationFn: ({ id, categoryId }) => updateTransaction(id, { categoryId: parseInt(categoryId) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transactions'] }); setEditId(null); },
  });

  const assignTagMut = useMutation({
    mutationFn: ({ txId, tagId, source }) =>
      source === 'revolut' || isRevolutId(txId)
        ? assignRevolutTag(revolutNumericId(txId), tagId)
        : assignTag(txId, tagId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  });

  const removeTagMut = useMutation({
    mutationFn: ({ txId, tagId, source }) =>
      source === 'revolut' || isRevolutId(txId)
        ? removeRevolutTag(revolutNumericId(txId), tagId)
        : removeTag(txId, tagId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  });

  const notesMut = useMutation({
    mutationFn: ({ id, notes }) => updateTransaction(id, { notes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  });

  const revolutPatchMut = useMutation({
    mutationFn: ({ id, ...body }) => updateTransaction(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['summary'] });
      qc.invalidateQueries({ queryKey: ['trend'] });
      qc.invalidateQueries({ queryKey: ['bycat'] });
    },
  });

  const handleExport = async () => {
    const res = await exportTransactionsCSV();
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a'); a.href = url; a.download = 'transactions.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSelect = (id) => setSelected((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const selectAll = () => setSelected(new Set(data?.data?.map((r) => txnKey(r)) ?? []));
  const clearSel  = () => setSelected(new Set());

  const applyBulkCategory = async () => {
    if (!bulkCatId || !selected.size) return;
    setBulkApplying(true);
    setBulkError('');
    try {
      const result = await bulkUpdateCategory([...selected], parseInt(bulkCatId, 10));
      if (result?.updated === 0) {
        setBulkError('No transactions were updated. Try again or refresh the page.');
        return;
      }
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      clearSel();
    } catch (err) {
      setBulkError(err.message || 'Failed to apply category');
    } finally {
      setBulkApplying(false);
    }
  };

  const applyBulkTag = async () => {
    const { bankIds, revolutIds } = splitSelectedIds(selected);
    if (!bulkTagId || (!bankIds.length && !revolutIds.length)) return;
    setBulkTagApplying(true);
    try {
      await bulkAssignTag(parseInt(bulkTagId, 10), bankIds, revolutIds);
      qc.invalidateQueries({ queryKey: ['transactions'] }); clearSel();
    } finally { setBulkTagApplying(false); }
  };

  const invalidateAfterTxnDelete = () => {
    qc.invalidateQueries({ queryKey: ['transactions'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['trend'] });
    qc.invalidateQueries({ queryKey: ['bycat'] });
    qc.invalidateQueries({ queryKey: ['byincome'] });
    qc.invalidateQueries({ queryKey: ['merchants'] });
    qc.invalidateQueries({ queryKey: ['recurring'] });
    qc.invalidateQueries({ queryKey: ['tagSummary'] });
    qc.invalidateQueries({ queryKey: ['tagAnalytics'] });
  };

  const applyBulkDelete = async () => {
    if (!selected.size) return;
    const n = selected.size;
    const msg = n === 1
      ? 'Delete 1 selected transaction permanently? This cannot be undone.'
      : `Delete ${n} selected transactions permanently? This cannot be undone.`;
    if (!window.confirm(msg)) return;

    setBulkDeleting(true);
    setBulkError('');
    try {
      const result = await bulkDeleteTransactions([...selected]);
      if (result?.deleted === 0) {
        setBulkError('No transactions were deleted. Try again or refresh the page.');
        return;
      }
      invalidateAfterTxnDelete();
      setExpandedId(null);
      clearSel();
    } catch (err) {
      const msg = err.message || 'Failed to delete transactions';
      setBulkError(
        msg.includes('404')
          ? 'Delete API not available on the server (backend may need a restart after deploy). The transactions were not removed.'
          : msg
      );
    } finally {
      setBulkDeleting(false);
    }
  };

  const onMonthChange = (v) => {
    setFilterMonth(v);
    if (v) {
      const { dateFrom: f, dateTo: t } = getMonthRange(v);
      setFrom(f);
      setTo(t);
    } else {
      setFrom('');
      setTo('');
    }
    setPage(1);
  };

  const resetFilters = () => {
    setSearch(''); setCategory(''); setDir(''); setFilterMonth('');
    setFrom(''); setTo(''); setTagFilter(''); setSourceFilter(''); setHasNotesOnly(false); setPage(1);
  };

  const selectedSplit = useMemo(() => splitSelectedIds(selected), [selected]);

  const toggleExpand = (id) => setExpandedId((prev) => prev === id ? null : id);

  const COL_COUNT = 9; // checkbox + date + merchant + note + amount + category + tags + expand + edit

  return (
    <div className="space-y-4">
      {bulkModal && (
        <BulkCategorizeModal
          merchant={bulkModal}
          onClose={() => setBulkModal(null)}
          onApplied={() => qc.invalidateQueries({ queryKey: ['transactions'] })}
        />
      )}

      {tab === 'list' && isError && (
        <QueryErrorPanel
          title="Could not load transactions"
          message={error?.message}
          onRetry={() => refetch()}
        />
      )}

      <PageHeader
        title="Transactions"
        subtitle={tab === 'list' ? `${data?.total ?? 0} bank + Revolut · Revolut expenses counted at 50% in analytics` : 'Import or export bank and Revolut CSV'}
      >
        {tab === 'list' && (
          <button type="button" onClick={handleExport} className="btn-secondary gap-2 w-full sm:w-auto">
            <Download size={15} />Export CSV
          </button>
        )}
      </PageHeader>

      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-full sm:w-auto">
        {[
          { id: 'list', label: 'List' },
          { id: 'import', label: 'Import / Export', icon: Upload },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={clsx(
              'flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px]',
              tab === id
                ? 'bg-white dark:bg-gray-900 text-brand-600 shadow-sm'
                : 'text-gray-600 dark:text-gray-400'
            )}
          >
            {Icon && <Icon size={16} />}
            {label}
          </button>
        ))}
      </div>

      {tab === 'import' ? (
        <TransactionImportPanel />
      ) : (
      <>
      {/* Filters */}
      <div className="card p-4 space-y-2">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <div className="relative col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search merchant, details, your notes…"
              value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="input pl-8" />
          </div>
          <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className="input">
            <option value="">All categories</option>
            {categories?.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          <select value={direction} onChange={(e) => { setDir(e.target.value); setPage(1); }} className="input">
            <option value="">All</option>
            <option value="D">Expenses</option>
            <option value="K">Income</option>
          </select>
          <select value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }} className="input">
            <option value="">All sources</option>
            <option value="bank">Bank only</option>
            <option value="revolut">Revolut only</option>
          </select>
          <MonthFilterSelect value={filterMonth} onChange={onMonthChange} className="input col-span-2 sm:col-span-1" />
          <DatePicker
            value={dateFrom}
            onChange={(v) => { setFilterMonth(''); setFrom(v); setPage(1); }}
            placeholder="From"
            className="col-span-1"
          />
          <DatePicker
            value={dateTo}
            onChange={(v) => { setFilterMonth(''); setTo(v); setPage(1); }}
            placeholder="To"
            className="col-span-1"
          />
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Tag size={13} className="text-gray-400" />
          <select value={tagFilter} onChange={(e) => { setTagFilter(e.target.value); setPage(1); }} className="input w-44 text-xs">
            <option value="">Filter by tag...</option>
            {allTags?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer touch-manipulation">
            <input
              type="checkbox"
              checked={hasNotesOnly}
              onChange={(e) => { setHasNotesOnly(e.target.checked); setPage(1); }}
              className="rounded border-gray-300 w-4 h-4"
            />
            Has my note
          </label>
          {(search || category || direction || sourceFilter || filterMonth || dateFrom || dateTo || tagFilter || hasNotesOnly) && (
            <button onClick={resetFilters} className="btn-ghost text-xs text-gray-400">Clear filters</button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <>
        <div className="card p-3 bg-brand-50 dark:bg-brand-900/20 border-brand-200 dark:border-brand-800 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-brand-700 dark:text-brand-300">
            <Layers size={14} className="inline mr-1" />
            {selected.size} selected
            <span className={clsx('ml-2 font-semibold', selectedSum >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600')}>
              (analytics {selectedSum >= 0 ? '+' : ''}{fmt(selectedSum)})
            </span>
            {selectedSplit.revolutIds.length > 0 && (
              <span className="text-xs text-gray-500 ml-1">
                · {selectedSplit.bankIds.length} bank, {selectedSplit.revolutIds.length} Revolut
              </span>
            )}
          </span>
          <select value={bulkCatId} onChange={(e) => setBulkCatId(e.target.value)} className="input py-1 text-xs w-44">
            <option value="">Set category...</option>
            {categories?.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          <button
            onClick={applyBulkCategory}
            disabled={!bulkCatId || bulkApplying}
            className="btn-primary py-1.5 text-xs"
          >
            {bulkApplying ? 'Applying...' : 'Apply category'}
          </button>
          <select value={bulkTagId} onChange={(e) => setBulkTagId(e.target.value)} className="input py-1 text-xs w-36">
            <option value="">Assign tag...</option>
            {allTags?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button onClick={applyBulkTag} disabled={!bulkTagId || bulkTagApplying} className="btn-secondary py-1.5 text-xs">
            {bulkTagApplying ? 'Tagging...' : 'Apply tag'}
          </button>
          <button
            type="button"
            onClick={applyBulkDelete}
            disabled={bulkDeleting || bulkApplying || bulkTagApplying}
            className="inline-flex items-center gap-1 py-1.5 px-3 rounded-lg text-xs font-medium border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 disabled:opacity-50"
          >
            <Trash2 size={14} />
            {bulkDeleting ? 'Deleting...' : 'Delete'}
          </button>
          <button onClick={clearSel} className="btn-ghost py-1.5 text-xs text-gray-400">Clear</button>
        </div>
        {bulkError && (
          <p className="text-xs text-red-600 dark:text-red-400 px-1">{bulkError}</p>
        )}
        </>
      )}

      {/* Mobile list */}
      <div className="md:hidden card overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
        {isLoading ? <LoadingSpinner /> : !data?.data?.length ? (
          <p className="p-6 text-sm text-gray-400 text-center">No transactions</p>
        ) : data.data.map((tx) => {
          const rowId = txnKey(tx);
          return (
          <div key={rowId} className={clsx('p-4', selected.has(rowId) && 'bg-brand-50/50 dark:bg-brand-900/10')}>
            <div className="flex gap-3">
              <input type="checkbox" checked={selected.has(rowId)} onChange={() => toggleSelect(rowId)} className="mt-1 rounded w-5 h-5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <button type="button" className="w-full text-left" onClick={() => toggleExpand(rowId)}>
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">{privText(tx.merchant || tx.beneficiary || '—')}</p>
                      <p className="text-xs text-gray-400">{tx.date}</p>
                      <TransactionSourceBadges tx={tx} className="mt-1" />
                    </div>
                    <p className={clsx('font-semibold whitespace-nowrap', tx.direction === 'K' ? 'text-green-600' : 'text-gray-900 dark:text-white')}>
                      {tx.direction === 'K' ? '+' : '-'}{fmt(tx.amount)}
                    </p>
                  </div>
                </button>
                <div className="mt-2 flex flex-wrap gap-2 items-center">
                  {editId === rowId ? (
                    <>
                      <select value={editCat} onChange={(e) => setEditCat(e.target.value)} className="input flex-1 min-w-0 text-sm">
                        {categories?.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                      </select>
                      <button type="button" onClick={() => updateMut.mutate({ id: rowId, categoryId: editCat })} className="btn-primary px-3"><Check size={16}/></button>
                      <button type="button" onClick={() => setEditId(null)} className="btn-secondary px-3"><X size={16}/></button>
                    </>
                  ) : (
                    <button type="button" onClick={() => { setEditId(rowId); setEditCat(tx.category_id ?? ''); }}>
                      <CategoryBadge icon={tx.category_icon} name={tx.category_name} color={tx.category_color} />
                    </button>
                  )}
                  {tx.tags?.map((tag) => (
                    <TagChip key={tag.id} tag={tag} onRemove={() => removeTagMut.mutate({ txId: rowId, tagId: tag.id, source: tx.source })} />
                  ))}
                </div>
                <div className="mt-2">
                  <UserNoteField
                    value={tx.notes}
                    onSave={(v) => notesMut.mutate({ id: rowId, notes: v })}
                    placeholder="Your note"
                    multiline
                  />
                </div>
                {expandedId === rowId && (
                  <div className="mt-3 space-y-2">
                    <TransactionAmountDetail tx={tx} />
                    {tx.details && <p className="text-xs text-gray-500 break-words">{tx.details}</p>}
                  </div>
                )}
              </div>
            </div>
          </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block card overflow-hidden">
        {isLoading ? <LoadingSpinner /> : (
          <>
            <div className="table-scroll">
              <table className="w-full text-sm min-w-[920px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <th className="px-4 py-3 w-8">
                      <input type="checkbox"
                        checked={selected.size === data?.data?.length && data?.data?.length > 0}
                        onChange={() => selected.size === data?.data?.length ? clearSel() : selectAll()}
                        className="rounded"
                      />
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Merchant / Details</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 max-w-[200px]">Your note</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Amount</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Category</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Tags</th>
                    <th className="w-8"></th>
                    <th className="w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {data?.data?.map((tx) => {
                    const rowId = txnKey(tx);
                    return (
                    <Fragment key={rowId}>
                      {/* ── Main row ── */}
                      <tr
                        className={clsx(
                          'hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors',
                          selected.has(rowId) && 'bg-brand-50 dark:bg-brand-900/10',
                          expandedId === rowId && 'border-b-0'
                        )}
                      >
                        <td className="px-4 py-2.5">
                          <input type="checkbox" checked={selected.has(rowId)} onChange={() => toggleSelect(rowId)} className="rounded" />
                        </td>

                        {/* Date */}
                        <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{tx.date}</td>

                        {/* Merchant + Details — clickable to expand */}
                        <td className="px-4 py-2.5 max-w-xs">
                          <button
                            type="button"
                            className="text-left w-full group"
                            onClick={() => toggleExpand(rowId)}
                            title="Click to expand full details"
                          >
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-gray-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors line-clamp-1">
                                {privText(tx.merchant || tx.beneficiary || '—')}
                              </p>
                              {expandedId === rowId
                                ? <ChevronDown size={12} className="flex-shrink-0 text-brand-500" />
                                : <ChevronRt size={12} className="flex-shrink-0 text-gray-300 dark:text-gray-600 group-hover:text-brand-400" />
                              }
                            </div>
                            <TransactionSourceBadges tx={tx} className="mt-1" />
                            {tx.details && (
                              <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{tx.details}</p>
                            )}
                            {!tx.details && tx.transaction_type && (
                              <p className="text-xs text-gray-300 dark:text-gray-600 capitalize">{tx.transaction_type}</p>
                            )}
                          </button>
                        </td>

                        <td className="px-4 py-2.5 align-top max-w-[200px]">
                          <UserNoteField
                            value={tx.notes}
                            onSave={(v) => notesMut.mutate({ id: rowId, notes: v })}
                            placeholder="Note"
                            multiline={false}
                          />
                        </td>

                        {/* Amount */}
                        <td className={clsx('px-4 py-2.5 text-right font-semibold whitespace-nowrap',
                          tx.direction === 'K' ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white')}>
                          {tx.direction === 'K' ? '+' : '-'}{fmt(tx.amount)}
                        </td>

                        {/* Category */}
                        <td className="px-4 py-2.5">
                          {editId === rowId ? (
                            <div className="flex items-center gap-1">
                              <select value={editCat} onChange={(e) => setEditCat(e.target.value)} className="input py-1 text-xs" autoFocus>
                                {categories?.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                              </select>
                              <button type="button" onClick={() => updateMut.mutate({ id: rowId, categoryId: editCat })} className="p-1 rounded text-green-600 hover:bg-green-50"><Check size={13}/></button>
                              <button type="button" onClick={() => setEditId(null)} className="p-1 rounded text-gray-400 hover:bg-gray-100"><X size={13}/></button>
                              {(tx.merchant || tx.details) && (
                                <button type="button" onClick={() => { setEditId(null); setBulkModal(tx.merchant || tx.details); }}
                                  className="p-1 rounded text-brand-500 hover:bg-brand-50" title="Apply to similar">
                                  <Layers size={13} />
                                </button>
                              )}
                            </div>
                          ) : (
                            <button type="button" onClick={() => { setEditId(rowId); setEditCat(tx.category_id ?? ''); }} className="text-left">
                              <CategoryBadge icon={tx.category_icon} name={tx.category_name} color={tx.category_color} />
                            </button>
                          )}
                        </td>

                        {/* Tags */}
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1 items-center">
                            {tx.tags?.map((tag) => (
                              <TagChip key={tag.id} tag={tag}
                                onRemove={() => removeTagMut.mutate({ txId: rowId, tagId: tag.id, source: tx.source })}
                              />
                            ))}
                            {tagEditId === rowId ? (
                              <div className="flex items-center gap-1">
                                <select value={newTagId} onChange={(e) => setNewTagId(e.target.value)}
                                  className="input py-0.5 text-xs w-28" autoFocus>
                                  <option value="">Tag...</option>
                                  {allTags?.filter((t) => !tx.tags?.find((tt) => tt.id === t.id)).map((t) => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                  ))}
                                </select>
                                <button type="button" onClick={() => { if (newTagId) assignTagMut.mutate({ txId: rowId, tagId: parseInt(newTagId), source: tx.source }); setTagEditId(null); setNewTagId(''); }}
                                  className="p-0.5 rounded text-green-600"><Check size={12}/></button>
                                <button type="button" onClick={() => setTagEditId(null)} className="p-0.5 rounded text-gray-400"><X size={12}/></button>
                              </div>
                            ) : (
                              <button type="button" onClick={() => { setTagEditId(rowId); setNewTagId(''); }}
                                className="text-gray-300 dark:text-gray-600 hover:text-brand-400 dark:hover:text-brand-400">
                                <Tag size={12} />
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Expand toggle */}
                        <td className="px-2 py-2.5">
                          <button type="button" onClick={() => toggleExpand(rowId)}
                            className={clsx('p-1 rounded transition-colors',
                              expandedId === rowId
                                ? 'text-brand-500 bg-brand-50 dark:bg-brand-900/20'
                                : 'text-gray-300 dark:text-gray-600 hover:text-gray-500'
                            )}
                            title="Expand details"
                          >
                            <ChevronDown size={14} className={clsx('transition-transform', expandedId === rowId && 'rotate-180')} />
                          </button>
                        </td>

                        {/* Edit */}
                        <td className="px-4 py-2.5">
                          {editId !== rowId && (
                            <button type="button" onClick={() => { setEditId(rowId); setEditCat(tx.category_id ?? ''); }}
                              className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap">
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* ── Expanded detail row ── */}
                      {expandedId === rowId && (
                        <ExpandedRow
                          tx={tx}
                          colSpan={COL_COUNT}
                          onSaveNote={(v) => notesMut.mutate({ id: rowId, notes: v })}
                          onRevolutPatch={
                            tx.source === 'revolut'
                              ? (body) => revolutPatchMut.mutate({ id: rowId, ...body })
                              : undefined
                          }
                        />
                      )}
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Page {data?.page} of {data?.totalPages} ({data?.total} total)
              </p>
              <div className="flex gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="btn-ghost p-1.5 disabled:opacity-40"><ChevronLeft size={16}/></button>
                <button onClick={() => setPage((p) => Math.min(data?.totalPages ?? 1, p + 1))} disabled={page >= (data?.totalPages ?? 1)}
                  className="btn-ghost p-1.5 disabled:opacity-40"><ChevronRight size={16}/></button>
              </div>
            </div>
          </>
        )}
      </div>
      </>
      )}
    </div>
  );
}
