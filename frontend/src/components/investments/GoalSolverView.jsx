import { useMemo } from 'react';
import { Target, Clock, PiggyBank, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import {
  buildGoalSavingsPlan,
  monthlyContributionForGoal,
  resolveGoalTarget,
  runProjection,
} from '../../utils/compoundPlannerEngine';
import { fmtEur, fmtPct } from '../../utils/investmentFormat';
import PlannerBasisFields from './PlannerBasisFields';
import NumericField from './plannerNumericField';

const HORIZONS = [5, 10, 15, 20, 25, 30];

export default function GoalSolverView({
  form,
  setField,
  baseline,
  baselineLoading,
  tickerPick,
  setTickerPick,
  input,
  onSyncBaseline,
}) {
  const effectiveTarget = useMemo(
    () => resolveGoalTarget(form),
    [form.goalKind, form.targetValue, form.targetMonthlyIncome, form.safeWithdrawalRate]
  );

  const savingsPlan = useMemo(() => {
    if (effectiveTarget <= 0) return null;
    const base = { ...input, monthlyContribution: 0 };
    const horizons = [...new Set([...HORIZONS, form.goalDeadlineYears].filter(Boolean))].sort(
      (a, b) => a - b
    );
    return buildGoalSavingsPlan(base, effectiveTarget, horizons);
  }, [input, effectiveTarget, form.goalDeadlineYears]);

  const primaryRow = useMemo(() => {
    if (effectiveTarget <= 0) return null;
    const y = form.goalDeadlineYears || 20;
    const existing = savingsPlan?.rows.find((r) => r.years === y);
    if (existing) return existing;
    return monthlyContributionForGoal({ ...input, monthlyContribution: 0 }, effectiveTarget, y);
  }, [savingsPlan, form.goalDeadlineYears, effectiveTarget, input]);

  const deadlineProjection = useMemo(() => {
    if (!primaryRow) return null;
    return runProjection({
      ...input,
      monthlyContribution: primaryRow.monthly,
      years: primaryRow.years,
    });
  }, [input, primaryRow]);

  const gap = Math.max(0, effectiveTarget - (form.principal || 0));

  return (
    <div className="space-y-6">
      <div className="card p-5 border-2 border-brand-200 dark:border-brand-800 bg-brand-50/30 dark:bg-brand-950/20">
        <div className="flex items-start gap-3">
          <Target size={22} className="text-brand-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Goal solver</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Set a target, pick when you want to reach it, and see how much you need to save each month, year, or week.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-4">
          <div className="card p-4 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Your goal</h3>
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 text-sm">
              {[
                { id: 'balance', label: 'Target balance' },
                { id: 'income', label: 'Monthly income' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setField('goalKind', opt.id)}
                  className={clsx(
                    'flex-1 py-2 rounded-md font-medium transition-colors',
                    form.goalKind === opt.id
                      ? 'bg-brand-600 text-white'
                      : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {form.goalKind === 'income' ? (
              <>
                <NumericField
                  label="Target monthly income (€)"
                  value={form.targetMonthlyIncome}
                  onChange={(v) => setField('targetMonthlyIncome', v)}
                  min={0}
                  step={50}
                />
                <NumericField
                  label="Safe withdrawal rate"
                  value={form.safeWithdrawalRate}
                  onChange={(v) => setField('safeWithdrawalRate', v)}
                  min={2}
                  max={8}
                  step={0.1}
                  unit="%"
                  hint={`Portfolio needed: ${fmtEur(effectiveTarget)}`}
                />
              </>
            ) : (
              <NumericField
                label="Target amount (€)"
                value={form.targetValue}
                onChange={(v) => setField('targetValue', v)}
                min={0}
                step={1000}
              />
            )}

            <NumericField
              label="I want to reach it in (years)"
              value={form.goalDeadlineYears}
              onChange={(v) => setField('goalDeadlineYears', v)}
              min={1}
              max={50}
              step={1}
            />
          </div>

          <div className="card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Today</h3>
            <PlannerBasisFields
              form={form}
              set={setField}
              baseline={baseline}
              isLoading={baselineLoading}
              tickerPick={tickerPick}
              setTickerPick={setTickerPick}
            />
          </div>

          <div className="card p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Assumptions</h3>
            <NumericField
              label="Expected return per year"
              value={form.annualReturn}
              onChange={(v) => setField('annualReturn', v)}
              min={-10}
              max={25}
              step={0.1}
              unit="%"
            />
            <NumericField
              label="Contribution growth per year"
              value={form.contributionGrowthRate}
              onChange={(v) => setField('contributionGrowthRate', v)}
              min={0}
              max={20}
              step={0.1}
              unit="%"
            />
            <button type="button" className="btn-secondary text-xs w-full" onClick={onSyncBaseline}>
              Refresh from portfolio
            </button>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-4">
          {effectiveTarget > 0 && (
            <>
              <div className="card p-5 bg-gradient-to-r from-brand-600 to-indigo-600 text-white">
                <p className="text-sm opacity-90">To reach</p>
                <p className="text-2xl sm:text-3xl font-bold tabular-nums">{fmtEur(effectiveTarget)}</p>
                <p className="text-sm mt-2 opacity-90">
                  in <strong>{form.goalDeadlineYears} years</strong>, starting from {fmtEur(form.principal)} today
                </p>
                {primaryRow && (
                  <p className="text-xl font-semibold mt-4 tabular-nums">
                    Save {fmtEur(primaryRow.monthly)} / month
                  </p>
                )}
                {gap > 0 && (
                  <p className="text-xs mt-2 opacity-80">
                    Gap to close with savings + growth: {fmtEur(gap)} (before compounding)
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {primaryRow && [
                  { label: 'Per month', value: fmtEur(primaryRow.monthly), icon: PiggyBank },
                  { label: 'Per year', value: fmtEur(primaryRow.yearly), icon: TrendingUp },
                  { label: 'Per week', value: fmtEur(primaryRow.weekly), icon: Clock },
                  {
                    label: 'At current pace',
                    value: savingsPlan?.yearsAtCurrentPace != null
                      ? `${savingsPlan.yearsAtCurrentPace} yrs`
                      : '—',
                    icon: Target,
                    sub: form.monthlyContribution > 0
                      ? `${fmtEur(form.monthlyContribution)}/mo`
                      : 'Set monthly below',
                  },
                ].map((k) => (
                  <div key={k.label} className="card p-3">
                    <k.icon size={14} className="text-brand-600 mb-1" />
                    <p className="text-[10px] text-gray-400 uppercase">{k.label}</p>
                    <p className="text-base font-bold tabular-nums">{k.value}</p>
                    {k.sub && <p className="text-[10px] text-gray-400">{k.sub}</p>}
                  </div>
                ))}
              </div>

              <div className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    How much to save by deadline
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Monthly contribution required (return {fmtPct(form.annualReturn)}, growth {fmtPct(form.contributionGrowthRate)} on contributions)
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500">
                      <tr>
                        {['Deadline', 'Monthly', 'Yearly', 'Weekly'].map((h) => (
                          <th key={h} className="text-left px-4 py-2.5 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {savingsPlan?.rows.map((row) => {
                        const highlight = row.years === form.goalDeadlineYears;
                        return (
                          <tr
                            key={row.years}
                            className={clsx(
                              highlight && 'bg-brand-50/80 dark:bg-brand-900/25 font-medium'
                            )}
                          >
                            <td className="px-4 py-3">
                              {row.years} years
                              {highlight && (
                                <span className="ml-2 text-[10px] uppercase text-brand-600">Your target</span>
                              )}
                            </td>
                            <td className="px-4 py-3 tabular-nums">{fmtEur(row.monthly)}</td>
                            <td className="px-4 py-3 tabular-nums text-gray-600 dark:text-gray-400">{fmtEur(row.yearly)}</td>
                            <td className="px-4 py-3 tabular-nums text-gray-500">{fmtEur(row.weekly)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card p-4">
                <h3 className="text-sm font-semibold mb-2">Optional: compare with your current savings rate</h3>
                <NumericField
                  label="I currently save per month (€)"
                  value={form.monthlyContribution}
                  onChange={(v) => setField('monthlyContribution', v)}
                  min={0}
                  step={10}
                  hint={
                    savingsPlan?.yearsAtCurrentPace != null && form.monthlyContribution > 0
                      ? `At ${fmtEur(form.monthlyContribution)}/mo you'd reach the goal in about ${savingsPlan.yearsAtCurrentPace} years.`
                      : 'Enter what you save today to see how long until you hit the target.'
                  }
                />
              </div>

              {deadlineProjection && (
                <p className="text-xs text-gray-500 px-1">
                  At the recommended {fmtEur(primaryRow?.monthly)}/mo, projected balance in {form.goalDeadlineYears} years:{' '}
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {fmtEur(deadlineProjection.finalValue)}
                  </span>
                  {' '}(target {fmtEur(effectiveTarget)}).
                </p>
              )}
            </>
          )}

          {effectiveTarget <= 0 && (
            <div className="card p-8 text-center text-sm text-gray-400">
              Enter a target amount or monthly income above to see your savings plan.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
