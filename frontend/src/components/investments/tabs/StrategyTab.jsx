import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts';
import clsx from 'clsx';
import {
  listAllocationStrategies,
  getAllocationStrategy,
  createAllocationStrategy,
  updateAllocationStrategy,
  deleteAllocationStrategy,
  replaceAllocationCategories,
  replaceAllocationTargets,
  replaceAllocationMappings,
  getActiveAllocationCompute,
  getAllocationHoldingsForMapping,
  suggestAllocationFromAssetClasses,
} from '../../../api/client';
import LoadingSpinner from '../../ui/LoadingSpinner';
import { fmtEur, fmtPct } from '../../../utils/displayFormat';

const FALLBACK_COLORS = [
  '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444',
  '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#ec4899',
];

function sumTargets(cats) {
  return cats.reduce((s, c) => s + (Number(c.targetPct) || 0), 0);
}

function AllocationCompareChart({ rows }) {
  if (!rows?.length) return null;
  const data = rows.map((r) => ({
    name: r.name,
    actual: Number(r.actualPct) || 0,
    target: Number(r.targetPct) || 0,
    color: r.color,
    valueEur: r.valueEur,
    driftPct: r.driftPct,
  }));
  const h = Math.max(160, data.length * 40);

  return (
    <div className="w-full" style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
          <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 11 }} unit="%" />
          <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(v, name, p) => {
              if (name === 'actual') {
                return [`${fmtPct(v, { decimals: 1 })} · ${fmtEur(p.payload.valueEur)}`, 'Actual'];
              }
              return [`${fmtPct(v, { decimals: 1 })}`, 'Target'];
            }}
            labelFormatter={(label, payload) => {
              const drift = payload?.[0]?.payload?.driftPct;
              return drift != null
                ? `${label} (drift ${fmtPct(drift, { decimals: 1, sign: true })})`
                : label;
            }}
          />
          <Legend />
          <Bar dataKey="actual" name="Actual" radius={[0, 4, 4, 0]} barSize={12}>
            {data.map((d, i) => (
              <Cell key={`a-${i}`} fill={d.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
            ))}
          </Bar>
          <Bar dataKey="target" name="Target" fill="#94a3b8" radius={[0, 4, 4, 0]} barSize={12} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function StrategyTab({ brokerFilter = '' }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [draftCats, setDraftCats] = useState([]);
  const [draftMaps, setDraftMaps] = useState({});
  const [name, setName] = useState('');
  const [contribution, setContribution] = useState('');
  const [includeCash, setIncludeCash] = useState(false);
  const [cashCategoryId, setCashCategoryId] = useState('');
  const [toast, setToast] = useState(null);
  const [dirty, setDirty] = useState(false);

  const strategiesQ = useQuery({
    queryKey: ['allocationStrategies'],
    queryFn: listAllocationStrategies,
  });

  const strategies = strategiesQ.data || [];
  const activeId = strategies.find((s) => s.isActive)?.id ?? null;
  const effectiveId = selectedId || activeId || strategies[0]?.id || null;

  useEffect(() => {
    if (!selectedId && effectiveId) setSelectedId(effectiveId);
  }, [effectiveId, selectedId]);

  const bundleQ = useQuery({
    queryKey: ['allocationStrategy', effectiveId],
    queryFn: () => getAllocationStrategy(effectiveId),
    enabled: !!effectiveId,
  });

  const holdingsQ = useQuery({
    queryKey: ['allocationHoldings', brokerFilter],
    queryFn: () => getAllocationHoldingsForMapping(brokerFilter),
  });

  const computeQ = useQuery({
    queryKey: ['allocationCompute', contribution || 'default', brokerFilter],
    queryFn: () => getActiveAllocationCompute({
      ...(contribution !== '' ? { contribution: Number(contribution) } : {}),
      ...(brokerFilter ? { broker: brokerFilter } : {}),
    }),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const b = bundleQ.data;
    if (!b?.strategy || dirty) return;
    setName(b.strategy.name || '');
    setContribution(
      b.strategy.monthlyContribution != null ? String(b.strategy.monthlyContribution) : '',
    );
    setIncludeCash(!!b.strategy.includeBrokerCash);
    setCashCategoryId(b.strategy.cashCategoryId != null ? String(b.strategy.cashCategoryId) : '');
    const tgt = new Map((b.targets || []).map((t) => [t.categoryId, t.targetPct]));
    setDraftCats(
      (b.categories || []).map((c, i) => ({
        id: c.id,
        name: c.name,
        color: c.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
        sortOrder: c.sortOrder ?? i,
        targetPct: tgt.get(c.id) ?? 0,
      })),
    );
    const maps = {};
    for (const m of b.maps || []) {
      const key = m.holdingKey === 'cash|AVAILABLE|EUR'
        ? 'cash|BROKER_UNINVESTED|EUR'
        : m.holdingKey;
      maps[key] = m.categoryId;
    }
    setDraftMaps(maps);
  }, [bundleQ.data, dirty]);

  const invalidate = () => {
    ['allocationStrategies', 'allocationStrategy', 'allocationCompute', 'allocationHoldings', 'assets']
      .forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const createMut = useMutation({
    mutationFn: () => createAllocationStrategy({
      name: 'My allocation',
      isActive: true,
      monthlyContribution: 200,
      includeBrokerCash: true,
    }),
    onSuccess: async (bundle) => {
      setDirty(false);
      setSelectedId(bundle.strategy.id);
      try {
        const withCats = await replaceAllocationCategories(bundle.strategy.id, [
          { name: 'Equities', color: '#0ea5e9', sortOrder: 0 },
          { name: 'Bonds', color: '#10b981', sortOrder: 1 },
          { name: 'Cash', color: '#f59e0b', sortOrder: 2 },
        ]);
        const byName = Object.fromEntries(withCats.categories.map((c) => [c.name, c.id]));
        await replaceAllocationTargets(bundle.strategy.id, [
          { categoryId: byName.Equities, targetPct: 70 },
          { categoryId: byName.Bonds, targetPct: 20 },
          { categoryId: byName.Cash, targetPct: 10 },
        ].filter((t) => t.categoryId));
        const cashId = byName.Cash;
        if (cashId) {
          await updateAllocationStrategy(bundle.strategy.id, { cashCategoryId: cashId, includeBrokerCash: true });
        }
      } catch (e) {
        showToast(e.message || 'Could not seed categories', false);
      }
      invalidate();
      showToast('Strategy created — edit categories and map your holdings.');
    },
    onError: (e) => showToast(e.message, false),
  });

  const saveMetaMut = useMutation({
    mutationFn: () => updateAllocationStrategy(effectiveId, {
      name,
      monthlyContribution: contribution === '' ? null : Number(contribution),
      includeBrokerCash: includeCash,
      cashCategoryId: cashCategoryId === '' ? null : Number(cashCategoryId),
      isActive: true,
    }),
    onSuccess: () => { invalidate(); showToast('Strategy settings saved'); setDirty(false); },
    onError: (e) => showToast(e.message, false),
  });

  const saveAllMut = useMutation({
    mutationFn: async () => {
      const sum = sumTargets(draftCats);
      if (Math.abs(sum - 100) > 0.01) {
        throw new Error(`Targets must sum to 100% (currently ${sum.toFixed(1)}%)`);
      }
      await updateAllocationStrategy(effectiveId, {
        name,
        monthlyContribution: contribution === '' ? null : Number(contribution),
        includeBrokerCash: includeCash,
        cashCategoryId: cashCategoryId === '' ? null : Number(cashCategoryId),
        isActive: true,
      });
      const catBundle = await replaceAllocationCategories(
        effectiveId,
        draftCats.map((c, i) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          sortOrder: i,
        })),
      );
      const nameToId = new Map(catBundle.categories.map((c) => [c.name, c.id]));
      const idRemap = new Map();
      draftCats.forEach((c) => {
        const newId = c.id && catBundle.categories.some((x) => x.id === c.id)
          ? c.id
          : nameToId.get(c.name);
        if (c.id && newId) idRemap.set(c.id, newId);
        else if (newId) idRemap.set(c.name, newId);
      });
      const targets = catBundle.categories.map((c) => {
        const draft = draftCats.find((d) => d.id === c.id || d.name === c.name);
        return { categoryId: c.id, targetPct: Number(draft?.targetPct) || 0 };
      });
      await replaceAllocationTargets(effectiveId, targets);
      const holdings = holdingsQ.data?.holdings || [];
      const mappings = holdings
        .map((h) => {
          const raw = draftMaps[h.holdingKey]
            ?? (h.holdingKey === 'cash|BROKER_UNINVESTED|EUR'
              ? draftMaps['cash|AVAILABLE|EUR']
              : undefined);
          if (raw == null || raw === '') return null;
          let categoryId = null;
          if (typeof raw === 'number' || /^\d+$/.test(String(raw))) {
            categoryId = Number(raw);
            if (idRemap.has(categoryId)) categoryId = idRemap.get(categoryId);
          } else {
            categoryId = nameToId.get(String(raw)) ?? null;
          }
          if (!categoryId) return null;
          return {
            holdingKey: h.holdingKey,
            broker: h.broker,
            ticker: h.ticker,
            currency: h.currency,
            categoryId,
          };
        })
        .filter(Boolean);
      await replaceAllocationMappings(effectiveId, mappings);
    },
    onSuccess: () => {
      setDirty(false);
      invalidate();
      showToast('Strategy, targets, and mappings saved');
    },
    onError: (e) => showToast(e.message, false),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteAllocationStrategy(effectiveId),
    onSuccess: () => {
      setSelectedId(null);
      setDirty(false);
      invalidate();
      showToast('Strategy deleted');
    },
    onError: (e) => showToast(e.message, false),
  });

  const suggestMut = useMutation({
    mutationFn: () => suggestAllocationFromAssetClasses(effectiveId, brokerFilter),
    onSuccess: (data) => {
      const cats = (data.categories || []).map((c, i) => {
        const hint = data.targetHints?.find((t) => t.name === c.name);
        return {
          id: null,
          name: c.name,
          color: c.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
          sortOrder: i,
          targetPct: hint?.targetPct ?? 0,
        };
      });
      setDraftCats(cats);
      const maps = { ...draftMaps };
      for (const [className, list] of Object.entries(data.byClass || {})) {
        for (const h of list) {
          // temporary key by name until save remaps ids
          maps[h.holdingKey] = className;
        }
      }
      // store suggested class names; on save we need category ids — convert after user saves categories first
      setDraftMaps((prev) => {
        const next = { ...prev };
        for (const h of data.holdings || []) {
          if (h.suggestedAssetClass) next[h.holdingKey] = h.suggestedAssetClass;
        }
        return next;
      });
      setDirty(true);
      showToast('Suggestions applied — review targets and click Save all');
    },
    onError: (e) => showToast(e.message, false),
  });

  const targetSum = useMemo(() => sumTargets(draftCats), [draftCats]);
  const targetsOk = Math.abs(targetSum - 100) <= 0.01;
  const holdings = holdingsQ.data?.holdings || [];
  const compute = computeQ.data?.compute;
  const emergencyReserve = compute?.emergencyReserve
    || holdingsQ.data?.emergencyReserve
    || null;
  const brokerCashEur = compute?.brokerCashEur
    ?? holdingsQ.data?.brokerCashEur
    ?? null;
  const chartRows = compute?.categories || [];

  // Resolve draft map values that may be class names (from suggest) to category ids by name
  const categoryOptions = draftCats.map((c) => ({
    id: c.id ?? c.name,
    label: c.name,
    color: c.color,
  }));

  if (strategiesQ.isLoading) {
    return <div className="card p-12 flex justify-center"><LoadingSpinner /></div>;
  }

  if (!strategies.length) {
    return (
      <div className="card p-8 text-center space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Allocation strategy</h2>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Define custom asset categories, set target percentages, map your holdings, and get a buy-only monthly deposit plan.
        </p>
        <button
          type="button"
          className="btn-primary"
          disabled={createMut.isPending}
          onClick={() => createMut.mutate()}
        >
          {createMut.isPending ? 'Creating…' : 'Create strategy'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {toast && (
        <div className={clsx(
          'rounded-lg px-4 py-2 text-sm',
          toast.ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
            : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300',
        )}>
          {toast.msg}
        </div>
      )}

      <div className="card p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
          <div className="space-y-2 min-w-0 flex-1">
            <label className="text-xs font-medium text-gray-500">Active strategy</label>
            <div className="flex flex-wrap gap-2">
              <select
                className="input max-w-xs"
                value={effectiveId || ''}
                onChange={(e) => { setDirty(false); setSelectedId(Number(e.target.value)); }}
              >
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.isActive ? ' (active)' : ''}
                  </option>
                ))}
              </select>
              <button type="button" className="btn-secondary" onClick={() => createMut.mutate()}>
                New
              </button>
              <button
                type="button"
                className="btn-ghost text-red-500"
                disabled={!effectiveId || deleteMut.isPending}
                onClick={() => {
                  if (window.confirm('Delete this strategy and all its categories/mappings?')) {
                    deleteMut.mutate();
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={!effectiveId || suggestMut.isPending}
              onClick={() => suggestMut.mutate()}
            >
              Suggest from asset class
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!effectiveId || saveAllMut.isPending || !targetsOk}
              onClick={() => saveAllMut.mutate()}
            >
              {saveAllMut.isPending ? 'Saving…' : 'Save all'}
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-500">Name</label>
            <input
              className="input mt-1"
              value={name}
              onChange={(e) => { setName(e.target.value); setDirty(true); }}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Monthly contribution (€)</label>
            <input
              className="input mt-1"
              type="number"
              min="0"
              step="10"
              value={contribution}
              onChange={(e) => { setContribution(e.target.value); setDirty(true); }}
            />
          </div>
          <div className="flex items-end gap-2 pb-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={includeCash}
                onChange={(e) => { setIncludeCash(e.target.checked); setDirty(true); }}
              />
              Auto-map brokerage cash → Cash category
            </label>
          </div>
          <div>
            <label className="text-xs text-gray-500">Cash category</label>
            <select
              className="input mt-1"
              value={cashCategoryId}
              disabled={!includeCash}
              onChange={(e) => { setCashCategoryId(e.target.value); setDirty(true); }}
            >
              <option value="">—</option>
              {draftCats.map((c) => (
                <option key={c.id ?? c.name} value={c.id ?? ''}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="button"
          className="btn-secondary text-xs"
          disabled={saveMetaMut.isPending}
          onClick={() => saveMetaMut.mutate()}
        >
          Save settings only
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white">Categories & targets</h3>
            <span className={clsx('text-xs font-medium', targetsOk ? 'text-emerald-600' : 'text-amber-600')}>
              Sum {targetSum.toFixed(1)}% {targetsOk ? '✓' : '(need 100%)'}
            </span>
          </div>
          <div className="space-y-2">
            {draftCats.map((c, idx) => (
              <div key={c.id ?? `new-${idx}`} className="flex flex-wrap items-center gap-2">
                <input
                  type="color"
                  className="h-9 w-10 rounded border border-gray-200 dark:border-gray-700 bg-transparent"
                  value={c.color}
                  onChange={(e) => {
                    setDraftCats((prev) => prev.map((x, i) => (i === idx ? { ...x, color: e.target.value } : x)));
                    setDirty(true);
                  }}
                />
                <input
                  className="input flex-1 min-w-[120px]"
                  value={c.name}
                  onChange={(e) => {
                    setDraftCats((prev) => prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)));
                    setDirty(true);
                  }}
                />
                <input
                  className="input w-24"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={c.targetPct}
                  onChange={(e) => {
                    setDraftCats((prev) => prev.map((x, i) => (
                      i === idx ? { ...x, targetPct: Number(e.target.value) } : x
                    )));
                    setDirty(true);
                  }}
                />
                <span className="text-xs text-gray-400">%</span>
                <button
                  type="button"
                  className="btn-ghost text-xs text-red-500"
                  onClick={() => {
                    setDraftCats((prev) => prev.filter((_, i) => i !== idx));
                    setDirty(true);
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn-secondary text-sm"
            onClick={() => {
              setDraftCats((prev) => [
                ...prev,
                {
                  id: null,
                  name: `Category ${prev.length + 1}`,
                  color: FALLBACK_COLORS[prev.length % FALLBACK_COLORS.length],
                  sortOrder: prev.length,
                  targetPct: 0,
                },
              ]);
              setDirty(true);
            }}
          >
            Add category
          </button>
        </div>

        <div className="card p-4 sm:p-5 space-y-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">Actual vs target</h3>
          {computeQ.isLoading ? (
            <LoadingSpinner />
          ) : chartRows.length ? (
            <>
              <AllocationCompareChart rows={chartRows} />
              {compute?.unmapped?.valueEur > 0.01 && (
                <p className="text-xs text-amber-600">
                  Unmapped holdings: {fmtEur(compute.unmapped.valueEur)} ({fmtPct(compute.unmapped.actualPct, { decimals: 1 })})
                </p>
              )}
              {!compute?.targetsValid && (
                <p className="text-xs text-amber-600">Active strategy targets do not sum to 100% yet.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500">Save an active strategy with categories to see the chart.</p>
          )}
        </div>
      </div>

      {(emergencyReserve || brokerCashEur != null) && (
        <div className="card p-4 sm:p-5 grid sm:grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Emergency / daily cash</h3>
            <p className="text-xs text-gray-500 mt-1">
              Bank + Revolut liquidity reserve — excluded from portfolio valuation and rebalancing.
            </p>
            <p className="mt-2 text-lg font-semibold tabular-nums text-gray-900 dark:text-white">
              {fmtEur(emergencyReserve?.totalEur ?? 0)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Bank {fmtEur(emergencyReserve?.bankEur ?? 0)} · Revolut {fmtEur(emergencyReserve?.revolutEur ?? 0)}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Brokerage cash (portfolio)</h3>
            <p className="text-xs text-gray-500 mt-1">
              Uninvested cash at the broker — this is the only cash that counts toward your Cash asset class.
            </p>
            <p className="mt-2 text-lg font-semibold tabular-nums text-gray-900 dark:text-white">
              {fmtEur(brokerCashEur ?? 0)}
            </p>
          </div>
        </div>
      )}

      <div className="card p-4 sm:p-5 space-y-3">
        <h3 className="font-semibold text-gray-900 dark:text-white">Map holdings → categories</h3>
        <p className="text-xs text-gray-500">
          Brokerage uninvested cash is listed as a holding when present. Map it (or enable auto-map) to your Cash category.
          Bank and Revolut balances stay in Emergency / daily cash above and are not part of this portfolio.
        </p>
        {holdingsQ.isLoading ? <LoadingSpinner /> : (
          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 sticky top-0 bg-white dark:bg-gray-900">
                <tr>
                  <th className="text-left py-2 pr-3">Holding</th>
                  <th className="text-right py-2 pr-3">Value</th>
                  <th className="text-left py-2">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {holdings.map((h) => (
                  <tr key={h.holdingKey} className={h.isCashBucket ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''}>
                    <td className="py-2 pr-3">
                      <div className="font-medium text-gray-900 dark:text-white">{h.displayName}</div>
                      <div className="text-xs text-gray-400">
                        {h.isCashBucket
                          ? `Brokerage uninvested ${fmtEur(h.cashBreakdown?.brokerCashEur ?? h.marketValueEur ?? 0)}`
                          : `${h.ticker} · ${h.broker}`}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums font-medium">{fmtEur(h.marketValueEur)}</td>
                    <td className="py-2">
                      <select
                        className="input text-sm"
                        value={draftMaps[h.holdingKey] ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDraftMaps((prev) => ({
                            ...prev,
                            [h.holdingKey]: v === '' ? undefined : (/^\d+$/.test(v) ? Number(v) : v),
                          }));
                          setDirty(true);
                        }}
                      >
                        <option value="">Unmapped</option>
                        {categoryOptions.map((c) => (
                          <option key={String(c.id)} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
                {!holdings.length && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-gray-400">No open holdings</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card p-4 sm:p-5 space-y-3">
        <h3 className="font-semibold text-gray-900 dark:text-white">Buy-only deposit plan</h3>
        {compute?.depositNote && (
          <p className="text-xs text-gray-500">{compute.depositNote}</p>
        )}
        {compute?.depositPlan?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500">
                <tr>
                  <th className="text-left py-2">Category</th>
                  <th className="text-right py-2">Deposit</th>
                  <th className="text-right py-2">Share</th>
                  <th className="text-right py-2">Deficit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {compute.depositPlan.map((p) => (
                  <tr key={p.categoryId}>
                    <td className="py-2">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full mr-2"
                        style={{ background: p.color }}
                      />
                      {p.name}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium">{fmtEur(p.depositEur)}</td>
                    <td className="py-2 text-right tabular-nums">{fmtPct(p.depositPct, { decimals: 1 })}</td>
                    <td className="py-2 text-right tabular-nums text-amber-600">
                      {fmtPct(p.deficitPct, { decimals: 1 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Set a monthly contribution and save targets to see the plan.</p>
        )}
      </div>
    </div>
  );
}
