import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from 'recharts';
import {
  Target, PiggyBank, Calendar, TrendingUp, TrendingDown, CheckCircle2, XCircle,
  Flame, LineChart, Trash2, Save, RefreshCw,
} from 'lucide-react';
import clsx from 'clsx';
import { format, addYears } from 'date-fns';
import {
  getActiveWealthGoal,
  getWealthGoals,
  createWealthGoal,
  updateWealthGoal,
  deleteWealthGoal,
  getInvestmentPlannerBaseline,
} from '../api/client';
import StatCard from '../components/ui/StatCard';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { fmtEur, fmtPct } from '../utils/displayFormat';
import { usePrivacy } from '../context/PrivacyContext';

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

export default function WealthGoals() {
  usePrivacy();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(defaultForm);

  const activeQ = useQuery({
    queryKey: ['wealth-goal-active'],
    queryFn: getActiveWealthGoal,
  });

  const listQ = useQuery({
    queryKey: ['wealth-goals'],
    queryFn: getWealthGoals,
  });

  const baselineQ = useQuery({
    queryKey: ['planner-baseline-goals', form.broker],
    queryFn: () => getInvestmentPlannerBaseline({ plannerBroker: form.broker }),
    enabled: form.basis !== 'manual',
  });

  const saveMut = useMutation({
    mutationFn: (body) => {
      const goal = activeQ.data?.goal;
      if (goal?.id && editing) return updateWealthGoal(goal.id, body);
      return createWealthGoal({ ...body, setActive: true });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wealth-goal-active'] });
      qc.invalidateQueries({ queryKey: ['wealth-goals'] });
      setEditing(false);
    },
  });

  const archiveMut = useMutation({
    mutationFn: () => {
      const id = activeQ.data?.goal?.id;
      if (!id) return Promise.resolve();
      return updateWealthGoal(id, { status: 'archived' });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wealth-goal-active'] });
      qc.invalidateQueries({ queryKey: ['wealth-goals'] });
      setEditing(true);
      setForm(defaultForm());
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteWealthGoal(activeQ.data.goal.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wealth-goal-active'] });
      qc.invalidateQueries({ queryKey: ['wealth-goals'] });
      setEditing(true);
      setForm(defaultForm());
    },
  });

  const data = activeQ.data;
  const hasGoal = !!data?.goal;
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
    setEditing(true);
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

  if (activeQ.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Target className="text-brand-600" size={28} />
            Wealth goals
          </h1>
          <p className="page-subtitle">
            Set a long-term target, track progress against your portfolio, and see whether monthly investment savings keep you on pace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasGoal && (
            <>
              <button type="button" onClick={startEdit} className="btn-secondary text-sm">
                Edit goal
              </button>
              <button type="button" onClick={() => archiveMut.mutate()} className="btn-secondary text-sm">
                Archive & set new
              </button>
            </>
          )}
          <Link to="/investments?tab=planner" className="btn-secondary text-sm inline-flex items-center gap-1">
            <LineChart size={16} />
            Wealth planner
          </Link>
        </div>
      </div>

      {(!hasGoal || editing) && (
        <form onSubmit={submit} className="card p-5 space-y-4 border-2 border-brand-200 dark:border-brand-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {hasGoal ? 'Update your goal' : 'Create your wealth goal'}
          </h2>
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
          <p className="text-xs text-gray-500">
            Starting point is captured automatically from your selected basis when you save.
            Monthly savings are tracked from investment Buy + Deposit transactions.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary" disabled={saveMut.isPending}>
              <Save size={16} />
              {saveMut.isPending ? 'Saving…' : hasGoal ? 'Save changes' : 'Start tracking'}
            </button>
            {hasGoal && editing && (
              <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
          {saveMut.isError && (
            <p className="text-sm text-red-600">{saveMut.error.message}</p>
          )}
        </form>
      )}

      {hasGoal && !editing && (
        <>
          <div className={clsx('card p-4 rounded-lg flex flex-wrap items-center gap-3', ON_TRACK_STYLES[data.onTrack])}>
            <span className="font-semibold">
              {data.completed
                ? 'Congratulations — you reached your goal!'
                : data.onTrack === 'ahead'
                  ? 'Ahead of your linear plan'
                  : data.onTrack === 'on_track'
                    ? 'On track toward your goal'
                    : 'Behind your linear plan — increase savings or extend the deadline'}
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
              label="Achieved (growth)"
              value={fmtEur(data.achieved)}
              sub={`From ${fmtEur(data.startingAmount)} start`}
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
              label="This month saved"
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
              { label: 'Avg monthly save', value: fmtEur(monthly?.avgActual ?? 0), icon: PiggyBank },
              { label: 'YTD contributions', value: fmtEur(data.ytdActual), icon: Calendar },
              { label: 'Expected today (linear)', value: data.expectedValueToday != null ? fmtEur(data.expectedValueToday) : '—', icon: LineChart },
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
              Best month: <strong>{monthly.bestMonth.month}</strong> with {fmtEur(monthly.bestMonth.amount)} contributed.
            </p>
          )}

          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Monthly savings vs required
            </h2>
            <p className="text-xs text-gray-400 mb-4">Last 24 months · green bar = met ≥85% of required</p>
            {chartData.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No contribution history yet in the tracking window.</p>
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
                    <Bar dataKey="actual" name="Actual saved" fill="#10b981" radius={[2, 2, 0, 0]} />
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
                  <th className="pb-2 pr-4">Saved</th>
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

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => deleteMut.mutate()}
              className="text-sm text-red-600 hover:underline flex items-center gap-1"
              disabled={deleteMut.isPending}
            >
              <Trash2 size={14} />
              Delete goal permanently
            </button>
          </div>
        </>
      )}

      {(listQ.data?.length ?? 0) > 1 && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-600 mb-2">Past goals</h3>
          <ul className="text-sm text-gray-500 space-y-1">
            {listQ.data.filter((g) => g.status !== 'active').map((g) => (
              <li key={g.id}>
                {g.name} — {fmtEur(g.targetAmount)} ({g.status})
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        className="btn-ghost text-sm mx-auto flex items-center gap-1"
        onClick={() => {
          qc.invalidateQueries({ queryKey: ['wealth-goal-active'] });
          activeQ.refetch();
        }}
      >
        <RefreshCw size={14} />
        Refresh progress
      </button>
    </div>
  );
}
