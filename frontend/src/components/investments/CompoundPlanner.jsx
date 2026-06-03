import { useMemo, useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import {
  Calculator, Target, TrendingUp, Sparkles, Save, Download, RefreshCw,
  ChevronDown, ChevronUp, Wallet, PiggyBank,
} from 'lucide-react';
import clsx from 'clsx';
import {
  getInvestmentPlannerBaseline,
  getInvestmentPlannerScenarios,
  saveInvestmentPlannerScenario,
  deleteInvestmentPlannerScenario,
} from '../../api/client';
import {
  runProjection, runGoalSolver, runScenarioComparison, buildInsights,
  DEFAULT_PLANNER, BASIS_OPTIONS, GOAL_TYPE_OPTIONS, SOLVE_FOR_OPTIONS, COMPOUNDING_OPTIONS,
  portfolioForPassiveIncome,
} from '../../utils/compoundPlannerEngine';
import { fmtEur, fmtPct } from '../../utils/investmentFormat';
import LoadingSpinner from '../ui/LoadingSpinner';

function SliderField({ label, value, onChange, min, max, step = 1, format = (v) => v, unit = '' }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-500 dark:text-gray-400">{label}</span>
        <span className="font-medium text-gray-800 dark:text-gray-200 tabular-nums">
          {format(value)}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-600"
      />
    </div>
  );
}

function NumInput({ label, value, onChange, step = 1, min, className }) {
  return (
    <label className={clsx('block text-xs', className)}>
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="input w-full mt-1 text-sm tabular-nums"
      />
    </label>
  );
}

function toPlannerInput(form, withdrawalStartYear) {
  return {
    principal: form.principal,
    monthlyContribution: form.monthlyContribution,
    yearlyContribution: form.yearlyContribution,
    contributionGrowthRate: form.contributionGrowthRate,
    annualReturn: form.annualReturn,
    inflationRate: form.inflationRate,
    taxDrag: form.taxDrag,
    feeDrag: form.feeDrag,
    years: form.timeMode === 'years' ? form.years : 0,
    months: form.months,
    targetAge: form.timeMode === 'age' ? form.targetAge : null,
    currentAge: form.timeMode === 'age' ? form.currentAge : null,
    endDate: form.timeMode === 'date' ? form.endDate || null : null,
    compounding: form.compounding,
    useRealReturns: form.useRealReturns,
    dividendReinvest: form.dividendReinvest,
    withdrawalMonthly: form.withdrawalMonthly,
    withdrawalStartMonth: withdrawalStartYear != null ? withdrawalStartYear * 12 : null,
    goalType: form.goalType,
    targetValue: form.targetValue,
    targetMonthlyIncome: form.targetMonthlyIncome,
    safeWithdrawalRate: form.safeWithdrawalRate,
    solveFor: form.solveFor,
    mode: form.mode,
  };
}

export default function CompoundPlanner({ brokerFilter = '' }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...DEFAULT_PLANNER });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [tickerPick, setTickerPick] = useState([]);

  const baselineQ = useQuery({
    queryKey: ['plannerBaseline', brokerFilter, tickerPick.join(',')],
    queryFn: () =>
      getInvestmentPlannerBaseline({
        broker: brokerFilter || undefined,
        tickers: tickerPick.length ? tickerPick.join(',') : undefined,
        excludeCash: form.basis === 'portfolio_no_cash' ? '1' : undefined,
      }),
    staleTime: 60_000,
  });

  const scenariosQ = useQuery({
    queryKey: ['plannerScenarios'],
    queryFn: getInvestmentPlannerScenarios,
    enabled: showSaved,
  });

  const saveMut = useMutation({
    mutationFn: (name) => saveInvestmentPlannerScenario({ name, preset: form.basis, payload: form }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plannerScenarios'] }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteInvestmentPlannerScenario,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plannerScenarios'] }),
  });

  const loadFromBaseline = useCallback((baseline, basis) => {
    if (!baseline || basis === 'manual') return;
    let principal = DEFAULT_PLANNER.principal;
    if (basis === 'portfolio') principal = baseline.portfolioTotal;
    else if (basis === 'portfolio_no_cash') principal = baseline.holdingsValue;
    else if (basis === 'net_worth') principal = baseline.netWorth;
    const monthly =
      baseline.avgMonthlyContribution > 0 ? baseline.avgMonthlyContribution : DEFAULT_PLANNER.monthlyContribution;
    setForm((f) => ({ ...f, basis, principal, monthlyContribution: monthly }));
  }, []);

  useEffect(() => {
    if (baselineQ.data && form.basis !== 'manual') {
      loadFromBaseline(baselineQ.data, form.basis);
    }
  }, [baselineQ.data, form.basis, loadFromBaseline]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const input = useMemo(
    () => toPlannerInput(form, form.withdrawalStartYear),
    [form]
  );

  const projection = useMemo(() => runProjection(input), [input]);
  const goal = useMemo(() => {
    if (form.mode !== 'goal') return null;
    const target =
      form.goalType === 'passive_income' || form.goalType === 'fire'
        ? portfolioForPassiveIncome(form.targetMonthlyIncome, form.safeWithdrawalRate)
        : form.targetValue;
    if (target <= 0) return null;
    return runGoalSolver({ ...input, targetValue: target });
  }, [input, form.mode, form.goalType, form.targetValue, form.targetMonthlyIncome, form.safeWithdrawalRate]);

  const activeProjection = goal?.projectionAtRequired || projection;
  const scenarios = useMemo(() => runScenarioComparison(input), [input]);
  const insights = useMemo(
    () => buildInsights(activeProjection, input, goal?.targetValue),
    [activeProjection, input, goal]
  );

  const chartData = useMemo(() => {
    const step = Math.max(1, Math.floor(activeProjection.timeline.length / 80));
    return activeProjection.timeline
      .filter((_, i) => i % step === 0 || i === activeProjection.timeline.length - 1)
      .map((p) => ({
        label: p.year < 1 ? `M${p.month}` : `Y${p.year.toFixed(0)}`,
        balance: p.balance,
        contributed: p.contributed,
        gains: p.gains,
        real: p.realBalance,
      }));
  }, [activeProjection]);

  const stackData = useMemo(
    () =>
      activeProjection.yearlyTable.map((y) => ({
        year: `Y${y.year}`,
        contributed: y.totalContributed,
        gains: y.gains,
      })),
    [activeProjection]
  );

  const exportCsv = () => {
    const rows = [
      ['Year', 'Balance', 'Contributed', 'Gains', 'Real (inflation-adj)'],
      ...activeProjection.yearlyTable.map((y) => [
        y.year, y.balance, y.totalContributed, y.gains, y.realBalance,
      ]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'wealth-projection.csv';
    a.click();
  };

  const passiveAtEnd = (activeProjection.finalValue * (form.safeWithdrawalRate / 100)) / 12;

  return (
    <div className="space-y-6">
      <div className="card p-5 bg-gradient-to-br from-indigo-50/80 to-white dark:from-indigo-950/30 dark:to-gray-900 border-brand-100 dark:border-gray-800">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Calculator size={20} className="text-brand-600" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Wealth Planner</h2>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-xl">
              Compound growth projections, FIRE targets, and goal solving — linked to your live portfolio when you choose.
            </p>
            <p className="text-[10px] text-gray-400 mt-2 font-mono">
              FV ≈ PV(1+r)^t + PMT·[((1+r)^t − 1) / r]
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary text-xs gap-1"
              onClick={() => {
                baselineQ.refetch().then((r) => {
                  if (r.data) loadFromBaseline(r.data, form.basis);
                });
              }}
            >
              <RefreshCw size={14} /> Sync portfolio
            </button>
            <button type="button" className="btn-secondary text-xs gap-1" onClick={exportCsv}>
              <Download size={14} /> Export
            </button>
            <button type="button" className="btn-secondary text-xs gap-1" onClick={() => setShowSaved((s) => !s)}>
              <Save size={14} /> Saved
            </button>
          </div>
        </div>
      </div>

      {showSaved && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold mb-2">Saved scenarios</h3>
          {scenariosQ.isLoading ? <LoadingSpinner /> : (
            <ul className="space-y-2 text-sm">
              {(scenariosQ.data || []).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="text-brand-600 hover:underline text-left"
                    onClick={() => { setForm({ ...DEFAULT_PLANNER, ...s.payload }); setShowSaved(false); }}
                  >
                    {s.name}
                  </button>
                  <button type="button" className="text-xs text-red-500" onClick={() => deleteMut.mutate(s.id)}>Delete</button>
                </li>
              ))}
              {!scenariosQ.data?.length && <p className="text-xs text-gray-400">No saved scenarios yet.</p>}
            </ul>
          )}
          <button
            type="button"
            className="btn-primary text-xs mt-3"
            onClick={() => {
              const name = window.prompt('Scenario name');
              if (name) saveMut.mutate(name);
            }}
          >
            Save current scenario
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {[
          { id: 'project', label: 'Forward projection', icon: TrendingUp },
          { id: 'goal', label: 'Goal solver', icon: Target },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => set('mode', id)}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium border flex items-center gap-2',
              form.mode === id
                ? 'bg-brand-600 border-brand-600 text-white'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
            )}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-4">
          <div className="card p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Starting position</h3>
            <label className="block text-xs text-gray-500">Data basis</label>
            <select className="input w-full text-sm" value={form.basis} onChange={(e) => set('basis', e.target.value)}>
              {BASIS_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            {form.basis === 'tickers' && baselineQ.data?.tickers && (
              <div className="max-h-28 overflow-y-auto space-y-1 border rounded-lg p-2 dark:border-gray-700">
                {baselineQ.data.tickers.map((t) => {
                  const key = `${t.broker}:${t.ticker}`;
                  const on = tickerPick.includes(key);
                  return (
                    <label key={key} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setTickerPick((p) => (on ? p.filter((x) => x !== key) : [...p, key]))
                        }
                      />
                      {t.ticker}
                    </label>
                  );
                })}
              </div>
            )}
            {baselineQ.isLoading && <p className="text-xs text-gray-400">Loading portfolio…</p>}
            {baselineQ.data && form.basis !== 'manual' && (
              <p className="text-[10px] text-gray-400">
                Live: portfolio {fmtEur(baselineQ.data.portfolioTotal)} · net worth {fmtEur(baselineQ.data.netWorth)}
                {baselineQ.data.avgMonthlyContribution > 0 && (
                  <> · avg contrib {fmtEur(baselineQ.data.avgMonthlyContribution)}/mo</>
                )}
              </p>
            )}
            <SliderField
              label="Starting capital"
              value={form.principal}
              onChange={(v) => set('principal', v)}
              min={0}
              max={2000000}
              step={1000}
              format={fmtEur}
            />
          </div>

          <div className="card p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Contributions</h3>
            <SliderField
              label="Monthly"
              value={form.monthlyContribution}
              onChange={(v) => set('monthlyContribution', v)}
              min={0}
              max={10000}
              step={50}
              format={fmtEur}
            />
            <NumInput label="Yearly lump sum" value={form.yearlyContribution} onChange={(v) => set('yearlyContribution', v)} />
            <SliderField
              label="Contribution growth / year"
              value={form.contributionGrowthRate}
              onChange={(v) => set('contributionGrowthRate', v)}
              min={0}
              max={15}
              step={0.5}
              format={(v) => v}
              unit="%"
            />
          </div>

          <div className="card p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Returns & time</h3>
            <SliderField
              label="Expected return / year"
              value={form.annualReturn}
              onChange={(v) => set('annualReturn', v)}
              min={0}
              max={20}
              step={0.25}
              format={(v) => v}
              unit="%"
            />
            <select className="input w-full text-sm" value={form.timeMode} onChange={(e) => set('timeMode', e.target.value)}>
              <option value="years">Horizon (years)</option>
              <option value="age">Target age</option>
              <option value="date">End date</option>
            </select>
            {form.timeMode === 'years' && (
              <SliderField
                label="Years"
                value={form.years}
                onChange={(v) => set('years', v)}
                min={1}
                max={50}
                step={1}
                format={(v) => v}
              />
            )}
            {form.timeMode === 'age' && (
              <div className="grid grid-cols-2 gap-2">
                <NumInput label="Current age" value={form.currentAge} onChange={(v) => set('currentAge', v)} />
                <NumInput label="Target age" value={form.targetAge ?? 65} onChange={(v) => set('targetAge', v)} />
              </div>
            )}
            {form.timeMode === 'date' && (
              <input type="date" className="input w-full" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />
            )}
            <label className="block text-xs text-gray-500">Compounding</label>
            <select className="input w-full text-sm" value={form.compounding} onChange={(e) => set('compounding', e.target.value)}>
              {COMPOUNDING_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>

          {form.mode === 'goal' && (
            <div className="card p-4 space-y-3 border-brand-200 dark:border-brand-800">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-600">Goal</h3>
              <select className="input w-full text-sm" value={form.goalType} onChange={(e) => set('goalType', e.target.value)}>
                {GOAL_TYPE_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              {(form.goalType === 'passive_income' || form.goalType === 'fire') ? (
                <>
                  <SliderField
                    label="Target monthly income"
                    value={form.targetMonthlyIncome}
                    onChange={(v) => set('targetMonthlyIncome', v)}
                    min={500}
                    max={20000}
                    step={100}
                    format={fmtEur}
                  />
                  <SliderField
                    label="Safe withdrawal rate"
                    value={form.safeWithdrawalRate}
                    onChange={(v) => set('safeWithdrawalRate', v)}
                    min={3}
                    max={5}
                    step={0.1}
                    format={(v) => v}
                    unit="%"
                  />
                </>
              ) : (
                <SliderField
                  label="Target amount"
                  value={form.targetValue}
                  onChange={(v) => set('targetValue', v)}
                  min={10000}
                  max={5000000}
                  step={10000}
                  format={fmtEur}
                />
              )}
              <select className="input w-full text-sm" value={form.solveFor} onChange={(e) => set('solveFor', e.target.value)}>
                {SOLVE_FOR_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            className="text-xs text-gray-500 flex items-center gap-1"
            onClick={() => setShowAdvanced((s) => !s)}
          >
            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Advanced options
          </button>
          {showAdvanced && (
            <div className="card p-4 space-y-3">
              <SliderField label="Inflation" value={form.inflationRate} onChange={(v) => set('inflationRate', v)} min={0} max={10} step={0.1} format={(v) => v} unit="%" />
              <SliderField label="Tax drag" value={form.taxDrag} onChange={(v) => set('taxDrag', v)} min={0} max={40} step={1} format={(v) => v} unit="%" />
              <SliderField label="Fee drag" value={form.feeDrag} onChange={(v) => set('feeDrag', v)} min={0} max={3} step={0.05} format={(v) => v} unit="%" />
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={form.useRealReturns} onChange={(e) => set('useRealReturns', e.target.checked)} />
                Use inflation-adjusted (real) returns
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={form.dividendReinvest} onChange={(e) => set('dividendReinvest', e.target.checked)} />
                Dividend reinvestment
              </label>
              <NumInput label="Retirement draw / month" value={form.withdrawalMonthly} onChange={(v) => set('withdrawalMonthly', v)} />
              <NumInput label="Draw starts after year" value={form.withdrawalStartYear ?? ''} onChange={(v) => set('withdrawalStartYear', v || null)} />
            </div>
          )}
        </div>

        <div className="lg:col-span-8 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Projected value', value: fmtEur(activeProjection.finalValue), icon: Wallet, color: 'text-indigo-600' },
              { label: 'Total contributed', value: fmtEur(activeProjection.totalContributed), icon: PiggyBank, color: 'text-blue-600' },
              { label: 'Growth (compounding)', value: fmtEur(activeProjection.totalGains), icon: TrendingUp, color: 'text-emerald-600' },
              { label: 'Real value', value: fmtEur(activeProjection.finalValueReal), icon: Calculator, color: 'text-amber-600' },
            ].map((k) => (
              <div key={k.label} className="card p-3">
                <k.icon size={14} className={clsx(k.color, 'mb-1')} />
                <p className="text-[10px] text-gray-400 uppercase">{k.label}</p>
                <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">{k.value}</p>
              </div>
            ))}
          </div>

          {form.mode === 'goal' && goal && (
            <div className="card p-4 bg-brand-50/50 dark:bg-brand-900/20 border-brand-200 dark:border-brand-800">
              <h3 className="text-sm font-semibold text-brand-800 dark:text-brand-200 mb-2">Goal solver result</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                {goal.requiredMonthlyContribution != null && (
                  <p>Required monthly: <strong>{fmtEur(goal.requiredMonthlyContribution)}</strong></p>
                )}
                {goal.requiredYears != null && (
                  <p>Required timeline: <strong>{goal.requiredYears} years</strong></p>
                )}
                {goal.requiredAnnualReturn != null && (
                  <p>Required return: <strong>{fmtPct(goal.requiredAnnualReturn)}</strong></p>
                )}
                {goal.requiredStartingCapital != null && (
                  <p>Required starting capital: <strong>{fmtEur(goal.requiredStartingCapital)}</strong></p>
                )}
                {goal.estimatedFiDate && (
                  <p>Est. FI date: <strong>{goal.estimatedFiDate}</strong></p>
                )}
                {goal.coastFire && (
                  <p className="sm:col-span-2 text-xs text-gray-600 dark:text-gray-300">
                    Coast FIRE: grow to {fmtEur(goal.coastFire.growTo)} with no new contributions over {goal.coastFire.yearsWithoutContributions}y.
                  </p>
                )}
                <p className="sm:col-span-2 text-xs text-gray-500">
                  Implied portfolio for passive income at {form.safeWithdrawalRate}% SWR: {fmtEur(goal.targetValue)}
                  · ≈ {fmtEur(passiveAtEnd)}/mo at end balance
                </p>
              </div>
            </div>
          )}

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Growth over time</h3>
            <div className="chart-h min-h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => fmtEur(v)} />
                  <Legend />
                  <Area type="monotone" dataKey="balance" name="Portfolio" stroke="#6366f1" fill="url(#balGrad)" />
                  {form.useRealReturns && (
                    <Area type="monotone" dataKey="real" name="Real" stroke="#f59e0b" fill="none" strokeDasharray="4 4" />
                  )}
                  {form.mode === 'goal' && form.targetValue > 0 && (
                    <ReferenceLine y={goal?.targetValue ?? form.targetValue} stroke="#10b981" strokeDasharray="3 3" />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card p-4">
              <h3 className="text-sm font-semibold mb-3">Contributions vs gains (yearly)</h3>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stackData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => fmtEur(v)} />
                    <Legend />
                    <Bar dataKey="contributed" name="Invested" stackId="a" fill="#94a3b8" />
                    <Bar dataKey="gains" name="Growth" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold mb-3">Scenario comparison</h3>
              <ul className="space-y-2 text-sm">
                {scenarios.map((s) => (
                  <li key={s.name} className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">{s.label}</span>
                    <span className="font-semibold tabular-nums">{fmtEur(s.finalValue)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={16} className="text-brand-600" />
              <h3 className="text-sm font-semibold">Insights</h3>
            </div>
            <ul className="space-y-2">
              {insights.map((ins, i) => (
                <li
                  key={i}
                  className={clsx(
                    'text-xs rounded-lg px-3 py-2 border',
                    ins.type === 'positive' && 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-900/20',
                    ins.type === 'tip' && 'border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-900/20',
                    ins.type === 'info' && 'border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/30'
                  )}
                >
                  {ins.text}
                </li>
              ))}
            </ul>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-semibold">Yearly projection table</h3>
            </div>
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0">
                  <tr>
                    {['Year', 'Balance', 'Contributed', 'Gains', 'Real'].map((h) => (
                      <th key={h} className="text-left px-3 py-2 font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {activeProjection.yearlyTable.map((y) => (
                    <tr key={y.year}>
                      <td className="px-3 py-2">{y.year}</td>
                      <td className="px-3 py-2 font-medium tabular-nums">{fmtEur(y.balance)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmtEur(y.totalContributed)}</td>
                      <td className="px-3 py-2 text-emerald-600 tabular-nums">{fmtEur(y.gains)}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-500">{fmtEur(y.realBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
