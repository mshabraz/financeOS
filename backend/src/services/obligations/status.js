const { todayStr, daysBetween } = require('./dates');

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function parseReminderDays(raw) {
  if (Array.isArray(raw)) return raw.map(Number).filter((n) => !Number.isNaN(n));
  if (typeof raw === 'string') {
    if (raw === '[]' || raw.trim() === '') return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(Number).filter((n) => !Number.isNaN(n)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isActive(row) {
  return !row.cancelled_at && !['paid', 'settled', 'cancelled'].includes(row.status);
}

function computeStatus(row, today = todayStr()) {
  if (row.cancelled_at) return 'cancelled';
  const amount = roundMoney(row.amount);
  const paid = roundMoney(row.amount_paid);
  const remaining = roundMoney(amount - paid);

  if (remaining <= 0.005) {
    return row.direction === 'payable' ? 'paid' : 'settled';
  }
  if (paid > 0.005) return 'partial';

  if (row.snoozed_until && row.snoozed_until > today) return 'upcoming';

  const due = row.due_date;
  if (due) {
    const diff = daysBetween(today, due);
    if (diff != null && diff < 0) return 'overdue';
    if (diff === 0) return 'due_today';
  }

  if (row.direction === 'receivable') return 'waiting';
  return 'upcoming';
}

function enrichRow(row) {
  const status = computeStatus(row);
  const amount = roundMoney(row.amount);
  const amountPaid = roundMoney(row.amount_paid);
  let tags = [];
  let recurrence_rule = null;
  try {
    if (row.tags) tags = typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags;
  } catch { /* ignore */ }
  try {
    if (row.recurrence_rule) {
      recurrence_rule = typeof row.recurrence_rule === 'string'
        ? JSON.parse(row.recurrence_rule)
        : row.recurrence_rule;
    }
  } catch { /* ignore */ }

  return {
    ...row,
    status,
    amount_remaining: roundMoney(Math.max(0, amount - amountPaid)),
    reminder_days: parseReminderDays(row.reminder_days),
    tags,
    recurrence_rule,
    is_series_template: !!row.is_series_template,
  };
}

module.exports = {
  todayStr,
  roundMoney,
  parseReminderDays,
  isActive,
  computeStatus,
  enrichRow,
};
