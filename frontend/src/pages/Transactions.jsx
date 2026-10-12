import { useState, useMemo, Fragment, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, Download, ChevronLeft, ChevronRight, Check, X,
  Tag, Layers, AlertCircle, ChevronDown, ChevronUp, ChevronRight as ChevronRt, Copy, Upload, Trash2, ArrowUpDown, MoreHorizontal, FolderPlus,
  Info, Landmark, FileText,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '../components/ui/DropdownMenu';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../components/ui/Select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/Dialog';
import { Button } from '../components/ui/Button';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/Tabs';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '../components/ui/ContextMenu';
import {
  getTransactions, updateTransaction, getCategories,
  exportTransactionsCSV, getTags, assignTag, removeTag, assignRevolutTag, removeRevolutTag,
  bulkCategorizePrev, bulkCategorizeApply, bulkUpdateCategory, bulkAssignTag, bulkDeleteTransactions,
} from '../api/client';
import TransactionSourceBadges, { TransactionAmountDetail } from '../components/transactions/TransactionSourceBadges';
import MerchantHoverCard from '../components/transactions/MerchantHoverCard';
import CategoryBadge from '../components/ui/CategoryBadge';
import { Badge } from '../components/ui/Badge';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '../components/ui/HoverCard';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import TableSkeleton from '../components/ui/TableSkeleton';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import QueryErrorPanel from '../components/ui/QueryErrorPanel';
import { toast } from '../components/ui/Sonner';
import MonthFilterSelect from '../components/ui/MonthFilterSelect';
import DatePicker from '../components/ui/DatePicker';
import TransactionImportPanel from '../components/transactions/TransactionImportPanel';
import UserNoteField from '../components/transactions/UserNoteField';
import { getMonthRange } from '../utils/dateFilters';
import { usePrivacy } from '../context/PrivacyContext';
import { invalidateDashboardData } from '../lib/queryKeys';
import { useUrlQueryState, useUrlQueryBatch } from '../hooks/useUrlQueryState';
import { fmtCurrency, privText } from '../utils/displayFormat';
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
    <Dialog open={!!merchant} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md p-6 space-y-4">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-white">
            Apply category to similar
          </DialogTitle>
        </DialogHeader>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Merchant: <span className="font-mono">{privText(merchant)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {[['exact', 'Exact matches only'], ['similar', 'Similar merchants']].map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setMode(val)}
              className={clsx(
                'flex-1 py-2 rounded-lg text-sm font-medium border transition-colors',
                mode === val
                  ? 'bg-brand-600 border-brand-600 text-white shadow-sm'
                  : 'border-black/[0.08] dark:border-white/[0.08] bg-white/60 dark:bg-slate-900/40 backdrop-blur-sm text-slate-600 dark:text-slate-400 hover:border-brand-500/50 hover:text-slate-900 dark:hover:text-white'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {preview.isLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="border border-black/[0.06] dark:border-white/[0.08] rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-black/[0.02] dark:bg-white/[0.03] flex items-center gap-2">
              <AlertCircle size={14} className="text-amber-500" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {preview.data?.count ?? 0} matching transactions
              </span>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-40 overflow-y-auto">
              {preview.data?.examples?.map((tx) => (
                <div key={tx.id} className="flex justify-between px-4 py-2 text-sm">
                  <span className="text-gray-700 dark:text-gray-300 truncate">{privText(tx.merchant)}</span>
                  <span className="text-gray-500 ml-4 whitespace-nowrap tabular-nums">
                    {tx.date} · {fmt(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        <Select value={catId || 'none'} onValueChange={(val) => setCatId(val === 'none' ? '' : val)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select new category..." />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            <SelectItem value="none">Select new category...</SelectItem>
            {categories?.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                <span className="mr-2">{c.icon}</span>
                <span>{c.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-400">
          To make this categorization apply to future imports, create a rule on the Categories page.
        </p>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!catId || applying || !preview.data?.count}
            className="btn-primary flex-1"
          >
            {applying ? 'Applying...' : `Apply to ${preview.data?.count ?? 0} transactions`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Tag chip ──────────────────────────────────────────────────────────────────
function TagChip({ tag, onRemove }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium border border-black/[0.08] dark:border-white/[0.10]"
      style={{
        background: tag.color ? `${tag.color}15` : 'rgba(100, 116, 139, 0.1)',
        borderColor: tag.color ? `${tag.color}35` : 'rgba(100, 116, 139, 0.2)',
        color: tag.color || '#64748b',
      }}
    >
      <span>{tag.name}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          className="hover:opacity-75 p-0.5 rounded transition-opacity"
          aria-label={`Remove tag ${tag.name}`}
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
}

function RowTagDropdown({ tx, allTags, onAssignTag, align = 'start' }) {
  const unassigned = allTags?.filter((t) => !tx.tags?.find((tt) => tt.id === t.id)) || [];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center p-1 rounded-md text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none"
          title="Add tag"
          aria-label="Add tag"
        >
          <Tag size={12} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-48 max-h-60 overflow-y-auto">
        <DropdownMenuLabel className="text-xs">Add tag</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {unassigned.length === 0 ? (
          <div className="px-2 py-2 text-xs text-gray-400 text-center">All tags assigned</div>
        ) : (
          unassigned.map((t) => (
            <DropdownMenuItem
              key={t.id}
              onClick={() => onAssignTag(t.id)}
              className="flex items-center gap-2 cursor-pointer text-xs"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: t.color || '#3b82f6' }}
              />
              <span className="truncate">{t.name}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SortHeader({ label, sortKey, activeSortBy, activeSortDir, onToggle, className = '' }) {
  const active = activeSortBy === sortKey;
  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      className={clsx(
        'inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors select-none group',
        active && 'text-brand-600 dark:text-brand-400 font-semibold',
        className,
      )}
      title={`Sort by ${label}`}
    >
      <span>{label}</span>
      {active ? (
        activeSortDir === 'asc' ? (
          <ChevronUp size={12} className="text-brand-600 dark:text-brand-400" />
        ) : (
          <ChevronDown size={12} className="text-brand-600 dark:text-brand-400" />
        )
      ) : (
        <ArrowUpDown size={11} className="text-gray-300 dark:text-gray-600 group-hover:text-gray-400 transition-colors" />
      )}
    </button>
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
  const tabParam = searchParams.get('tab');
  const tab = tabParam === 'import' ? 'import' : 'list';
  const setTab = (t) => {
    const next = new URLSearchParams(searchParams);
    if (t === 'import') next.set('tab', 'import');
    else next.delete('tab');
    setSearchParams(next, { replace: true });
  };

  const updateQueryBatch = useUrlQueryBatch();
  const [page, setPage]         = useUrlQueryState('p', 1, {
    serialize: String,
    deserialize: (v) => Math.max(1, parseInt(v, 10) || 1),
    replace: false,
  });
  const [search, setSearch]     = useUrlQueryState('q', '', { replace: true });
  const [searchInput, setSearchInput] = useState(search);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) {
        setSearch(searchInput);
        setPage(1);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput, search, setSearch, setPage]);
  const [category, setCategory] = useUrlQueryState('cat', '', { replace: false });
  const [direction, setDir]     = useUrlQueryState('dir', '', { replace: false });
  const [filterMonth, setFilterMonth] = useUrlQueryState('month', '', { replace: false });
  const [dateFrom, setFrom]     = useUrlQueryState('from', '', { replace: false });
  const [dateTo, setTo]         = useUrlQueryState('to', '', { replace: false });
  const [tagFilter, setTagFilter] = useUrlQueryState('tag', '', { replace: false });
  const [sourceFilter, setSourceFilter] = useUrlQueryState('src', '', { replace: false });
  const [hasNotesOnly, setHasNotesOnly] = useUrlQueryState('notes', false, {
    serialize: (v) => (v ? '1' : ''),
    deserialize: (v) => v === '1' || v === 'true',
    replace: false,
  });
  const [sortBy, setSortBy]     = useUrlQueryState('sort', 'date', { replace: false });
  const [sortDir, setSortDir]   = useUrlQueryState('order', 'desc', { replace: false });
  const [expandedId, setExpandedId] = useState(null); // ← expanded row
  const [selected, setSelected] = useState(new Set());
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkTagApplying, setBulkTagApplying] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkModal, setBulkModal] = useState(null);
  const [bulkError, setBulkError] = useState('');

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: getCategories });
  const { data: allTags }    = useQuery({ queryKey: ['tags'],       queryFn: getTags });

  const txQueryKey = ['transactions', page, search, category, direction, dateFrom, dateTo, tagFilter, sourceFilter, hasNotesOnly, sortBy, sortDir];

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: txQueryKey,
    queryFn: () => getTransactions({
      page, limit: 50, search,
      category: category || undefined,
      direction: direction || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      tag: tagFilter || undefined,
      source: sourceFilter || undefined,
      hasNotes: hasNotesOnly ? '1' : undefined,
      sortBy,
      sortDir,
    }),
  });

  const selectedSum = useMemo(() => {
    if (!selected.size || !data?.data) return 0;
    return data.data
      .filter((tx) => selected.has(txnKey(tx)))
      .reduce((sum, tx) => sum + signedAnalyticsAmount(tx), 0);
  }, [selected, data]);

  const updateMut = useMutation({
    mutationFn: ({ id, categoryId }) => {
      const parsedCat = parseInt(categoryId, 10);
      if (Number.isNaN(parsedCat)) {
        throw new Error('Invalid category selected');
      }
      return updateTransaction(id, { categoryId: parsedCat });
    },
    onMutate: async ({ id, categoryId }) => {
      await qc.cancelQueries({ queryKey: ['transactions'] });
      const previousData = qc.getQueryData(txQueryKey);
      const catObj = categories?.find((c) => String(c.id) === String(categoryId));
      if (previousData?.data) {
        qc.setQueryData(txQueryKey, {
          ...previousData,
          data: previousData.data.map((tx) =>
            String(txnKey(tx)) === String(id)
              ? {
                  ...tx,
                  category_id: parseInt(categoryId, 10),
                  category_name: catObj?.name ?? tx.category_name,
                  category_icon: catObj?.icon ?? tx.category_icon,
                  category_color: catObj?.color ?? tx.category_color,
                }
              : tx
          ),
        });
      }
      return { previousData };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousData) {
        qc.setQueryData(txQueryKey, context.previousData);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      invalidateDashboardData(qc);
    },
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
    onMutate: async ({ id, notes }) => {
      await qc.cancelQueries({ queryKey: ['transactions'] });
      const previousData = qc.getQueryData(txQueryKey);
      if (previousData?.data) {
        qc.setQueryData(txQueryKey, {
          ...previousData,
          data: previousData.data.map((tx) =>
            String(txnKey(tx)) === String(id) ? { ...tx, notes } : tx
          ),
        });
      }
      return { previousData };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousData) {
        qc.setQueryData(txQueryKey, context.previousData);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
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
    try {
      const res = await exportTransactionsCSV();
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = 'transactions.csv'; a.click();
      URL.revokeObjectURL(url);
      toast.success('Exported transactions as CSV');
    } catch {
      toast.error('Failed to export transactions');
    }
  };

  const toggleSelect = (id) => setSelected((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const selectAll = () => setSelected(new Set(data?.data?.map((r) => txnKey(r)) ?? []));
  const clearSel  = () => setSelected(new Set());

  const handleBulkCategorySelect = async (categoryId) => {
    if (!categoryId || !selected.size) return;
    setBulkApplying(true);
    setBulkError('');
    try {
      const result = await bulkUpdateCategory([...selected], parseInt(categoryId, 10));
      if (result?.updated === 0) {
        setBulkError('No transactions were updated. Try again or refresh the page.');
        return;
      }
      qc.invalidateQueries({ queryKey: ['transactions'] });
      invalidateDashboardData(qc);
      const catName = categories.find((c) => String(c.id) === String(categoryId))?.name || 'Category';
      const count = result?.updated || selected.size;
      toast.success(`Updated ${count} transaction${count === 1 ? '' : 's'} to ${catName}`);
      // Selection preserved so user can continue applying tags or other actions!
    } catch (err) {
      setBulkError(err.message || 'Failed to apply category');
      toast.error(err.message || 'Failed to apply category');
    } finally {
      setBulkApplying(false);
    }
  };

  const handleBulkTagSelect = async (tagId) => {
    const { bankIds, revolutIds } = splitSelectedIds(selected);
    if (!tagId || (!bankIds.length && !revolutIds.length)) return;
    setBulkTagApplying(true);
    setBulkError('');
    try {
      await bulkAssignTag(parseInt(tagId, 10), bankIds, revolutIds);
      qc.invalidateQueries({ queryKey: ['transactions'] });
      const tagName = tags.find((t) => String(t.id) === String(tagId))?.name || 'Tag';
      toast.success(`Assigned #${tagName} to ${selected.size} transaction${selected.size === 1 ? '' : 's'}`);
      // Selection preserved so user can continue applying category or other actions!
    } catch (err) {
      setBulkError(err.message || 'Failed to assign tag');
      toast.error(err.message || 'Failed to assign tag');
    } finally {
      setBulkTagApplying(false);
    }
  };

  const invalidateAfterTxnDelete = () => {
    invalidateDashboardData(qc);
    qc.invalidateQueries({ queryKey: ['tagAnalytics'] });
  };

  const requestBulkDelete = () => {
    if (!selected.size) return;
    setBulkDeleteConfirmOpen(true);
  };

  const confirmBulkDelete = async () => {
    setBulkDeleteConfirmOpen(false);
    if (!selected.size) return;
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
      const count = result?.deleted || selected.size;
      clearSel();
      toast.success(`Deleted ${count} transaction${count === 1 ? '' : 's'}`);
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
    if (v) {
      const { dateFrom: f, dateTo: t } = getMonthRange(v);
      updateQueryBatch({ month: v, from: f, to: t, p: 1 });
    } else {
      updateQueryBatch({ month: '', from: '', to: '', p: 1 });
    }
  };

  const onDateFromChange = (v) => {
    updateQueryBatch({ from: v, month: '', p: 1 });
  };

  const onDateToChange = (v) => {
    updateQueryBatch({ to: v, month: '', p: 1 });
  };

  const resetFilters = () => {
    setSearchInput('');
    updateQueryBatch({
      q: '',
      cat: '',
      dir: '',
      month: '',
      from: '',
      to: '',
      tag: '',
      src: '',
      notes: '',
      p: 1,
    });
  };

  const selectedSplit = useMemo(() => splitSelectedIds(selected), [selected]);

  const toggleExpand = (id) => setExpandedId((prev) => prev === id ? null : id);
  const toggleSort = (key) => {
    if (sortBy === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchInput) count++;
    if (category) count++;
    if (direction) count++;
    if (sourceFilter) count++;
    if (filterMonth) count++;
    if (dateFrom || dateTo) count++;
    if (tagFilter) count++;
    if (hasNotesOnly) count++;
    return count;
  }, [searchInput, category, direction, sourceFilter, filterMonth, dateFrom, dateTo, tagFilter, hasNotesOnly]);

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

      {/* Sleek Compact Command Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Transactions
          </h1>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-8.5 p-0.5 bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] rounded-lg">
              <TabsTrigger
                value="list"
                className="h-7 px-3 text-xs font-medium rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm"
              >
                List
              </TabsTrigger>
              <TabsTrigger
                value="import"
                className="h-7 px-3 text-xs font-medium rounded-md gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm"
              >
                <Upload size={13} />
                Import / Export
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {tab === 'list' && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="h-8.5 text-xs font-medium gap-1.5 border-black/[0.08] dark:border-white/[0.1] bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-sm shrink-0"
          >
            <Download size={13} />
            Export CSV
          </Button>
        )}
      </div>

      {tab === 'import' ? (
        <TransactionImportPanel />
      ) : (
      <>
      {/* Compact Modern Filter Toolbar */}
      <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white/60 dark:bg-slate-900/50 backdrop-blur-xl p-3 shadow-sm space-y-2.5">
        {/* Tier 1: Search and Primary Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Input with Clear Button */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search merchant, details, notes…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full h-[34px] pl-8 pr-7 text-xs rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white/70 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/80 transition-colors"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="Clear search"
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Category */}
          <div className="w-[150px] sm:w-[165px]">
            <Select value={category || 'all'} onValueChange={(val) => { setCategory(val === 'all' ? '' : val); setPage(1); }}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">All categories</SelectItem>
                {categories?.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    <span className="mr-2">{c.icon}</span>
                    <span>{c.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Month */}
          <MonthFilterSelect
            value={filterMonth}
            onChange={onMonthChange}
            size="sm"
            className="w-[130px] sm:w-[140px]"
          />

          {/* Source */}
          <div className="w-[120px] sm:w-[130px]">
            <Select value={sourceFilter || 'all'} onValueChange={(val) => { setSourceFilter(val === 'all' ? '' : val); setPage(1); }}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="bank">Bank only</SelectItem>
                <SelectItem value="revolut">Revolut only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Direction */}
          <div className="w-[120px] sm:w-[130px]">
            <Select value={direction || 'all'} onValueChange={(val) => { setDir(val === 'all' ? '' : val); setPage(1); }}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="All directions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All directions</SelectItem>
                <SelectItem value="D">Expenses</SelectItem>
                <SelectItem value="K">Income</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tier 2: Refinements & Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-black/[0.04] dark:border-white/[0.04]">
          <div className="flex flex-wrap items-center gap-2">
            {/* Tag Filter */}
            <div className="w-[145px] sm:w-[160px]">
              <Select value={tagFilter || 'all'} onValueChange={(val) => { setTagFilter(val === 'all' ? '' : val); setPage(1); }}>
                <SelectTrigger size="sm" className="w-full">
                  <div className="flex items-center gap-1.5 truncate">
                    <Tag size={12} className="text-slate-400 shrink-0" />
                    <SelectValue placeholder="Filter by tag..." />
                  </div>
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="all">All tags</SelectItem>
                  {allTags?.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: t.color || '#3b82f6' }}
                        />
                        <span className="truncate">{t.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Range: From -> To */}
            <div className="flex items-center gap-1.5">
              <DatePicker
                value={dateFrom}
                onChange={onDateFromChange}
                placeholder="From"
                size="sm"
                className="w-[115px] sm:w-[125px]"
              />
              <span className="text-xs text-slate-400 font-medium">to</span>
              <DatePicker
                value={dateTo}
                onChange={onDateToChange}
                placeholder="To"
                size="sm"
                className="w-[115px] sm:w-[125px]"
              />
            </div>

            {/* Has Notes Toggle */}
            <button
              type="button"
              onClick={() => { setHasNotesOnly(!hasNotesOnly); setPage(1); }}
              className={clsx(
                'h-[34px] px-2.5 rounded-lg text-xs font-medium border transition-colors inline-flex items-center gap-1.5 select-none touch-manipulation',
                hasNotesOnly
                  ? 'bg-brand-500/10 border-brand-500/40 text-brand-600 dark:text-brand-400'
                  : 'bg-white/70 dark:bg-slate-900/50 border-black/[0.08] dark:border-white/[0.08] text-slate-600 dark:text-slate-400 hover:bg-white/90 dark:hover:bg-slate-900/70 hover:text-slate-900 dark:hover:text-slate-200'
              )}
            >
              <FileText size={12} className={hasNotesOnly ? 'text-brand-500' : 'text-slate-400'} />
              <span>Has notes</span>
            </button>
          </div>

          {/* Active Filter Counter & Reset Button */}
          {activeFilterCount > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <Badge variant="secondary" className="text-[11px] font-normal py-0.5 px-2">
                {activeFilterCount} active
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-[30px] px-2 text-xs text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 gap-1 transition-colors"
              >
                <X size={12} />
                <span>Reset</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Bulk action floating toolbar */}
      {selected.size > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 p-2.5 sm:px-4 bg-white/90 dark:bg-slate-900/85 border border-black/[0.08] dark:border-white/[0.1] rounded-xl shadow-lg backdrop-blur-xl flex-wrap">
            {/* Selection Info */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400 font-semibold text-xs shrink-0 tabular-nums">
                {selected.size}
              </div>
              <div className="text-xs text-slate-700 dark:text-slate-300 font-medium truncate flex items-center gap-1.5 flex-wrap">
                <span>selected</span>
                <span className={clsx('font-semibold tabular-nums', selectedSum >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white')}>
                  ({selectedSum >= 0 ? '+' : ''}{fmt(selectedSum)})
                </span>
                {selectedSplit.revolutIds.length > 0 && (
                  <span className="hidden sm:inline text-slate-400 text-[11px] font-normal">
                    · {selectedSplit.bankIds.length} bank, {selectedSplit.revolutIds.length} Revolut
                  </span>
                )}
              </div>
            </div>

            {/* Actions group */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Category Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bulkApplying}
                    className="gap-1.5 h-8 text-xs font-medium"
                  >
                    {bulkApplying ? (
                      <span className="inline-block animate-spin mr-1">⟳</span>
                    ) : (
                      <FolderPlus size={13} className="text-slate-400 shrink-0" />
                    )}
                    <span>Category</span>
                    <ChevronDown size={12} className="text-slate-400 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 max-h-72 overflow-y-auto">
                  <DropdownMenuLabel className="text-xs">
                    Set category for {selected.size} item{selected.size > 1 ? 's' : ''}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {categories?.map((c) => (
                    <DropdownMenuItem
                      key={c.id}
                      onClick={() => handleBulkCategorySelect(c.id)}
                      className="flex items-center gap-2 cursor-pointer text-xs py-2"
                    >
                      <span className="text-sm shrink-0">{c.icon}</span>
                      <span className="flex-1 truncate">{c.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Tag Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bulkTagApplying}
                    className="gap-1.5 h-8 text-xs font-medium"
                  >
                    {bulkTagApplying ? (
                      <span className="inline-block animate-spin mr-1">⟳</span>
                    ) : (
                      <Tag size={13} className="text-slate-400 shrink-0" />
                    )}
                    <span>Tag</span>
                    <ChevronDown size={12} className="text-slate-400 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 max-h-72 overflow-y-auto">
                  <DropdownMenuLabel className="text-xs">
                    Assign tag to {selected.size} item{selected.size > 1 ? 's' : ''}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {allTags?.map((t) => (
                    <DropdownMenuItem
                      key={t.id}
                      onClick={() => handleBulkTagSelect(t.id)}
                      className="flex items-center gap-2 cursor-pointer text-xs py-2"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: t.color || '#64748b' }}
                      />
                      <span className="flex-1 truncate">{t.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Delete Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={requestBulkDelete}
                disabled={bulkDeleting || bulkApplying || bulkTagApplying}
                className="gap-1.5 h-8 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 border-rose-200 dark:border-rose-900/50"
              >
                <Trash2 size={13} />
                <span>{bulkDeleting ? 'Deleting...' : 'Delete'}</span>
              </Button>

              <div className="h-4 w-px bg-gray-200 dark:bg-gray-800 mx-0.5" />

              {/* Deselect */}
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSel}
                className="h-8 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
              >
                Deselect
              </Button>
            </div>
          </div>

          {bulkError && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-lg">
              <AlertCircle size={13} className="shrink-0" />
              <span>{bulkError}</span>
            </div>
          )}
        </div>
      )}

      {/* Real-time sync & transaction counter bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 py-1 px-2.5 font-normal">
            <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
              {data?.total ?? 0}
            </span>
            <span className="text-slate-500 dark:text-slate-400">transactions</span>
          </Badge>

          <HoverCard openDelay={200}>
            <HoverCardTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors px-2 py-1 rounded-md hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-help"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Bank + Revolut</span>
                <Info size={12} className="text-slate-400" />
              </button>
            </HoverCardTrigger>
            <HoverCardContent align="start" className="w-80 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                <Landmark size={14} className="text-brand-500" />
                <span>Multi-Account Sync & Weighting</span>
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Includes transactions from bank accounts and Revolut.
              </p>
              <div className="rounded-lg p-2 bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/[0.05] text-[11px] text-slate-500 dark:text-slate-400">
                Revolut personal expenses are counted at <strong>50% weight</strong> in analytics to reflect split living costs.
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>
      </div>

      {/* Mobile list */}
      <div className="md:hidden card overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
        {isLoading ? (
          <TableSkeleton rows={5} />
        ) : !data?.data?.length ? (
          <EmptyState
            title="No transactions found"
            description="No transactions match your current filters. Try resetting filters."
            action={
              <button type="button" onClick={resetFilters} className="btn-secondary text-xs">
                Reset filters
              </button>
            }
          />
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
                    <p className={clsx('font-semibold whitespace-nowrap tabular-nums', tx.direction === 'K' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white')}>
                      {tx.direction === 'K' ? '+' : '-'}{fmt(tx.amount)}
                    </p>
                  </div>
                </button>
                <div className="mt-2 flex flex-wrap gap-2 items-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 focus:outline-none rounded-md"
                        title="Click to change category"
                      >
                        <CategoryBadge icon={tx.category_icon} name={tx.category_name} color={tx.category_color} />
                        <ChevronDown size={11} className="text-gray-400" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-52 max-h-72 overflow-y-auto">
                      <DropdownMenuLabel>Select category</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {categories?.map((c) => (
                        <DropdownMenuItem
                          key={c.id}
                          onClick={() => updateMut.mutate({ id: rowId, categoryId: String(c.id) })}
                          className={clsx(
                            'flex items-center gap-2 cursor-pointer',
                            Number(tx.category_id) === Number(c.id) && 'font-semibold text-brand-600 dark:text-brand-400 bg-brand-50/50 dark:bg-brand-900/20'
                          )}
                        >
                          <span>{c.icon}</span>
                          <span className="flex-1 truncate">{c.name}</span>
                          {Number(tx.category_id) === Number(c.id) && <Check size={13} className="ml-auto" />}
                        </DropdownMenuItem>
                      ))}
                      {(tx.merchant || tx.details) && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setBulkModal(tx.merchant || tx.details)}
                            className="text-brand-600 dark:text-brand-400 flex items-center gap-2"
                          >
                            <Layers size={13} />
                            <span>Apply to similar...</span>
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {tx.tags?.map((tag) => (
                    <TagChip key={tag.id} tag={tag} onRemove={() => removeTagMut.mutate({ txId: rowId, tagId: tag.id, source: tx.source })} />
                  ))}
                  <RowTagDropdown
                    tx={tx}
                    allTags={allTags}
                    onAssignTag={(tagId) => assignTagMut.mutate({ txId: rowId, tagId, source: tx.source })}
                  />
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
        {isLoading ? (
          <TableSkeleton rows={8} />
        ) : !data?.data?.length ? (
          <EmptyState
            title="No transactions found"
            description="No transactions match your current filters. Try resetting filters."
            action={
              <button type="button" onClick={resetFilters} className="btn-secondary text-xs">
                Reset filters
              </button>
            }
          />
        ) : (
          <>
            <div className="table-scroll">
              <table className="w-full text-sm min-w-[920px]">
                <thead>
                  <tr className="border-b border-black/[0.06] dark:border-white/[0.07] bg-black/[0.02] dark:bg-white/[0.02]">
                    <th className="px-4 py-3 w-8">
                      <input type="checkbox"
                        checked={selected.size === data?.data?.length && data?.data?.length > 0}
                        onChange={() => selected.size === data?.data?.length ? clearSel() : selectAll()}
                        className="rounded"
                      />
                    </th>
                    <th className="text-left px-4 py-3">
                      <SortHeader label="Date" sortKey="date" activeSortBy={sortBy} activeSortDir={sortDir} onToggle={toggleSort} />
                    </th>
                    <th className="text-left px-4 py-3">
                      <SortHeader label="Merchant / Details" sortKey="merchant_details" activeSortBy={sortBy} activeSortDir={sortDir} onToggle={toggleSort} />
                    </th>
                    <th className="text-left px-4 py-3 max-w-[200px]">
                      <SortHeader label="Your note" sortKey="notes" activeSortBy={sortBy} activeSortDir={sortDir} onToggle={toggleSort} />
                    </th>
                    <th className="text-right px-4 py-3">
                      <SortHeader
                        label="Amount"
                        sortKey="amount"
                        activeSortBy={sortBy}
                        activeSortDir={sortDir}
                        onToggle={toggleSort}
                        className="ml-auto"
                      />
                    </th>
                    <th className="text-left px-4 py-3">
                      <SortHeader label="Category" sortKey="category" activeSortBy={sortBy} activeSortDir={sortDir} onToggle={toggleSort} />
                    </th>
                    <th className="text-left px-4 py-3">
                      <SortHeader label="Tags" sortKey="tags" activeSortBy={sortBy} activeSortDir={sortDir} onToggle={toggleSort} />
                    </th>
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
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
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
                              <MerchantHoverCard tx={tx} privText={privText}>
                                <span className="font-medium text-gray-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors line-clamp-1">
                                  {privText(tx.merchant || tx.beneficiary || '—')}
                                </span>
                              </MerchantHoverCard>
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
                        <td className={clsx('px-4 py-2.5 text-right font-semibold whitespace-nowrap tabular-nums',
                          tx.direction === 'K' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white')}>
                          {tx.direction === 'K' ? '+' : '-'}{fmt(tx.amount)}
                        </td>

                        {/* Category */}
                        <td className="px-4 py-2.5">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="text-left group/cat inline-flex items-center gap-1.5 focus:outline-none rounded-md"
                                title="Click to change category"
                              >
                                <CategoryBadge icon={tx.category_icon} name={tx.category_name} color={tx.category_color} />
                                <ChevronDown size={11} className="text-gray-300 dark:text-gray-600 group-hover/cat:text-gray-500 transition-colors" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-52 max-h-72 overflow-y-auto">
                              <DropdownMenuLabel>Select category</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {categories?.map((c) => (
                                <DropdownMenuItem
                                  key={c.id}
                                  onClick={() => updateMut.mutate({ id: rowId, categoryId: String(c.id) })}
                                  className={clsx(
                                    'flex items-center gap-2 cursor-pointer',
                                    Number(tx.category_id) === Number(c.id) && 'font-semibold text-brand-600 dark:text-brand-400 bg-brand-50/50 dark:bg-brand-900/20'
                                  )}
                                >
                                  <span>{c.icon}</span>
                                  <span className="flex-1 truncate">{c.name}</span>
                                  {Number(tx.category_id) === Number(c.id) && <Check size={13} className="ml-auto" />}
                                </DropdownMenuItem>
                              ))}
                              {(tx.merchant || tx.details) && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => setBulkModal(tx.merchant || tx.details)}
                                    className="text-brand-600 dark:text-brand-400 flex items-center gap-2"
                                  >
                                    <Layers size={13} />
                                    <span>Apply to similar...</span>
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>

                        {/* Tags */}
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1 items-center">
                            {tx.tags?.map((tag) => (
                              <TagChip key={tag.id} tag={tag}
                                onRemove={() => removeTagMut.mutate({ txId: rowId, tagId: tag.id, source: tx.source })}
                              />
                            ))}
                            <RowTagDropdown
                              tx={tx}
                              allTags={allTags}
                              onAssignTag={(tagId) => assignTagMut.mutate({ txId: rowId, tagId, source: tx.source })}
                            />
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

                        {/* Row Actions */}
                        <td className="px-3 py-2.5 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus:ring-1 focus:ring-brand-500"
                                title="Row options"
                              >
                                <MoreHorizontal size={14} />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => toggleExpand(rowId)} className="flex items-center gap-2 cursor-pointer">
                                <ChevronDown size={14} className={clsx(expandedId === rowId && 'rotate-180')} />
                                <span>{expandedId === rowId ? 'Hide details' : 'View details'}</span>
                              </DropdownMenuItem>
                              {(tx.merchant || tx.details) && (
                                <DropdownMenuItem onClick={() => setBulkModal(tx.merchant || tx.details)} className="flex items-center gap-2 cursor-pointer">
                                  <Layers size={14} />
                                  <span>Categorize similar</span>
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer text-xs">
                                  <Tag size={14} />
                                  <span>Add tag</span>
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="w-48 max-h-60 overflow-y-auto">
                                  {allTags?.filter((t) => !tx.tags?.find((tt) => tt.id === t.id)).length === 0 ? (
                                    <div className="px-2 py-2 text-xs text-gray-400 text-center">All tags assigned</div>
                                  ) : (
                                    allTags?.filter((t) => !tx.tags?.find((tt) => tt.id === t.id)).map((t) => (
                                      <DropdownMenuItem
                                        key={t.id}
                                        onClick={() => assignTagMut.mutate({ txId: rowId, tagId: t.id, source: tx.source })}
                                        className="flex items-center gap-2 cursor-pointer text-xs"
                                      >
                                        <span
                                          className="w-2 h-2 rounded-full shrink-0"
                                          style={{ backgroundColor: t.color || '#3b82f6' }}
                                        />
                                        <span className="truncate">{t.name}</span>
                                      </DropdownMenuItem>
                                    ))
                                  )}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-56">
                      <ContextMenuItem
                        onClick={() => {
                          const desc = tx.merchant || tx.beneficiary || tx.details || '';
                          if (desc) {
                            navigator.clipboard.writeText(desc);
                            toast.success('Description copied to clipboard');
                          }
                        }}
                        className="gap-2"
                      >
                        <Copy size={13} />
                        <span>Copy description</span>
                      </ContextMenuItem>
                      <ContextMenuItem
                        onClick={() => {
                          const val = `${tx.direction === 'K' ? '+' : '-'}${fmt(tx.amount)}`;
                          navigator.clipboard.writeText(val);
                          toast.success('Amount copied to clipboard');
                        }}
                        className="gap-2"
                      >
                        <Copy size={13} />
                        <span>Copy amount</span>
                      </ContextMenuItem>
                      <ContextMenuItem
                        onClick={() => toggleSelect(rowId)}
                        className="gap-2"
                      >
                        <span>{selected.has(rowId) ? 'Deselect row' : 'Select row'}</span>
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => toggleExpand(rowId)} className="gap-2">
                        <ChevronDown size={13} className={clsx(expandedId === rowId && 'rotate-180')} />
                        <span>{expandedId === rowId ? 'Hide details' : 'View details'}</span>
                      </ContextMenuItem>
                      <ContextMenuSub>
                        <ContextMenuSubTrigger className="gap-2">
                          <FolderPlus size={13} />
                          <span>Set category</span>
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="w-52 max-h-72 overflow-y-auto">
                          {categories?.length === 0 ? (
                            <div className="px-2 py-2 text-xs text-gray-400 text-center">No categories found</div>
                          ) : (
                            categories?.map((c) => (
                              <ContextMenuItem
                                key={c.id}
                                onClick={() => updateMut.mutate({ id: rowId, categoryId: String(c.id) })}
                                className={clsx(
                                  'gap-2',
                                  Number(tx.category_id) === Number(c.id) && 'font-semibold text-brand-600 dark:text-brand-400 bg-brand-50/50 dark:bg-brand-900/20'
                                )}
                              >
                                <span>{c.icon}</span>
                                <span className="flex-1 truncate">{c.name}</span>
                                {Number(tx.category_id) === Number(c.id) && <Check size={13} className="ml-auto" />}
                              </ContextMenuItem>
                            ))
                          )}
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      <ContextMenuSub>
                        <ContextMenuSubTrigger className="gap-2">
                          <Tag size={13} />
                          <span>Add tag</span>
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="w-48 max-h-60 overflow-y-auto">
                          {allTags?.filter((t) => !tx.tags?.find((tt) => tt.id === t.id)).length === 0 ? (
                            <div className="px-2 py-2 text-xs text-gray-400 text-center">All tags assigned</div>
                          ) : (
                            allTags?.filter((t) => !tx.tags?.find((tt) => tt.id === t.id)).map((t) => (
                              <ContextMenuItem
                                key={t.id}
                                onClick={() => assignTagMut.mutate({ txId: rowId, tagId: t.id, source: tx.source })}
                                className="gap-2"
                              >
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: t.color || '#3b82f6' }}
                                />
                                <span className="truncate">{t.name}</span>
                              </ContextMenuItem>
                            ))
                          )}
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      {(tx.merchant || tx.details) && (
                        <ContextMenuItem onClick={() => setBulkModal(tx.merchant || tx.details)} className="gap-2 text-brand-600 dark:text-brand-400">
                          <Layers size={13} />
                          <span>Categorize similar...</span>
                        </ContextMenuItem>
                      )}
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        onClick={() => {
                          setSelected(new Set([rowId]));
                          setBulkDeleteConfirmOpen(true);
                        }}
                        className="gap-2 text-rose-600 dark:text-rose-400 focus:text-rose-600 dark:focus:text-rose-400 focus:bg-rose-50 dark:focus:bg-rose-950/40"
                      >
                        <Trash2 size={13} />
                        <span>Delete transaction</span>
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>

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
            <div className="px-4 py-3 border-t border-black/[0.06] dark:border-white/[0.07] flex items-center justify-between">
              <p className="text-xs text-slate-500 dark:text-slate-400">
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

      {/* Confirm bulk delete modal */}
      <ConfirmDialog
        isOpen={bulkDeleteConfirmOpen}
        title="Delete Transactions"
        message={
          selected.size === 1
            ? 'Delete 1 selected transaction permanently? This cannot be undone.'
            : `Delete ${selected.size} selected transactions permanently? This cannot be undone.`
        }
        confirmText="Delete"
        onConfirm={confirmBulkDelete}
        onCancel={() => setBulkDeleteConfirmOpen(false)}
      />
    </div>
  );
}
