import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Zap, Pencil, Check, X, AlertCircle, Play, Sparkles, Palette } from 'lucide-react';
import { toast } from 'sonner';
import {
  getCategories, createCategory, updateCategory, deleteCategory,
  getCategoryRules, createCategoryRule, updateCategoryRule, deleteCategoryRule,
  applyCategoryRule, harmonizeCategoryColors,
} from '../api/client';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import TableSkeleton from '../components/ui/TableSkeleton';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { Button } from '../components/ui/Button';
import CategoryColorPicker from '../components/ui/CategoryColorPicker';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../components/ui/Select';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/Tabs';
import { Switch } from '../components/ui/Switch';
import { useUrlQueryState } from '../hooks/useUrlQueryState';
import { suggestCategoryColor, harmonizeCategoryPalette } from '../utils/categoryColors';
import clsx from 'clsx';

export default function Categories() {
  const qc = useQueryClient();

  // Category form (add new)
  const [newName, setNewName]   = useState('');
  const [newIcon, setNewIcon]   = useState('📦');
  const [newColor, setNewColor] = useState('#10b981');
  const [newType, setNewType]   = useState('expense');
  const [colorManuallyPicked, setColorManuallyPicked] = useState(false);

  const handleNameChange = (val) => {
    setNewName(val);
    if (!colorManuallyPicked && val.trim().length > 1) {
      setNewColor(suggestCategoryColor(val, newType));
    }
  };

  const handleTypeChange = (val) => {
    setNewType(val);
    if (!colorManuallyPicked) {
      setNewColor(suggestCategoryColor(newName, val));
    }
  };

  // Category inline edit
  const [editCatId, setEditCatId]     = useState(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatIcon, setEditCatIcon] = useState('');
  const [editCatColor, setEditCatColor] = useState('');
  const [editCatType, setEditCatType] = useState('expense');
  const [editCatTier, setEditCatTier] = useState('variable');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [ruleToDelete, setRuleToDelete] = useState(null);

  // Rule form
  const [rulePattern, setRulePat] = useState('');
  const [ruleField, setRuleField] = useState('merchant');
  const [ruleCat, setRuleCat]    = useState('');
  const [rulePri, setRulePri]    = useState(50);
  const [ruleOverride, setRuleOverride] = useState(false);

  // Filter rules
  const [ruleSearch, setRuleSearch] = useUrlQueryState('rq', '', { replace: true });
  const [ruleTab, setRuleTab]       = useUrlQueryState('rtab', 'active', { replace: false });

  // Inline status banner shown after applying a rule
  const [ruleResult, setRuleResult] = useState(null);
  const showResult = (msg) => { setRuleResult(msg); setTimeout(() => setRuleResult(null), 5000); };

  const cats  = useQuery({ queryKey: ['categories'], queryFn: getCategories });
  const rules = useQuery({ queryKey: ['rules'],      queryFn: getCategoryRules });

  const addCat = useMutation({
    mutationFn: () => createCategory({ name: newName, icon: newIcon, color: newColor, type: newType }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      setNewName('');
      setColorManuallyPicked(false);
      setNewColor('#10b981');
      toast.success('Category created');
    },
    onError: (e) => {
      toast.error(e?.response?.data?.error || 'Failed to create category');
    },
  });

  const saveCat = useMutation({
    mutationFn: () => updateCategory(editCatId, {
      name: editCatName,
      icon: editCatIcon,
      color: editCatColor,
      type: editCatType,
      expense_tier: editCatType === 'expense' ? editCatTier : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      setEditCatId(null);
      toast.success('Category saved');
    },
  });

  const delCat = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      setDeleteConfirmId(null);
      toast.success('Category deleted');
    },
  });

  const colorMut = useMutation({
    mutationFn: ({ id, color }) => updateCategory(id, { color }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['bycat'] });
      toast.success('Category color updated');
    },
  });

  const harmonizeMut = useMutation({
    mutationFn: (updates) => harmonizeCategoryColors(updates),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['bycat'] });
      qc.invalidateQueries({ queryKey: ['summary'] });
      toast.success(`Harmonized colors across ${res?.data?.length ?? 'all'} categories for dark and light mode`);
    },
    onError: (e) => {
      toast.error(e?.response?.data?.error || 'Failed to harmonize colors');
    },
  });

  const handleHarmonizeAll = () => {
    if (!cats.data?.length) return;
    const updates = harmonizeCategoryPalette(cats.data);
    harmonizeMut.mutate(updates);
  };

  const tierMut = useMutation({
    mutationFn: ({ id, expense_tier }) => updateCategory(id, { expense_tier }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });

  const startEditCat = (c) => {
    setEditCatId(c.id);
    setEditCatName(c.name);
    setEditCatIcon(c.icon);
    setEditCatColor(c.color);
    setEditCatType(c.type);
    setEditCatTier(c.expense_tier || 'variable');
  };

  const addRule = useMutation({
    mutationFn: () => createCategoryRule({
      pattern: rulePattern,
      matchField: ruleField,
      categoryId: parseInt(ruleCat),
      priority: parseInt(rulePri),
      applyNow: true,
      overrideManual: ruleOverride,
    }),
    onSuccess: ({ applied }) => {
      qc.invalidateQueries({ queryKey: ['rules'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['bycat'] });
      qc.invalidateQueries({ queryKey: ['summary'] });
      showResult({
        kind: 'success',
        text: `Rule created · ${applied?.matched ?? 0} transactions matched, ${applied?.updated ?? 0} re-categorized.`,
      });
      setRulePattern('');
    },
    onError: (e) => showResult({ kind: 'error', text: e?.response?.data?.error || 'Failed to create rule' }),
  });

  const runRule = useMutation({
    mutationFn: ({ id, overrideManual }) => applyCategoryRule(id, { overrideManual }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['rules'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['bycat'] });
      qc.invalidateQueries({ queryKey: ['summary'] });
      showResult({
        kind: 'success',
        text: `Rule applied · ${result?.matched ?? 0} matched, ${result?.updated ?? 0} re-categorized.`,
      });
    },
    onError: (e) => showResult({ kind: 'error', text: e?.response?.data?.error || 'Failed to apply rule' }),
  });

  const toggleRule = useMutation({
    mutationFn: ({ id, is_disabled }) => updateCategoryRule(id, { is_disabled: is_disabled ? 0 : 1 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  });

  const delRule = useMutation({
    mutationFn: deleteCategoryRule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  });

  // Filtered rules
  const visibleRules = (rules.data ?? []).filter((r) => {
    if (ruleTab === 'active'   && r.is_disabled) return false;
    if (ruleTab === 'disabled' && !r.is_disabled) return false;
    if (ruleSearch) {
      const q = ruleSearch.toLowerCase();
      return r.pattern.toLowerCase().includes(q) || r.category_name?.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Categories & Rules</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Manage categories and auto-categorization rules</p>
      </div>

      {/* ── Categories ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Categories</h2>
            <p className="text-xs text-gray-400">Classify income, expenses, and transfers with dark & light optimized colors</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleHarmonizeAll}
            disabled={harmonizeMut.isPending || !cats.data?.length}
            className="gap-1.5 text-xs h-8 bg-white/60 dark:bg-white/[0.04] border-black/[0.08] dark:border-white/[0.08] hover:bg-brand-50/50 dark:hover:bg-brand-950/30 hover:text-brand-600 dark:hover:text-brand-400"
            title="Auto-assign harmonious, accessible colors to all categories for dark and light modes"
          >
            <Sparkles size={13} className={harmonizeMut.isPending ? 'animate-spin text-brand-500' : 'text-brand-500'} />
            <span>{harmonizeMut.isPending ? 'Harmonizing...' : 'Harmonize Colors'}</span>
          </Button>
        </div>
        {cats.isLoading ? <TableSkeleton rows={4} /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {cats.data?.map((c) => (
              <div key={c.id}>
                {/* ── Delete confirmation ── */}
                {deleteConfirmId === c.id ? (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                    <p className="text-xs text-red-600 dark:text-red-400 flex-1">
                      Delete <strong>{c.name}</strong>? Transactions will move to Uncategorized.
                    </p>
                    <button
                      onClick={() => delCat.mutate(c.id)}
                      className="text-xs bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded font-medium"
                    >Delete</button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="text-gray-400 hover:text-gray-600"
                    ><X size={14} /></button>
                  </div>
                ) : editCatId === c.id ? (
                  /* ── Inline edit ── */
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-50 dark:bg-brand-900/10 border border-brand-200 dark:border-brand-800 flex-wrap">
                    <input type="text" value={editCatIcon} onChange={(e) => setEditCatIcon(e.target.value)}
                      className="input w-14 text-center py-1.5 text-sm" placeholder="Icon" />
                    <input type="text" value={editCatName} onChange={(e) => setEditCatName(e.target.value)}
                      className="input flex-1 min-w-[100px] py-1.5 text-sm" placeholder="Name"
                      onKeyDown={(e) => e.key === 'Enter' && saveCat.mutate()} />
                    <CategoryColorPicker
                      color={editCatColor}
                      categoryName={editCatName}
                      onChange={setEditCatColor}
                    />
                    <Select value={editCatType} onValueChange={setEditCatType}>
                      <SelectTrigger className="w-28 py-1.5 h-9 min-h-[36px] text-xs">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="expense">Expense</SelectItem>
                        <SelectItem value="savings">Savings (not spending)</SelectItem>
                        <SelectItem value="income">Income</SelectItem>
                        <SelectItem value="transfer">Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                    {editCatType === 'expense' && (
                      <Select value={editCatTier} onValueChange={setEditCatTier}>
                        <SelectTrigger className="w-28 py-1.5 h-9 min-h-[36px] text-xs">
                          <SelectValue placeholder="Tier" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="essential">Essential</SelectItem>
                          <SelectItem value="variable">Variable</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <button onClick={() => saveCat.mutate()} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20">
                      <Check size={15} />
                    </button>
                    <button onClick={() => setEditCatId(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  /* ── Normal row ── */
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50/80 dark:bg-white/[0.03] border border-black/[0.04] dark:border-white/[0.05] group transition-all hover:bg-gray-100/60 dark:hover:bg-white/[0.05]">
                    <span className="text-lg shrink-0">{c.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{c.name}</p>
                      <p className="text-xs text-gray-400 capitalize">
                        {c.type}
                        {c.type === 'expense' ? ` · ${c.expense_tier || 'variable'}` : ''}
                      </p>
                    </div>
                    {c.type === 'expense' && (
                      <Select
                        value={c.expense_tier || 'variable'}
                        onValueChange={(val) => tierMut.mutate({ id: c.id, expense_tier: val })}
                      >
                        <SelectTrigger className="w-24 py-1 h-8 min-h-[32px] text-xs">
                          <SelectValue placeholder="Tier" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="essential">Essential</SelectItem>
                          <SelectItem value="variable">Variable</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <CategoryColorPicker
                      color={c.color}
                      categoryName={c.name}
                      onChange={(newColor) => colorMut.mutate({ id: c.id, color: newColor })}
                    />
                    <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={() => startEditCat(c)}
                        className="p-1 rounded text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20"
                        title="Edit category"
                      ><Pencil size={13} /></button>
                      {!c.is_default && (
                        <button
                          onClick={() => setDeleteConfirmId(c.id)}
                          className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Delete category"
                        ><Trash2 size={13} /></button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-black/[0.06] dark:border-white/[0.08] pt-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">Add category</p>
          <div className="flex gap-2 flex-wrap items-center">
            <input
              type="text" placeholder="Name" value={newName}
              onChange={(e) => handleNameChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && newName && addCat.mutate()}
              className="input flex-1 min-w-[120px]"
            />
            <input type="text" placeholder="Icon" value={newIcon} onChange={(e) => setNewIcon(e.target.value)} className="input w-16 text-center" />
            <CategoryColorPicker
              color={newColor}
              categoryName={newName}
              onChange={(chosen) => {
                setColorManuallyPicked(true);
                setNewColor(chosen);
              }}
              size="lg"
            />
            <Select value={newType} onValueChange={handleTypeChange}>
              <SelectTrigger className="w-36 text-sm">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Expense</SelectItem>
                <SelectItem value="savings">Savings (not spending)</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
              </SelectContent>
            </Select>
            <button onClick={() => addCat.mutate()} disabled={!newName || addCat.isPending} className="btn-primary flex items-center gap-1.5">
              <Plus size={15} />{addCat.isPending ? 'Adding...' : 'Add'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Rules ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-brand-500" />
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Auto-categorization Rules</h2>
            <span className="text-xs bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.04] dark:border-white/[0.06] text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full">{rules.data?.length ?? 0}</span>
          </div>

          {/* Tab filter */}
          <Tabs value={ruleTab} onValueChange={setRuleTab}>
            <TabsList className="h-8 p-0.5">
              {[['active','Active'],['disabled','Disabled'],['all','All']].map(([val, label]) => (
                <TabsTrigger
                  key={val}
                  value={val}
                  className="px-2.5 py-1 text-xs"
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Rule search */}
        <input
          type="text"
          placeholder="Filter rules..."
          value={ruleSearch}
          onChange={(e) => setRuleSearch(e.target.value)}
          className="input mb-3 text-sm"
        />

        {rules.isLoading ? <TableSkeleton rows={5} /> : (
          <div className="space-y-1.5 mb-4 max-h-96 overflow-y-auto pr-1">
            {visibleRules.map((r) => (
              <div
                key={r.id}
                className={clsx(
                  'flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-opacity border border-black/[0.04] dark:border-white/[0.06]',
                  r.is_disabled
                    ? 'bg-slate-50/50 dark:bg-white/[0.02] opacity-50'
                    : 'bg-slate-50/80 dark:bg-white/[0.04]'
                )}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="font-mono text-xs bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {r.match_field}
                  </span>
                  <span className="text-gray-800 dark:text-gray-200 truncate font-medium">"{r.pattern}"</span>
                  <span className="text-gray-400">→</span>
                  <span className="text-gray-600 dark:text-gray-300 truncate">{r.category_name}</span>
                </div>

                <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                  {/* Stats */}
                  <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400">
                    <span>p={r.priority}</span>
                    <span>hits={r.hit_count}</span>
                    {r.last_matched && <span title="Last matched">{r.last_matched.slice(0,10)}</span>}
                    {r.created_by && r.created_by !== 'system' && (
                      <span className="bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 px-1 rounded">{r.created_by}</span>
                    )}
                    {r.confidence != null && r.confidence < 1 && (
                      <span className="text-amber-500">{Math.round(r.confidence * 100)}%</span>
                    )}
                  </div>

                  {/* Apply this rule against the current database (skip manually-set rows) */}
                  <button
                    onClick={() => runRule.mutate({ id: r.id, overrideManual: false })}
                    disabled={r.is_disabled || runRule.isPending}
                    className="text-gray-400 hover:text-brand-500 disabled:opacity-30 transition-colors"
                    title="Apply this rule to existing transactions (Shift+click to override manual ones)"
                    onClickCapture={(e) => {
                      if (e.shiftKey) {
                        e.preventDefault();
                        runRule.mutate({ id: r.id, overrideManual: true });
                      }
                    }}
                  >
                    <Play size={13} />
                  </button>

                  {/* Toggle disable */}
                  <Switch
                    checked={!r.is_disabled}
                    onCheckedChange={() => toggleRule.mutate({ id: r.id, is_disabled: r.is_disabled })}
                    title={r.is_disabled ? 'Enable rule' : 'Disable rule'}
                    aria-label={r.is_disabled ? 'Enable rule' : 'Disable rule'}
                  />

                  <button type="button" onClick={() => setRuleToDelete(r)} className="text-gray-400 hover:text-red-500">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
            {!visibleRules.length && (
              <EmptyState
                title="No rules match this filter"
                description="Try selecting another tab or clearing your search."
              />
            )}
          </div>
        )}

        {/* Result banner from create / apply */}
        {ruleResult && (
          <div className={clsx(
            'mb-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2',
            ruleResult.kind === 'error'
              ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300'
              : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
          )}>
            {ruleResult.kind === 'error' ? <AlertCircle size={13} /> : <Check size={13} />}
            <span>{ruleResult.text}</span>
          </div>
        )}

        {/* Add rule form */}
        <div className="border-t border-black/[0.06] dark:border-white/[0.08] pt-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">Add rule</p>
          <div className="flex gap-2 flex-wrap">
            <input
              type="text" placeholder="Pattern (e.g. NETFLIX)" value={rulePattern}
              onChange={(e) => setRulePat(e.target.value)} className="input flex-1 min-w-[140px]"
            />
            <Select value={ruleField} onValueChange={setRuleField}>
              <SelectTrigger className="w-36 text-sm">
                <SelectValue placeholder="Field" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="merchant">merchant</SelectItem>
                <SelectItem value="beneficiary">beneficiary</SelectItem>
                <SelectItem value="details">details</SelectItem>
              </SelectContent>
            </Select>
            <Select value={ruleCat || 'none'} onValueChange={(val) => setRuleCat(val === 'none' ? '' : val)}>
              <SelectTrigger className="w-48 text-sm">
                <SelectValue placeholder="→ Category" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="none">→ Category</SelectItem>
                {cats.data?.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    <span className="mr-2">{c.icon}</span>
                    <span>{c.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              type="number" placeholder="Priority" value={rulePri}
              onChange={(e) => setRulePri(e.target.value)} className="input w-24"
            />
            <button
              onClick={() => addRule.mutate()}
              disabled={!rulePattern || !ruleCat || addRule.isPending}
              className="btn-primary flex items-center gap-1.5"
            >
              <Plus size={15} />{addRule.isPending ? 'Applying...' : 'Add & Apply'}
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-2 cursor-pointer w-fit">
            <input
              type="checkbox" checked={ruleOverride} onChange={(e) => setRuleOverride(e.target.checked)}
              className="rounded"
            />
            Also override transactions I've manually categorized
          </label>
          <p className="text-xs text-gray-400 mt-2">
            Higher priority = applied first. New rules are immediately applied to existing transactions.
            Use the <Play size={11} className="inline -mt-0.5" /> button to re-run a rule later.
          </p>
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!ruleToDelete}
        title="Delete Category Rule"
        message={`Delete rule matching "${ruleToDelete?.pattern}"? This action cannot be undone.`}
        confirmText="Delete"
        onConfirm={() => {
          if (ruleToDelete?.id) delRule.mutate(ruleToDelete.id);
          setRuleToDelete(null);
        }}
        onCancel={() => setRuleToDelete(null)}
      />
    </div>
  );
}
