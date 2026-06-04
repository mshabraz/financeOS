import { format, subMonths, getYear, getQuarter } from 'date-fns';

export function currentPeriodValue(type) {
  const now = new Date();
  if (type === 'month') return format(now, 'yyyy-MM');
  if (type === 'quarter') return `${getYear(now)}-Q${getQuarter(now)}`;
  if (type === 'year') return String(getYear(now));
  return null;
}

export function buildPeriodOptions(type) {
  const now = new Date();
  if (type === 'month') {
    return Array.from({ length: 24 }, (_, i) => {
      const d = subMonths(now, i);
      return { value: format(d, 'yyyy-MM'), label: format(d, 'MMM yyyy') };
    });
  }
  if (type === 'quarter') {
    const opts = [];
    for (let i = 0; i < 12; i++) {
      const d = subMonths(now, i * 3);
      const y = getYear(d);
      const q = getQuarter(d);
      const val = `${y}-Q${q}`;
      if (!opts.find((o) => o.value === val)) opts.push({ value: val, label: `Q${q} ${y}` });
    }
    return opts;
  }
  if (type === 'year') {
    return Array.from({ length: 5 }, (_, i) => {
      const y = getYear(now) - i;
      return { value: String(y), label: String(y) };
    });
  }
  return [];
}

export function prevMonthValue(monthKey) {
  if (!monthKey || monthKey.length < 7) return null;
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return format(d, 'yyyy-MM');
}

export function pctChange(current, previous) {
  if (previous == null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function buildDashboardInsights({
  summary,
  prevSummary,
  monthlyTrend,
  budgets,
  portfolio,
  analytics,
  goalsProgress,
}) {
  const lines = [];
  const s = summary;
  const prev = prevSummary;

  if (s && prev?.totalExpenses != null && s.totalExpenses != null) {
    const ch = pctChange(s.totalExpenses, prev.totalExpenses);
    if (ch != null && Math.abs(ch) >= 3) {
      lines.push({
        level: ch < 0 ? 'positive' : 'warning',
        text: ch < 0
          ? `Spending is ${Math.abs(ch).toFixed(0)}% lower than last month.`
          : `Spending is ${ch.toFixed(0)}% higher than last month.`,
      });
    }
  }

  if (s?.totalIncome > 0) {
    const savingsRate = ((s.totalIncome - s.totalExpenses) / s.totalIncome) * 100;
    if (savingsRate >= 0) {
      lines.push({
        level: savingsRate >= 20 ? 'positive' : 'info',
        text: `Savings rate ${savingsRate.toFixed(0)}% this period (income − spending).`,
      });
    }
  }

  const overBudget = (budgets ?? []).filter((b) => b.budgeted > 0 && b.spent > b.budgeted);
  if (overBudget.length) {
    const top = overBudget[0];
    lines.push({
      level: 'warning',
      text: `Over budget in ${top.icon ? `${top.icon} ` : ''}${top.name}.`,
    });
  }

  if (portfolio?.unrealizedPnLEur != null && Math.abs(portfolio.unrealizedPnLEur) > 1) {
    const sign = portfolio.unrealizedPnLEur >= 0 ? 'gained' : 'lost';
    lines.push({
      level: portfolio.unrealizedPnLEur >= 0 ? 'positive' : 'negative',
      text: `Portfolio ${sign} €${Math.abs(portfolio.unrealizedPnLEur).toLocaleString('et-EE', { maximumFractionDigits: 0 })} unrealized.`,
    });
  }

  const warnings = analytics?.diversification?.warnings ?? [];
  if (warnings[0]) {
    lines.push({ level: 'warning', text: warnings[0].message });
  }

  if (goalsProgress?.goalName) {
    if (goalsProgress.completed) {
      lines.push({ level: 'positive', text: `Goal “${goalsProgress.goalName}” reached.` });
    } else if (goalsProgress.onTrack === 'behind') {
      lines.push({
        level: 'warning',
        text: `“${goalsProgress.goalName}” is behind plan.`,
      });
    } else if (goalsProgress.projectedHint) {
      lines.push({ level: 'info', text: goalsProgress.projectedHint });
    }
  }

  const lastTwo = monthlyTrend?.slice(-2) ?? [];
  if (lastTwo.length === 2) {
    const [a, b] = lastTwo;
    const spike = b.expenses > a.expenses * 1.35 && b.expenses > 500;
    if (spike) {
      lines.push({
        level: 'warning',
        text: 'Spending jumped vs prior month — review large transactions.',
      });
    }
  }

  return lines.slice(0, 6);
}

export function buildAttentionItems({ portfolio, budgets, sharedEvents }) {
  const items = [];
  if (portfolio?.unboundCount > 0) {
    items.push({
      id: 'unbound',
      severity: 'warning',
      title: `${portfolio.unboundCount} investment${portfolio.unboundCount === 1 ? '' : 's'} need price linking`,
      href: '/investments?tab=holdings',
    });
  }
  if (portfolio?.needsQuantityCount > 0) {
    items.push({
      id: 'qty',
      severity: 'warning',
      title: `${portfolio.needsQuantityCount} fund position${portfolio.needsQuantityCount === 1 ? '' : 's'} need quantity or avg cost`,
      href: '/investments?tab=holdings',
    });
  }
  if (portfolio?.syncStatus === 'error' || portfolio?.syncError) {
    items.push({
      id: 'sync',
      severity: 'error',
      title: 'Investment price sync failed',
      detail: portfolio.syncError,
      href: '/investments?tab=holdings',
    });
  }
  const over = (budgets ?? []).filter((b) => b.budgeted > 0 && b.spent > b.budgeted * 1.05);
  if (over.length) {
    items.push({
      id: 'budget',
      severity: 'warning',
      title: `${over.length} budget${over.length === 1 ? '' : 's'} exceeded`,
      href: '/analytics',
    });
  }
  const activeShared = (sharedEvents ?? []).filter((e) => e.expense_count > 0);
  if (activeShared.length > 0) {
    items.push({
      id: 'shared',
      severity: 'info',
      title: `${activeShared.length} shared expense event${activeShared.length === 1 ? '' : 's'} active`,
      href: '/shared',
    });
  }
  return items;
}
