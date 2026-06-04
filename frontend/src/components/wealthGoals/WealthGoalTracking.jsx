import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from 'recharts';
import {
  CheckCircle2, XCircle, Trash2, Save, RefreshCw, Plus, Archive,
  MoreHorizontal, ChevronDown, Target, AlertCircle,
} from 'lucide-react';
import clsx from 'clsx';
import { format, addYears } from 'date-fns';
import {
  getWealthGoals,
  getWealthGoalProgress,
  createWealthGoal,
  updateWealthGoal,
  deleteWealthGoal,
  getInvestmentPlannerBaseline,
} from '../../api/client';
import LoadingSpinner from '../ui/LoadingSpinner';
import QueryErrorPanel from '../ui/QueryErrorPanel';
import PlannerMetricStrip from '../investments/PlannerMetricStrip';
import { fmtEur, fmtPct } from '../../utils/displayFormat';
import { usePrivacy } from '../../context/PrivacyContext';
import {
  normalizeGoalId,
  useGoalsPageDefaultGoalId,
  resolveGoalFromActiveAndArchives,
} from '../../hooks/useGoalPreferences';

const BASIS_OPTIONS = [
  { id: 'portfolio', label: 'Portfolio (holdings + cash)' },
  { id: 'net_worth', label: 'Total assets (Dashboard)' },
  { id: 'portfolio_no_cash', label: 'Holdings only' },
];

const ON_TRACK_HERO = {
  ahead: 'bg-emerald-600 dark:bg-emerald-700',
  on_track: 'bg-brand-600 dark:bg-brand-700',
  behind: 'bg-amber-600 dark:bg-amber-700',
  completed: 'bg-emerald-600 dark:bg-emerald-700',
};

function defaultForm() {
  const d = addYears(new Date(), 15);
  return {
    name: 'Financial independence',
    targetAmount: 500000,
    targetDate: format(d, 'yyyy-MM-dd'),
    basis: 'net_worth',
    broker: '',
    annualReturn: 7,
    notes: '',
  };
}

function statusLabel(status) {
  if (status === 'achieved') return 'Achieved';
  if (status === 'archived') return 'Archived';
  return 'Active';
}

function onTrackMessage(data) {
  if (data.completed) return 'Goal reached';
  if (data.onTrack === 'ahead') return 'Ahead of plan';
  if (data.onTrack === 'on_track') return 'On track';
  return 'Behind on net savings';
}

function onTrackDetail(data) {
  if (data.completed) return 'Congratulations — you hit your target.';
  if (data.onTrack === 'behind') {
    return 'Spend less, earn more, or extend the deadline.';
  }
  if (data.projectedCompletionHint) return `At required pace: ${data.projectedCompletionHint}`;
  return 'Monthly checks use net savings (Analytics).';
}

function GoalPicker({
  goals, archives, selectedId, panel, onSelect, onCreate, showArchives, onToggleArchives,
  defaultGoalId, onSetDefault,
}) {
  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40 p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Your goals</p>
        <button type="button" onClick={onCreate} className="btn-secondary text-xs inline-flex items-center gap-1">
          <Plus size={14} />
          New goal
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {goals.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onSelect(normalizeGoalId(g.id))}
            className={clsx(
              'px-3 py-2 rounded-lg text-sm font-medium border transition-colors',
              selectedId === normalizeGoalId(g.id) && panel === 'track'
                ? 'bg-brand-600 border-brand-600 text-white shadow-sm'
                : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-brand-400'
            )}
          >
            {g.name}
          </button>
        ))}
        {!goals.length && (
          <span className="text-sm text-gray-400 py-2">No active goals</span>
        )}
      </div>
      {selectedId != null && onSetDefault && panel === 'track' && (
        <button
          type="button"
          onClick={() => onSetDefault(selectedId)}
          className={clsx(
            'text-xs font-medium rounded-lg px-2.5 py-1.5 border transition-colors',
            defaultGoalId === selectedId
              ? 'border-brand-400 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300'
              : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-brand-400 hover:text-gray-700',
          )}
        >
          {defaultGoalId === selectedId
            ? 'Default when opening this page'
            : 'Set as default when opening this page'}
        </button>
      )}
      {archives.length > 0 && (
        <div>
          <button
            type="button"
            onClick={onToggleArchives}
            className="text-xs font-medium text-gray-500 flex items-center gap-1 hover:text-gray-700"
          >
            Archives ({archives.length})
            <ChevronDown size={14} className={clsx('transition-transform', showArchives && 'rotate-180')} />
          </button>
          {showArchives && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {archives.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => onSelect(normalizeGoalId(g.id))}
                  className={clsx(
                    'px-2.5 py-1 rounded-lg text-xs border',
                    selectedId === normalizeGoalId(g.id) && panel === 'track'
                      ? 'border-brand-400 bg-brand-50 dark:bg-brand-950/30'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500'
                  )}
                >
                  {g.name}
                  <span className="text-[10px] text-gray-400 ml-1">{statusLabel(g.status)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function WealthGoalTracking() {
  usePrivacy();
  const qc = useQueryClient();
  const [panel, setPanel] = useState('track');
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [showArchives, setShowArchives] = useState(false);
  const [defaultGoalId, setDefaultGoalId] = useGoalsPageDefaultGoalId();

  const activeGoalsQ = useQuery({
    queryKey: ['wealth-goals', 'active'],
    queryFn: () => getWealthGoals({ status: 'active' }),
    retry: 2,
  });

  const archivesQ = useQuery({
    queryKey: ['wealth-goals', 'archived'],
    queryFn: () => getWealthGoals({ status: 'archived' }),
    retry: 1,
  });

  const activeGoals = Array.isArray(activeGoalsQ.data) ? activeGoalsQ.data : [];
  const archives = Array.isArray(archivesQ.data) ? archivesQ.data : [];

  useEffect(() => {
    if (panel !== 'track' || selectedId != null) return;
    const resolved = resolveGoalFromActiveAndArchives(activeGoals, archives, defaultGoalId);
    if (resolved?.id != null) setSelectedId(normalizeGoalId(resolved.id));
  }, [activeGoals, archives, selectedId, panel, defaultGoalId]);

  useEffect(() => {
    if (panel !== 'track' || selectedId == null) return;
    const exists =
      activeGoals.some((g) => normalizeGoalId(g.id) === selectedId) ||
      archives.some((g) => normalizeGoalId(g.id) === selectedId);
    if (!exists) {
      const next = activeGoals[0] ?? archives[0];
      setSelectedId(next ? normalizeGoalId(next.id) : null);
    }
  }, [activeGoals, archives, selectedId, panel]);

  const progressQ = useQuery({
    queryKey: ['wealth-goal-progress', selectedId],
    queryFn: () => getWealthGoalProgress(selectedId),
    enabled: selectedId != null && panel === 'track',
    retry: 2,
    staleTime: 30_000,
  });

  const baselineQ = useQuery({
    queryKey: ['planner-baseline-goals', form.broker],
    queryFn: () => getInvestmentPlannerBaseline({ plannerBroker: form.broker }),
    enabled: (panel === 'create' || panel === 'edit') && form.basis !== 'manual',
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['wealth-goals'] });
    qc.invalidateQueries({ queryKey: ['wealth-goal-progress'] });
  };

  const saveMut = useMutation({
    mutationFn: (body) => {
      if (panel === 'edit' && selectedId) return updateWealthGoal(selectedId, body);
      return createWealthGoal(body);
    },
    onSuccess: (result) => {
      invalidateAll();
      const id = result?.goal?.id ?? result?.id;
      if (id != null) setSelectedId(normalizeGoalId(id));
      setPanel('track');
    },
  });

  const archiveMut = useMutation({
    mutationFn: (id) => updateWealthGoal(id, { status: 'archived' }),
    onSuccess: (_res, archivedId) => {
      invalidateAll();
      const next = activeGoals.find((g) => normalizeGoalId(g.id) !== archivedId);
      setSelectedId(next ? normalizeGoalId(next.id) : null);
      if (!next) setPanel(activeGoals.length > 1 ? 'track' : 'create');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => deleteWealthGoal(id),
    onSuccess: (_res, deletedId) => {
      invalidateAll();
      const remaining = activeGoals.filter((g) => normalizeGoalId(g.id) !== deletedId);
      setSelectedId(remaining[0] ? normalizeGoalId(remaining[0].id) : null);
      if (!remaining.length && !archives.length) setPanel('create');
    },
  });

  const data = progressQ.data;
  const isReadOnly = data?.goal?.status !== 'active';
  const monthly = data?.monthly;

  const chartData = useMemo(() => {
    if (!monthly?.rows?.length) return [];
    return monthly.rows.slice(-24).map((r) => ({
      month: r.month.slice(5),
      actual: r.actual,
      required: r.required,
      hit: r.hit ? 1 : 0,
    }));
  }, [monthly]);

  const heroTone = data?.completed
    ? 'completed'
    : data?.onTrack === 'ahead'
      ? 'ahead'
      : data?.onTrack === 'on_track'
        ? 'on_track'
        : 'behind';

  const startEdit = () => {
    if (data?.goal) {
      setForm({
        name: data.goal.name,
        targetAmount: data.goal.targetAmount,
        targetDate: data.goal.targetDate || '',
        basis: data.goal.basis,
        broker: data.goal.broker || '',
        annualReturn: data.goal.annualReturn,
        notes: data.goal.notes || '',
      });
    }
    setPanel('edit');
  };

  const startCreate = () => {
    setForm(defaultForm());
    setPanel('create');
  };

  const submit = (e) => {
    e.preventDefault();
    saveMut.mutate({
      name: form.name,
      targetAmount: Number(form.targetAmount),
      targetDate: form.targetDate || null,
      basis: form.basis,
      broker: form.broker || null,
      annualReturn: Number(form.annualReturn),
      notes: form.notes || null,
    });
  };

  const showForm = panel === 'create' || panel === 'edit';
  const showProgress = panel === 'track' && !!data?.goal;
  const goalsLoading = activeGoalsQ.isLoading || archivesQ.isLoading;
  const hasAnyGoals = activeGoals.length > 0 || archives.length > 0;

  if (activeGoalsQ.isError) {
    return (
      <QueryErrorPanel
        title="Could not load wealth goals"
        message={activeGoalsQ.error?.message}
        hint="Check that the backend is running and database migrations are up to date (wealth_goals table)."
        onRetry={() => {
          activeGoalsQ.refetch();
          archivesQ.refetch();
        }}
      />
    );
  }

  return (
    <div className="space-y-4 w-full">
      {!showForm && (
        <GoalPicker
          goals={activeGoals}
          archives={archives}
          selectedId={selectedId}
          panel={panel}
          onSelect={(id) => { setSelectedId(id); setPanel('track'); }}
          onCreate={startCreate}
          showArchives={showArchives}
          onToggleArchives={() => setShowArchives((s) => !s)}
          defaultGoalId={defaultGoalId}
          onSetDefault={setDefaultGoalId}
        />
      )}

      {showForm && (
        <form
          onSubmit={submit}
          className="rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50/20 dark:bg-brand-950/20 p-4 sm:p-5 space-y-4"
        >
          <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Target size={18} className="text-brand-600" />
            {panel === 'edit' ? 'Edit goal' : 'Create a wealth goal'}
          </h2>
          {panel === 'create' && (
            <p className="text-xs text-gray-500">
              Track progress using net savings each month (same logic as Analytics). Other active goals stay unchanged.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-500">Goal name</span>
              <input
                className="input mt-1 w-full"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500">Target amount (€)</span>
              <input
                type="number"
                min={1}
                className="input mt-1 w-full"
                value={form.targetAmount}
                onChange={(e) => setForm((f) => ({ ...f, targetAmount: e.target.value }))}
                required
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500">Target date</span>
              <input
                type="date"
                className="input mt-1 w-full"
                value={form.targetDate}
                onChange={(e) => setForm((f) => ({ ...f, targetDate: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500">Expected annual return (%)</span>
              <input
                type="number"
                step={0.5}
                className="input mt-1 w-full"
                value={form.annualReturn}
                onChange={(e) => setForm((f) => ({ ...f, annualReturn: e.target.value }))}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-gray-500">Progress measured by</span>
              <select
                className="input mt-1 w-full"
                value={form.basis}
                onChange={(e) => setForm((f) => ({ ...f, basis: e.target.value }))}
              >
                {BASIS_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </label>
            {baselineQ.data?.brokers?.length > 0 && form.basis === 'portfolio' && (
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-gray-500">Broker (optional)</span>
                <select
                  className="input mt-1 w-full"
                  value={form.broker}
                  onChange={(e) => setForm((f) => ({ ...f, broker: e.target.value }))}
                >
                  <option value="">All brokers</option>
                  {baselineQ.data.brokers.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary" disabled={saveMut.isPending}>
              <Save size={16} />
              {saveMut.isPending ? 'Saving…' : panel === 'edit' ? 'Save' : 'Start tracking'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setPanel('track')}>
              Cancel
            </button>
          </div>
          {saveMut.isError && (
            <p className="text-sm text-red-600">{saveMut.error.message}</p>
          )}
        </form>
      )}

      {panel === 'track' && !showForm && goalsLoading && (
        <div className="card p-12 flex flex-col items-center justify-center gap-3 text-gray-500">
          <LoadingSpinner />
          <p className="text-sm">Loading goal progress…</p>
        </div>
      )}

      {panel === 'track' && !showForm && !goalsLoading && !hasAnyGoals && (
        <div className="card p-10 text-center space-y-4">
          <Target size={40} className="mx-auto text-brand-400 opacity-60" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">No wealth goals yet</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
              Set a target amount and deadline, then track monthly net savings against the pace you need.
            </p>
          </div>
          <button type="button" onClick={startCreate} className="btn-primary inline-flex items-center gap-2">
            <Plus size={16} />
            Create your first goal
          </button>
        </div>
      )}

      {panel === 'track' && !showForm && !goalsLoading && selectedId == null && hasAnyGoals && (
        <div className="card p-8 text-center text-sm text-gray-500">
          Select a goal above to view progress.
        </div>
      )}

      {panel === 'track' && !showForm && selectedId != null && progressQ.isError && (
        <QueryErrorPanel
          title="Could not load goal progress"
          message={progressQ.error?.message}
          hint="Valuation or net-savings data may be unavailable. Try refresh, or edit the goal basis."
          onRetry={() => progressQ.refetch()}
        />
      )}

      {panel === 'track' && !showForm && selectedId != null && progressQ.isLoading && (
        <div className="card p-12 flex flex-col items-center justify-center gap-3">
          <LoadingSpinner />
          <p className="text-sm text-gray-500">Calculating progress…</p>
        </div>
      )}

      {panel === 'track' && !showForm && selectedId != null && !progressQ.isLoading && !progressQ.isError && !data?.goal && (
        <div className="card p-8 text-center space-y-3">
          <AlertCircle size={32} className="mx-auto text-amber-500" />
          <p className="text-sm text-gray-600">Progress data is unavailable for this goal.</p>
          <button type="button" className="btn-secondary text-sm" onClick={() => progressQ.refetch()}>
            Retry
          </button>
        </div>
      )}

      {showProgress && (
        <>
          <div
            className={clsx(
              'rounded-2xl text-white p-4 sm:p-5 shadow-sm',
              ON_TRACK_HERO[heroTone] || ON_TRACK_HERO.on_track
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold truncate">{data.goal.name}</h2>
                  {isReadOnly && (
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-white/20">
                      {statusLabel(data.goal.status)}
                    </span>
                  )}
                </div>
                <p className="text-3xl sm:text-4xl font-bold tabular-nums mt-1">
                  {fmtPct(data.progressPct)}
                </p>
                <p className="text-sm opacity-90 mt-0.5 tabular-nums">
                  {fmtEur(data.currentValue)} of {fmtEur(data.targetAmount)}
                </p>
              </div>
              {!isReadOnly && (
                <div className="flex gap-1.5 shrink-0">
                  <button type="button" onClick={startEdit} className="px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-medium">
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => archiveMut.mutate(data.goal.id)}
                    className="px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-medium inline-flex items-center gap-1"
                    disabled={archiveMut.isPending}
                  >
                    <Archive size={12} />
                    Archive
                  </button>
                </div>
              )}
              {isReadOnly && activeGoals.length > 0 && (
                <button
                  type="button"
                  className="text-xs font-medium underline opacity-90"
                  onClick={() => setSelectedId(normalizeGoalId(activeGoals[0].id))}
                >
                  Active goals
                </button>
              )}
            </div>
            <div className="mt-4 h-2 rounded-full bg-white/25 overflow-hidden">
              <div
                className="h-full rounded-full bg-white transition-all"
                style={{ width: `${Math.min(100, data.progressPct ?? 0)}%` }}
              />
            </div>
            <p className="text-sm font-medium mt-3">{onTrackMessage(data)}</p>
            <p className="text-xs opacity-85 mt-0.5">{onTrackDetail(data)}</p>
          </div>

          <PlannerMetricStrip
            items={[
              {
                label: 'Progress from start',
                value: fmtPct(data.achievedPctOfGap ?? 0),
                sub: `${fmtEur(data.achieved)} of gap · ${fmtPct(data.growthSinceStartPct ?? 0)} growth`,
              },
              {
                label: 'Remaining',
                value: fmtEur(data.remaining),
                sub: data.monthsLeft ? `${data.monthsLeft} mo left` : undefined,
              },
              {
                label: 'Net savings target / mo',
                value: data.completed ? '—' : fmtEur(data.requiredMonthly),
                sub: data.completed ? undefined : `${fmtEur(data.requiredYearly)}/yr`,
              },
              {
                label: 'This month',
                value: fmtEur(data.thisMonth?.actual),
                sub: data.thisMonth?.hit ? 'On target' : 'Below required',
                accent: data.thisMonth?.hit
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400',
              },
            ]}
          />

          <details className="group rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
            <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer text-sm font-medium text-gray-600 dark:text-gray-400 list-none">
              <MoreHorizontal size={16} />
              More metrics
              <ChevronDown size={14} className="ml-auto transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 border-t border-gray-100 dark:border-gray-800 pt-3">
              {[
                { label: 'Months on target', value: monthly?.hitCount ?? 0 },
                { label: 'Months missed', value: monthly?.missCount ?? 0 },
                { label: 'Hit rate', value: fmtPct(monthly?.hitRate ?? 0) },
                { label: 'Best streak', value: `${monthly?.maxStreak ?? 0} mo` },
                { label: 'Current streak', value: `${monthly?.currentStreak ?? 0} mo` },
                { label: 'Avg net savings', value: fmtEur(monthly?.avgActual ?? 0) },
                { label: 'YTD net savings', value: fmtEur(data.ytdNetSavings ?? 0) },
                {
                  label: 'Cumulative vs plan',
                  value: `${fmtEur(data.cumulativeNetSavings ?? 0)} / ${fmtEur(data.expectedCumulativeSavings ?? 0)}`,
                },
              ].map(({ label, value }) => (
                <div key={label} className="text-xs">
                  <p className="text-gray-400 truncate">{label}</p>
                  <p className="font-semibold tabular-nums text-gray-900 dark:text-white mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          </details>

          <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Net savings vs pace</h3>
            <p className="text-xs text-gray-400 mb-3">Last 24 months</p>
            {chartData.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">No savings history in the tracking window yet.</p>
            ) : (
              <div className="chart-h min-h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `€${v}`} />
                    <Tooltip formatter={(v) => fmtEur(v)} />
                    <Legend />
                    <ReferenceLine y={data.requiredMonthly} stroke="#6366f1" strokeDasharray="4 4" />
                    <Bar dataKey="actual" name="Net savings" fill="#10b981" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="required" name="Required" fill="#94a3b8" radius={[2, 2, 0, 0]} opacity={0.35} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <details className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
            <summary className="px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer list-none">
              Month-by-month table
            </summary>
            <div className="overflow-x-auto px-4 pb-4 border-t border-gray-100 dark:border-gray-800">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200 dark:border-gray-700">
                    <th className="pb-2 pr-4">Month</th>
                    <th className="pb-2 pr-4">Net savings</th>
                    <th className="pb-2 pr-4">Required</th>
                    <th className="pb-2 pr-4">Shortfall</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(monthly?.rows ?? []).slice().reverse().map((r) => (
                    <tr key={r.month} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2 pr-4 font-medium">{r.month}</td>
                      <td className="py-2 pr-4 tabular-nums">{fmtEur(r.actual)}</td>
                      <td className="py-2 pr-4 tabular-nums text-gray-500">{fmtEur(r.required)}</td>
                      <td className="py-2 pr-4 tabular-nums text-amber-600">{r.shortfall > 0 ? fmtEur(r.shortfall) : '—'}</td>
                      <td className="py-2">
                        {r.hit ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                            <CheckCircle2 size={14} /> Hit
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-medium">
                            <XCircle size={14} /> Missed
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          {!isReadOnly && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                className="btn-ghost text-xs inline-flex items-center gap-1"
                onClick={() => {
                  invalidateAll();
                  progressQ.refetch();
                }}
              >
                <RefreshCw size={13} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Permanently delete this goal?')) {
                    deleteMut.mutate(data.goal.id);
                  }
                }}
                className="text-xs text-red-600 hover:underline inline-flex items-center gap-1"
                disabled={deleteMut.isPending}
              >
                <Trash2 size={13} />
                Delete permanently
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
