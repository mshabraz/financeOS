import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from 'recharts';
import {
  Target, PiggyBank, Calendar, TrendingUp, TrendingDown, CheckCircle2, XCircle,
  Flame, LineChart, Trash2, Save, RefreshCw, Plus, Archive,
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
import StatCard from '../ui/StatCard';
import LoadingSpinner from '../ui/LoadingSpinner';
import { fmtEur, fmtPct } from '../../utils/displayFormat';
import { usePrivacy } from '../../context/PrivacyContext';

const BASIS_OPTIONS = [
  { id: 'portfolio', label: 'Portfolio (holdings + cash)' },
  { id: 'net_worth', label: 'Total assets (Dashboard)' },
  { id: 'portfolio_no_cash', label: 'Holdings only' },
];

const ON_TRACK_STYLES = {
  ahead: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
  on_track: 'text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20',
  behind: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20',
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

export default function WealthGoalTracking() {
  usePrivacy();
  const qc = useQueryClient();
  const [panel, setPanel] = useState('track');
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(defaultForm);

  const activeGoalsQ = useQuery({
    queryKey: ['wealth-goals', 'active'],
    queryFn: () => getWealthGoals({ status: 'active' }),
  });

  const archivesQ = useQuery({
    queryKey: ['wealth-goals', 'archived'],
    queryFn: () => getWealthGoals({ status: 'archived' }),
  });

  const activeGoals = activeGoalsQ.data ?? [];
  const archives = archivesQ.data ?? [];

  useEffect(() => {
    if (panel !== 'track') return;
    if (selectedId != null) return;
    if (activeGoals.length) setSelectedId(activeGoals[0].id);
  }, [activeGoals, selectedId, panel]);

  useEffect(() => {
    if (panel !== 'track' || selectedId == null) return;
    const stillExists =
      activeGoals.some((g) => g.id === selectedId) ||
      archives.some((g) => g.id === selectedId);
    if (!stillExists) {
      setSelectedId(activeGoals[0]?.id ?? null);
    }
  }, [activeGoals, archives, selectedId, panel]);

  const progressQ = useQuery({
    queryKey: ['wealth-goal-progress', selectedId],
    queryFn: () => getWealthGoalProgress(selectedId),
    enabled: !!selectedId && panel === 'track',
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
      if (result?.goal?.id) setSelectedId(result.goal.id);
      setPanel('track');
    },
  });

  const archiveMut = useMutation({
    mutationFn: (id) => updateWealthGoal(id, { status: 'archived' }),
    onSuccess: (_res, archivedId) => {
      invalidateAll();
      const next = activeGoals.find((g) => g.id !== archivedId);
      setSelectedId(next?.id ?? null);
      if (!next) setPanel('create');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => deleteWealthGoal(id),
    onSuccess: (_res, deletedId) => {
      invalidateAll();
      const remaining = activeGoals.filter((g) => g.id !== deletedId);
      setSelectedId(remaining[0]?.id ?? null);
      if (!remaining.length) setPanel('create');
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

  if (activeGoalsQ.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Track one or more wealth targets. Monthly performance uses{' '}
        <strong>net savings</strong> (net income − net expenses), same as Analytics.
      </p>

      {/* Active goal picker */}
      <div className="flex flex-wrap items-center gap-2">
        {activeGoals.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => { setSelectedId(g.id); setPanel('track'); }}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
              selectedId === g.id && panel === 'track'
                ? 'bg-brand-600 border-brand-600 text-white'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-brand-400'
            )}
          >
            {g.name}
          </button>
        ))}
        <button type="button" onClick={startCreate} className="btn-secondary text-sm inline-flex items-center gap-1">
          <Plus size={16} />
          New goal
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card p-5 space-y-4 border-2 border-brand-200 dark:border-brand-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {panel === 'edit' ? 'Edit goal' : 'Create a new goal'}
          </h2>
          {panel === 'create' && activeGoals.length > 0 && (
            <p className="text-xs text-gray-500">
              Your other active goals stay as they are — nothing is archived or deleted.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              {saveMut.isPending ? 'Saving…' : panel === 'edit' ? 'Save changes' : 'Start tracking'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setPanel('track')}
            >
              Cancel
            </button>
          </div>
          {saveMut.isError && (
            <p className="text-sm text-red-600">{saveMut.error.message}</p>
          )}
        </form>
      )}

      {panel === 'track' && !activeGoals.length && !archives.length && !showForm && (
        <div className="card p-8 text-center text-sm text-gray-500">
          No goals yet. Click <strong>New goal</strong> to get started.
        </div>
      )}

      {panel === 'track' && progressQ.isLoading && selectedId && (
        <LoadingSpinner />
      )}

      {showProgress && (
        <>
          {isReadOnly && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                {statusLabel(data.goal.status)}
              </span>
              {activeGoals.length > 0 && (
                <button
                  type="button"
                  className="text-sm text-brand-600 hover:underline"
                  onClick={() => setSelectedId(activeGoals[0].id)}
                >
                  Back to active goals
                </button>
              )}
            </div>
          )}

          {!isReadOnly && (
            <div className="flex flex-wrap gap-2 justify-end">
              <button type="button" onClick={startEdit} className="btn-secondary text-sm">
                Edit goal
              </button>
              <button
                type="button"
                onClick={() => archiveMut.mutate(data.goal.id)}
                className="btn-secondary text-sm inline-flex items-center gap-1"
                disabled={archiveMut.isPending}
              >
                <Archive size={14} />
                Archive
              </button>
            </div>
          )}

          <div className={clsx('card p-4 rounded-lg flex flex-wrap items-center gap-3', ON_TRACK_STYLES[data.onTrack])}>
            <span className="font-semibold">
              {data.completed
                ? 'Congratulations — you reached your goal!'
                : data.onTrack === 'ahead'
                  ? 'Ahead of your cumulative savings plan'
                  : data.onTrack === 'on_track'
                    ? 'On track with net savings vs plan'
                    : 'Behind on net savings — spend less, earn more, or extend the deadline'}
            </span>
            {data.projectedCompletionHint && !data.completed && (
              <span className="text-sm opacity-90">
                At required pace: {data.projectedCompletionHint}
              </span>
            )}
          </div>

          <div className="h-3 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all', data.completed ? 'bg-emerald-500' : 'bg-brand-500')}
              style={{ width: `${Math.min(100, data.progressPct)}%` }}
            />
          </div>
          <p className="text-center text-sm text-gray-500 -mt-3">
            {fmtPct(data.progressPct)} complete · {fmtEur(data.currentValue)} of {fmtEur(data.targetAmount)}
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Progress from start"
              value={fmtPct(data.achievedPctOfGap ?? 0)}
              sub={`${fmtEur(data.achieved)} of ${fmtEur(Math.max(0, data.targetAmount - data.startingAmount))} gap · ${fmtPct(data.growthSinceStartPct ?? 0)} portfolio growth`}
              icon={<TrendingUp size={18} />}
              color="green"
            />
            <StatCard
              label="Remaining"
              value={fmtEur(data.remaining)}
              sub={data.monthsLeft ? `${data.monthsLeft} months left` : undefined}
              icon={<Target size={18} />}
              color="purple"
            />
            <StatCard
              label="Need per month"
              value={data.completed ? '—' : fmtEur(data.requiredMonthly)}
              sub={data.completed ? undefined : `${fmtEur(data.requiredYearly)} / year`}
              icon={<PiggyBank size={18} />}
              color="blue"
            />
            <StatCard
              label="This month net savings"
              value={fmtEur(data.thisMonth?.actual)}
              sub={
                data.thisMonth?.hit
                  ? 'On target'
                  : `Short ${fmtEur(Math.max(0, (data.thisMonth?.required ?? 0) - (data.thisMonth?.actual ?? 0)))}`
              }
              icon={data.thisMonth?.hit ? <CheckCircle2 size={18} /> : <TrendingDown size={18} />}
              color={data.thisMonth?.hit ? 'green' : 'red'}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Months on target', value: monthly?.hitCount ?? 0, icon: CheckCircle2 },
              { label: 'Months missed', value: monthly?.missCount ?? 0, icon: XCircle },
              { label: 'Hit rate', value: fmtPct(monthly?.hitRate ?? 0), icon: Target },
              { label: 'Best streak', value: `${monthly?.maxStreak ?? 0} mo`, icon: Flame },
              { label: 'Current streak', value: `${monthly?.currentStreak ?? 0} mo`, icon: Flame },
              { label: 'Avg net savings / mo', value: fmtEur(monthly?.avgActual ?? 0), icon: PiggyBank },
              { label: 'YTD net savings', value: fmtEur(data.ytdNetSavings ?? 0), icon: Calendar },
              { label: 'Cumulative vs plan', value: `${fmtEur(data.cumulativeNetSavings ?? 0)} / ${fmtEur(data.expectedCumulativeSavings ?? 0)}`, icon: LineChart },
              { label: 'Wealth today (linear)', value: data.expectedValueToday != null ? fmtEur(data.expectedValueToday) : '—', icon: Target },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="card p-3">
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                  <Icon size={14} />
                  {label}
                </div>
                <p className="text-lg font-semibold text-gray-900 dark:text-white tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          {monthly?.bestMonth?.month && (
            <p className="text-sm text-gray-500 px-1">
              Best month: <strong>{monthly.bestMonth.month}</strong> with {fmtEur(monthly.bestMonth.amount)} net savings.
            </p>
          )}

          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Net savings vs required pace
            </h2>
            <p className="text-xs text-gray-400 mb-4">Last 24 months · green = net savings met ≥85% of required</p>
            {chartData.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No savings history in the tracking window yet.</p>
            ) : (
              <div className="chart-h">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `€${v}`} />
                    <Tooltip formatter={(v) => fmtEur(v)} />
                    <Legend />
                    <ReferenceLine y={data.requiredMonthly} stroke="#6366f1" strokeDasharray="4 4" label="Required" />
                    <Bar dataKey="actual" name="Net savings" fill="#10b981" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="required" name="Required" fill="#94a3b8" radius={[2, 2, 0, 0]} opacity={0.35} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="card p-5 overflow-x-auto">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Month-by-month tracker</h2>
            <table className="w-full text-sm">
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
                    <td className="py-2.5 pr-4 font-medium">{r.month}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{fmtEur(r.actual)}</td>
                    <td className="py-2.5 pr-4 tabular-nums text-gray-500">{fmtEur(r.required)}</td>
                    <td className="py-2.5 pr-4 tabular-nums text-amber-600">{r.shortfall > 0 ? fmtEur(r.shortfall) : '—'}</td>
                    <td className="py-2.5">
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

          {!isReadOnly && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Permanently delete this goal? This cannot be undone.')) {
                    deleteMut.mutate(data.goal.id);
                  }
                }}
                className="text-sm text-red-600 hover:underline flex items-center gap-1"
                disabled={deleteMut.isPending}
              >
                <Trash2 size={14} />
                Delete goal permanently
              </button>
            </div>
          )}
        </>
      )}

      {archives.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Archives</h3>
          <p className="text-xs text-gray-500 mb-3">
            Achieved goals move here automatically. Archived goals are ones you set aside manually.
          </p>
          <ul className="space-y-2">
            {archives.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => { setSelectedId(g.id); setPanel('track'); }}
                  className={clsx(
                    'w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors',
                    selectedId === g.id && panel === 'track'
                      ? 'border-brand-400 bg-brand-50 dark:bg-brand-950/30'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  )}
                >
                  <span className="font-medium text-gray-900 dark:text-white">{g.name}</span>
                  <span className="text-gray-500 ml-2">{fmtEur(g.targetAmount)}</span>
                  <span
                    className={clsx(
                      'ml-2 text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded',
                      g.status === 'achieved'
                        ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                    )}
                  >
                    {statusLabel(g.status)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        className="btn-ghost text-sm mx-auto flex items-center gap-1"
        onClick={() => {
          invalidateAll();
          progressQ.refetch();
        }}
      >
        <RefreshCw size={14} />
        Refresh progress
      </button>
    </div>
  );
}
