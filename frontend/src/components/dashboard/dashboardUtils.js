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

export function prevPeriodValue(periodType, periodValue) {
  if (!periodValue) return null;
  if (periodType === 'month') return prevMonthValue(periodValue);
  if (periodType === 'quarter') {
    const [yStr, qStr] = periodValue.split('-Q');
    const y = Number(yStr);
    const q = Number(qStr);
    if (!y || !q) return null;
    if (q === 1) return `${y - 1}-Q4`;
    return `${y}-Q${q - 1}`;
  }
  if (periodType === 'year') {
    const y = Number(periodValue);
    return Number.isFinite(y) ? String(y - 1) : null;
  }
  return null;
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
          ? `Spending is ${Math.abs(ch).toFixed(0)}% lower than the prior period.`
          : `Spending is ${ch.toFixed(0)}% higher than the prior period.`,
      });
    }
  }

  /* Savings rate shown only in Financial Snapshot hero — skip duplicate */

  const overBudget = (budgets ?? []).filter((b) => b.budgeted > 0 && b.spent > b.budgeted);
  if (overBudget.length) {
    const top = overBudget[0];
    lines.push({
      level: 'warning',
      text: `Over budget in ${top.icon ? `${top.icon} ` : ''}${top.name}.`,
    });
  }

  /* Unrealized P/L € shown only in hero — use diversification warnings below instead */

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
        text: `“${goalsProgress.goalName}” is behind plan — see Goals section.`,
      });
    } else if (goalsProgress.projectedHint && goalsProgress.onTrack !== 'on_track') {
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

export function buildAttentionItems({ portfolio, budgets, sharedEvents, obligationsSummary }) {
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
      title: `${over.length} budget${over.length === 1 ? '' : 's'} exceeded this month`,
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
  const overdueCount = obligationsSummary?.counts?.overdue ?? 0;
  if (overdueCount > 0) {
    items.push({
      id: 'obligations-overdue',
      severity: 'error',
      title: `${overdueCount} overdue payment${overdueCount === 1 ? '' : 's'}`,
      href: '/due?tab=overdue',
    });
  }
  const dueWeek = obligationsSummary?.counts?.dueNext7Days ?? 0;
  if (dueWeek > 0 && overdueCount === 0) {
    items.push({
      id: 'obligations-week',
      severity: 'warning',
      title: `${dueWeek} due in the next 7 days`,
      href: '/due',
    });
  }
  return items;
}

/** Convert contextual insights into attention-row shape (no link). */
export function insightsToAttentionItems(insights) {
  return (insights ?? []).map((ins, i) => ({
    id: `insight-${i}`,
    severity: ins.level === 'warning' ? 'warning' : ins.level === 'positive' ? 'info' : 'info',
    title: ins.text,
    href: null,
  }));
}
