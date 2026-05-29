import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Check, X, Merge, BarChart2 } from 'lucide-react';
import {
  getTags, createTag, updateTag, deleteTag, mergeTag, getTagSummary, getTagAnalytics,
} from '../api/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { fmtEur, privText } from '../utils/displayFormat';
import { usePrivacy } from '../context/PrivacyContext';
import clsx from 'clsx';

const fmt = fmtEur;

const COLORS = [
  '#6366f1','#ec4899','#10b981','#f97316','#3b82f6','#a855f7','#ef4444',
  '#eab308','#06b6d4','#84cc16','#f43f5e','#8b5cf6',
];

export default function Tags() {
  usePrivacy();
  const qc = useQueryClient();
  const [newName,  setNewName]  = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [editId,   setEditId]   = useState(null);
  const [editName, setEditName] = useState('');
  const [mergeFrom, setMergeFrom] = useState('');
  const [mergeTo,   setMergeTo]   = useState('');
  const [selectedTag, setSelectedTag] = useState(null);

  const tags    = useQuery({ queryKey: ['tags'],       queryFn: getTags });
  const summary = useQuery({ queryKey: ['tagSummary'], queryFn: getTagSummary });
  const analytics = useQuery({
    queryKey: ['tagAnalytics', selectedTag],
    queryFn:  () => getTagAnalytics(selectedTag),
    enabled:  !!selectedTag,
  });

  const createMut = useMutation({
    mutationFn: () => createTag({ name: newName.trim(), color: newColor }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tags'] }); setNewName(''); },
  });

  const renameMut = useMutation({
    mutationFn: () => updateTag(editId, { name: editName }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tags'] }); setEditId(null); },
  });

  const deleteMut = useMutation({
    mutationFn: deleteTag,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tags'] }); if (selectedTag === deleteMut.variables) setSelectedTag(null); },
  });

  const mergeMut = useMutation({
    mutationFn: () => mergeTag(mergeFrom, mergeTo),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tags'] }); setMergeFrom(''); setMergeTo(''); },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tags</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Label bank and Revolut transactions — trips, projects, events, tax purposes. Revolut amounts only appear when those rows are tagged.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Tag list + management ── */}
        <div className="lg:col-span-1 space-y-4">

          {/* Create */}
          <div className="card p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">New Tag</p>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                placeholder="Tag name..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && newName && createMut.mutate()}
                className="input flex-1"
              />
              <button
                onClick={() => createMut.mutate()}
                disabled={!newName.trim()}
                className="btn-primary"
              >
                <Plus size={15} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={clsx('w-5 h-5 rounded-full transition-transform', newColor === c && 'scale-125 ring-2 ring-offset-1 ring-gray-400')}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          {/* Tag list */}
          <div className="card overflow-hidden">
            {tags.isLoading ? <LoadingSpinner /> : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {tags.data?.map((tag) => (
                  <div
                    key={tag.id}
                    className={clsx(
                      'flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors',
                      selectedTag === tag.id && 'bg-brand-50 dark:bg-brand-900/20'
                    )}
                    onClick={() => setSelectedTag(tag.id === selectedTag ? null : tag.id)}
                  >
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: tag.color }} />

                    {editId === tag.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') renameMut.mutate(); if (e.key === 'Escape') setEditId(null); }}
                        className="input flex-1 py-0.5 text-sm"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200">{tag.name}</span>
                    )}

                    <span className="text-xs text-gray-400">{tag.usage_count}</span>

                    {editId === tag.id ? (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); renameMut.mutate(); }} className="text-green-600 hover:text-green-700"><Check size={13} /></button>
                        <button onClick={(e) => { e.stopPropagation(); setEditId(null); }} className="text-gray-400"><X size={13} /></button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditId(tag.id); setEditName(tag.name); }}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); if (confirm(`Delete tag "${tag.name}"?`)) deleteMut.mutate(tag.id); }}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {!tags.data?.length && (
                  <div className="p-6 text-center text-sm text-gray-400">No tags yet. Create one above.</div>
                )}
              </div>
            )}
          </div>

          {/* Merge */}
          {tags.data?.length > 1 && (
            <div className="card p-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Merge Tags</p>
              <div className="space-y-2">
                <select value={mergeFrom} onChange={(e) => setMergeFrom(e.target.value)} className="input">
                  <option value="">Merge from...</option>
                  {tags.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select value={mergeTo} onChange={(e) => setMergeTo(e.target.value)} className="input">
                  <option value="">Into...</option>
                  {tags.data?.filter((t) => String(t.id) !== mergeFrom).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button
                  onClick={() => mergeMut.mutate()}
                  disabled={!mergeFrom || !mergeTo}
                  className="btn-secondary w-full flex items-center justify-center gap-2"
                >
                  <Merge size={14} />
                  Merge
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right panel: summary or analytics ── */}
        <div className="lg:col-span-2 space-y-4">
          {selectedTag && analytics.data ? (
            <>
              {/* Tag detail */}
              <div className="card p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-3 h-3 rounded-full" style={{ background: analytics.data.tag.color }} />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{analytics.data.tag.name}</h2>
                  <span className="text-sm text-gray-400">{analytics.data.summary?.txCount} transactions</span>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-5">
                  {[
                    { label: 'Net spending (expense)', value: fmt(analytics.data.summary?.totalSpending) },
                    { label: 'Net income',   value: fmt(analytics.data.summary?.totalIncome) },
                    { label: 'Date Range',     value: `${analytics.data.summary?.firstDate ?? '—'} → ${analytics.data.summary?.lastDate ?? '—'}` },
                  ].map((s) => (
                    <div key={s.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                      <p className="text-xs text-gray-400 mb-0.5">{s.label}</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{s.value}</p>
                    </div>
                  ))}
                </div>

                {analytics.data.byMonth?.length > 0 && (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={analytics.data.byMonth}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `€${v}`} />
                      <Tooltip formatter={(v) => fmt(v)} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="expenseNet" name="Net spending" fill="#f43f5e" radius={[3,3,0,0]} />
                      <Bar dataKey="incomeNet" name="Net income" fill="#10b981" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Tagged transactions */}
              <div className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Transactions</span>
                </div>
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0">
                      <tr>
                        {['Date','Source','Merchant','Amount','Category','Note'].map((h) => (
                          <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {analytics.data.transactions?.map((tx) => (
                        <tr key={`${tx.source || 'bank'}-${tx.id}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="px-4 py-2.5 text-xs text-gray-400">{tx.date}</td>
                          <td className="px-4 py-2.5">
                            {tx.source === 'revolut' ? (
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">Revolut</span>
                            ) : (
                              <span className="text-[10px] text-gray-400">Bank</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-gray-800 dark:text-gray-200">{privText(tx.merchant || tx.beneficiary)}</td>
                          <td
                            className={clsx('px-4 py-2.5 font-medium', tx.direction === 'K' ? 'text-green-600' : 'text-gray-900 dark:text-white')}
                            title={
                              tx.source === 'revolut' && tx.effective_amount != null && Math.abs(tx.amount - tx.effective_amount) > 0.001
                                ? `Statement: ${fmt(Math.abs(tx.amount))} · Analytics: ${fmt(Math.abs(tx.effective_amount))}`
                                : undefined
                            }
                          >
                            {tx.direction === 'K' ? '+' : '-'}
                            {fmt(Math.abs(
                              tx.source === 'revolut' && !tx.exclude_from_analytics && tx.effective_amount != null
                                ? tx.effective_amount
                                : tx.amount
                            ))}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${tx.category_color}20`, color: tx.category_color }}>
                              {tx.category_icon} {tx.category_name}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[200px] line-clamp-2" title={tx.notes || ''}>
                            {tx.notes?.trim() ? tx.notes : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            /* Summary table */
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Tag Overview</h2>
              </div>
              {summary.isLoading ? <LoadingSpinner /> : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800/50">
                    <tr>
                      {['Tag','Transactions','Net spending','Net income','Date Range'].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {summary.data?.map((r) => (
                      <tr
                        key={r.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                        onClick={() => setSelectedTag(r.id)}
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ background: r.color }} />
                            <span className="font-medium text-gray-800 dark:text-gray-200">{r.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">{r.txCount}</td>
                        <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{fmt(r.totalSpending)}</td>
                        <td className="px-4 py-2.5 text-green-600">{fmt(r.totalIncome)}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-400">{r.firstDate} → {r.lastDate}</td>
                      </tr>
                    ))}
                    {!summary.data?.length && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">No tags yet</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
