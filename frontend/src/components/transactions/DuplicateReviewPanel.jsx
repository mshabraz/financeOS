import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateDashboardData } from '../../lib/queryKeys';
import {
  AlertTriangle, Check, RefreshCw, Shield, Trash2, Undo2,
} from 'lucide-react';
import clsx from 'clsx';
import {
  scanDuplicates,
  resolveDuplicate,
  bulkResolveDuplicates,
  restoreArchivedTransactions,
  getDuplicateArchive,
  getDuplicateSettings,
  updateDuplicateSettings,
} from '../../api/client';
import TransactionSourceBadges, { TransactionAmountDetail } from './TransactionSourceBadges';
import CategoryBadge from '../ui/CategoryBadge';
import LoadingSpinner from '../ui/LoadingSpinner';
import QueryErrorPanel from '../ui/QueryErrorPanel';
import { fmtCurrency, privText } from '../../utils/displayFormat';
import { usePrivacy } from '../../context/PrivacyContext';

const fmt = (n) => fmtCurrency(n, 'EUR', { abs: true });

const CONFIDENCE_META = {
  very_high: { label: 'Very high', className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' },
  high: { label: 'High', className: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100' },
  medium: { label: 'Medium', className: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-100' },
  low: { label: 'Low', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
};

function CompareCard({ tx, label, selected, onSelect }) {
  usePrivacy();
  if (!tx) return null;
  const badgeTx = {
    ...tx,
    source: tx.ledger || tx.source,
    split_ratio: tx.split_ratio ?? (tx.applies_shared_split ? 0.5 : null),
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
      className={clsx(
        'rounded-xl border p-4 space-y-2 transition-colors cursor-pointer',
        selected
          ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-900/20 ring-2 ring-brand-500/30'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
        <span
          className={clsx(
            'inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border',
            selected
              ? 'border-brand-500 text-brand-600 bg-brand-50 dark:bg-brand-900/30'
              : 'border-gray-200 dark:border-gray-600 text-gray-500',
          )}
        >
          {selected && <Check size={12} />}
          {selected ? 'Will keep' : 'Select to keep'}
        </span>
      </div>
      <div className="text-lg font-semibold text-gray-900 dark:text-white tabular-nums">
        {fmt(tx.amount)}
      </div>
      <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
        {privText(tx.merchant || tx.details)}
      </div>
      <div className="text-xs text-gray-500">{tx.date} · {tx.ledger === 'revolut' ? 'Revolut' : 'Bank'}</div>
      <TransactionSourceBadges tx={badgeTx} />
      {tx.category && <CategoryBadge category={tx.category} />}
      {tx.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tx.tags.map((t) => (
            <span key={t.id} className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${t.color}22`, color: t.color }}>
              {t.name}
            </span>
          ))}
        </div>
      )}
      {tx.notes && <p className="text-xs text-gray-500 line-clamp-2">{privText(tx.notes)}</p>}
      <div className="text-[11px] text-gray-400">
        Source: {tx.sync_source || tx.import_method}
        {tx.transfer_ref && ` · Ref ${tx.transfer_ref}`}
      </div>
    </div>
  );
}

function DuplicateGroupCard({ group, onResolved }) {
  const [keepId, setKeepId] = useState(group.suggestedKeepId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const members = group.members || [];
  const removeIds = members.map((m) => m.unified_id).filter((id) => id !== keepId);
  const conf = CONFIDENCE_META[group.confidence] || CONFIDENCE_META.medium;

  const handleAction = async (action) => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await resolveDuplicate({
        action,
        keepId: action === 'delete' || action === 'merge' ? keepId : undefined,
        removeIds: action === 'delete' || action === 'merge' ? removeIds : undefined,
        groupId: group.groupId,
        members: members.map((m) => ({ unified_id: m.unified_id })),
      });
      if (action === 'keep_both' || action === 'ignore_pattern') {
        setSuccess('Marked safe — this pair will not appear in future scans.');
      } else if (action === 'merge') {
        setSuccess(`Removed ${result.removed ?? removeIds.length} duplicate(s). Archived for recovery.`);
      }
      await onResolved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className={clsx('inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full', conf.className)}>
            <AlertTriangle size={12} />
            {conf.label} confidence ({group.score})
          </span>
          <ul className="mt-2 text-sm text-gray-600 dark:text-gray-400 space-y-0.5">
            {(group.reasons || []).map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
        </div>
        <div className="text-sm text-gray-500">
          {fmt(group.moneyAtRisk)} at risk
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {members[0] && (
          <CompareCard
            tx={members[0]}
            label="Transaction A"
            selected={keepId === members[0].unified_id}
            onSelect={() => setKeepId(members[0].unified_id)}
          />
        )}
        {members[1] && (
          <CompareCard
            tx={members[1]}
            label="Transaction B"
            selected={keepId === members[1].unified_id}
            onSelect={() => setKeepId(members[1].unified_id)}
          />
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      {success && (
        <p className="text-sm text-green-700 dark:text-green-400 flex items-center gap-1">
          <Check size={14} /> {success}
        </p>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Tap a transaction card to choose which row survives &quot;Remove duplicate&quot;.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || removeIds.length === 0}
          onClick={() => handleAction('merge')}
          className="btn-primary gap-2 min-h-[44px]"
        >
          <Trash2 size={16} />
          Remove duplicate ({removeIds.length})
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => handleAction('keep_both')}
          className="btn-secondary min-h-[44px]"
        >
          Keep both
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => handleAction('ignore_pattern')}
          className="btn-secondary min-h-[44px]"
          title="Hide this pair from future scans — both transactions stay in your ledger"
        >
          Ignore match
        </button>
      </div>
      <p className="text-xs text-gray-400 flex items-center gap-1">
        <Shield size={12} />
        Removed transactions are archived — you can restore from Recovery below.
      </p>
    </div>
  );
}

export default function DuplicateReviewPanel() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState('last30');
  const [minConfidence, setMinConfidence] = useState('medium');
  const [search, setSearch] = useState('');
  const [selectedGroups, setSelectedGroups] = useState(new Set());

  const scanQuery = useQuery({
    queryKey: ['duplicates', mode, minConfidence, search],
    queryFn: () => scanDuplicates({ mode, minConfidence, search }),
  });

  const settingsQuery = useQuery({
    queryKey: ['duplicate-settings'],
    queryFn: getDuplicateSettings,
  });

  const archiveQuery = useQuery({
    queryKey: ['duplicate-archive'],
    queryFn: () => getDuplicateArchive(),
  });

  const invalidateAll = async () => {
    await queryClient.refetchQueries({ queryKey: ['duplicates'] });
    queryClient.invalidateQueries({ queryKey: ['duplicate-archive'] });
    invalidateDashboardData(queryClient);
  };

  const restoreMutation = useMutation({
    mutationFn: (tokens) => restoreArchivedTransactions(tokens),
    onSuccess: invalidateAll,
  });

  const groups = scanQuery.data?.groups ?? [];
  const stats = scanQuery.data?.stats;

  const handleBulkDelete = async () => {
    const items = groups
      .filter((g) => selectedGroups.has(g.groupId))
      .map((g) => ({
        action: 'merge',
        keepId: g.suggestedKeepId,
        removeIds: g.members.map((m) => m.unified_id).filter((id) => id !== g.suggestedKeepId),
      }))
      .filter((i) => i.removeIds.length > 0);

    if (!items.length) return;
    if (!window.confirm(`Remove duplicates from ${items.length} selected groups? Archived for undo.`)) return;

    await bulkResolveDuplicates({ items });
    setSelectedGroups(new Set());
    invalidateAll();
  };

  const saveSettings = async () => {
    await updateDuplicateSettings({ minConfidence });
    settingsQuery.refetch();
    scanQuery.refetch();
  };

  return (
    <div className="space-y-6">
      <div className="card p-4 sm:p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Shield className="text-brand-600 shrink-0 mt-0.5" size={22} />
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Duplicate review</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Conservative matching — review side-by-side before removing anything. Nothing is auto-deleted.
            </p>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.groupsFound}</div>
              <div className="text-xs text-gray-500">Possible duplicates</div>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.scanned}</div>
              <div className="text-xs text-gray-500">Transactions scanned</div>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
              <div className="text-2xl font-bold text-amber-600">{stats.veryHigh + stats.high}</div>
              <div className="text-xs text-gray-500">High confidence</div>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{fmt(stats.moneyAtRisk)}</div>
              <div className="text-xs text-gray-500">Amount flagged</div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-end">
          {[
            { id: 'last30', label: 'Last 30 days' },
            { id: 'new', label: 'Recent syncs' },
            { id: 'all', label: 'Full history' },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={clsx(
                'px-3 py-2 rounded-lg text-sm font-medium border min-h-[44px]',
                mode === m.id
                  ? 'bg-brand-600 border-brand-600 text-white'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400',
              )}
            >
              {m.label}
            </button>
          ))}
          <select
            value={minConfidence}
            onChange={(e) => setMinConfidence(e.target.value)}
            className="input text-sm min-h-[44px]"
          >
            <option value="very_high">Very high+</option>
            <option value="high">High+</option>
            <option value="medium">Medium+</option>
            <option value="low">All levels</option>
          </select>
          <input
            type="search"
            placeholder="Filter merchant…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input text-sm min-w-[160px] min-h-[44px]"
          />
          <button type="button" onClick={() => scanQuery.refetch()} className="btn-secondary gap-2 min-h-[44px]">
            <RefreshCw size={16} />
            Scan
          </button>
          <button type="button" onClick={saveSettings} className="btn-secondary text-sm min-h-[44px]">
            Save sensitivity
          </button>
        </div>
      </div>

      {scanQuery.isLoading && <LoadingSpinner />}
      {scanQuery.isError && (
        <QueryErrorPanel
          title="Duplicate scan failed"
          message={scanQuery.error?.message}
          onRetry={() => scanQuery.refetch()}
        />
      )}

      {!scanQuery.isLoading && groups.length === 0 && (
        <div className="card p-8 text-center text-gray-500">
          <Check className="mx-auto mb-2 text-green-500" size={32} />
          No duplicate groups found for this scan.
        </div>
      )}

      {selectedGroups.size > 0 && (
        <div className="card p-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">{selectedGroups.size} selected</span>
          <button type="button" onClick={handleBulkDelete} className="btn-primary gap-2">
            <Trash2 size={16} /> Remove selected duplicates
          </button>
          <button type="button" onClick={() => setSelectedGroups(new Set())} className="btn-secondary">
            Clear
          </button>
        </div>
      )}

      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.groupId} className="flex gap-2 items-start">
            <input
              type="checkbox"
              className="mt-5 shrink-0"
              checked={selectedGroups.has(group.groupId)}
              onChange={(e) => {
                const next = new Set(selectedGroups);
                if (e.target.checked) next.add(group.groupId);
                else next.delete(group.groupId);
                setSelectedGroups(next);
              }}
            />
            <div className="flex-1 min-w-0">
              <DuplicateGroupCard group={group} onResolved={invalidateAll} />
            </div>
          </div>
        ))}
      </div>

      {archiveQuery.data?.items?.length > 0 && (
        <div className="card p-4 sm:p-5 space-y-3">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Undo2 size={18} /> Recovery (last removals)
          </h3>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {archiveQuery.data.items.slice(0, 10).map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="text-gray-700 dark:text-gray-300 truncate">
                  {row.date} · {fmt(row.amount)} · {privText(row.merchant || row.description)}
                </span>
                <button
                  type="button"
                  disabled={restoreMutation.isPending}
                  onClick={() => restoreMutation.mutate([row.restore_token])}
                  className="btn-secondary text-xs min-h-[36px]"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
