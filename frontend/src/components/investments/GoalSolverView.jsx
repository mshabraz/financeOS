import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addYears } from 'date-fns';
import { Flag } from 'lucide-react';
import clsx from 'clsx';
import {
  buildGoalSavingsPlan,
  monthlyContributionForGoal,
  resolveGoalTarget,
  runProjection,
  yearsToReachGoal,
  formatYearsToGoal,
} from '../../utils/compoundPlannerEngine';
import { fmtEur, fmtPct } from '../../utils/investmentFormat';
import { createWealthGoal } from '../../api/client';
import PlannerBasisFields from './PlannerBasisFields';
import PlannerMetricStrip from './PlannerMetricStrip';
import NumericField from './plannerNumericField';

function mapBasisForTracking(basis) {
  if (basis === 'broker' || basis === 'tickers') return 'portfolio';
  if (['portfolio', 'net_worth', 'portfolio_no_cash', 'manual'].includes(basis)) return basis;
  return 'portfolio';
}

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
  onTrackingStarted,
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

  const paceToGoal = useMemo(() => {
    if (effectiveTarget <= 0) return null;
    return yearsToReachGoal(input, effectiveTarget, form.monthlyContribution || 0);
  }, [input, effectiveTarget, form.monthlyContribution]);

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

  const qc = useQueryClient();
  const trackMut = useMutation({
    mutationFn: () => {
      const years = form.goalDeadlineYears || 20;
      const targetDate = format(addYears(new Date(), years), 'yyyy-MM-dd');
      return createWealthGoal({
        name: form.goalTrackName || 'Wealth target',
        targetAmount: effectiveTarget,
        targetDate,
        basis: mapBasisForTracking(form.basis),
        broker: form.basis === 'broker' ? form.plannerBroker || '' : '',
        annualReturn: form.annualReturn ?? 7,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wealthGoals'] });
      qc.invalidateQueries({ queryKey: ['wealthGoalProgress'] });
      onTrackingStarted?.();
    },
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-5">
        <div className="xl:col-span-4 space-y-3">
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
              onSyncBaseline={onSyncBaseline}
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
          </div>
        </div>

        <div className="xl:col-span-8 space-y-4">
          {effectiveTarget > 0 && (
            <>
              <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-indigo-700 text-white p-4 sm:p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide opacity-80">Target</p>
                    <p className="text-2xl sm:text-3xl font-bold tabular-nums">{fmtEur(effectiveTarget)}</p>
                    <p className="text-sm mt-1 opacity-90">
                      in {form.goalDeadlineYears} years · from {fmtEur(form.principal)} today
                    </p>
                  </div>
                  {primaryRow && (
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide opacity-80">Required</p>
                      <p className="text-xl sm:text-2xl font-bold tabular-nums">{fmtEur(primaryRow.monthly)}/mo</p>
                    </div>
                  )}
                </div>
                {gap > 0 && (
                  <p className="text-xs mt-3 opacity-75 border-t border-white/20 pt-2">
                    Savings gap (before growth): {fmtEur(gap)}
                  </p>
                )}
              </div>

              {primaryRow && (
                <PlannerMetricStrip
                  items={[
                    { label: 'Per month', value: fmtEur(primaryRow.monthly) },
                    { label: 'Per year', value: fmtEur(primaryRow.yearly) },
                    { label: 'Per week', value: fmtEur(primaryRow.weekly) },
                    {
                      label: 'At current rate',
                      value: paceToGoal ? formatYearsToGoal(paceToGoal) : '—',
                      sub:
                        form.monthlyContribution > 0
                          ? `${fmtEur(form.monthlyContribution)}/mo saved`
                          : paceToGoal?.alreadyReached
                            ? 'Capital covers target'
                            : 'No monthly savings set',
                    },
                  ]}
                />
              )}

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
                    paceToGoal
                      ? form.monthlyContribution > 0
                        ? `Saving ${fmtEur(form.monthlyContribution)}/mo at ${fmtPct(form.annualReturn)} return → ${formatYearsToGoal(paceToGoal)} to reach ${fmtEur(effectiveTarget)}.`
                        : paceToGoal.alreadyReached
                          ? 'Your starting amount already meets the target.'
                          : `With no new savings, growth alone → ${formatYearsToGoal(paceToGoal)} to reach the target.`
                      : 'Enter what you save per month to see how long until you hit the target.'
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

              <div className="card p-4 border border-dashed border-brand-300 dark:border-brand-700">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2 flex items-center gap-2">
                  <Flag size={16} className="text-brand-600" />
                  Track this goal over time
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  Save as your active wealth goal to monitor monthly net savings (Analytics logic) vs required pace in Goal tracking.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    className="input flex-1 text-sm"
                    placeholder="Goal name (e.g. FIRE 500k)"
                    value={form.goalTrackName || ''}
                    onChange={(e) => setField('goalTrackName', e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-primary shrink-0"
                    disabled={trackMut.isPending || effectiveTarget <= 0}
                    onClick={() => trackMut.mutate()}
                  >
                    {trackMut.isPending ? 'Saving…' : 'Set as tracking goal'}
                  </button>
                </div>
                {trackMut.isError && (
                  <p className="text-xs text-red-600 mt-2">{trackMut.error.message}</p>
                )}
              </div>
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
