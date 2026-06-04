const { todayStr, addDaysStr, daysBetween } = require('./dates');
const { parseReminderDays, isActive, enrichRow } = require('./status');

function reminderKey(obligationId, kind, dueDate) {
  return `${obligationId}:${kind}:${dueDate || 'none'}`;
}

function computeReminderKinds(row, today = todayStr()) {
  if (!isActive(row) || !row.due_date) return [];
  const due = row.due_date;
  const daysUntil = daysBetween(today, due);
  if (daysUntil == null) return [];
  const kinds = [];
  const offsets = parseReminderDays(row.reminder_days);

  for (const offset of offsets) {
    if (daysUntil === offset) {
      kinds.push(offset === 0 ? 'due_today' : `before_${offset}d`);
    }
  }

  if (daysUntil < 0 && row.amount_remaining > 0.005) {
    kinds.push('overdue');
  }

  return kinds;
}

function listDueReminders(db, { includeLogged = false } = {}) {
  const today = todayStr();
  const horizon = addDaysStr(today, 14);
  const rows = db.prepare(`
    SELECT * FROM money_obligations
    WHERE cancelled_at IS NULL
      AND status NOT IN ('paid', 'settled', 'cancelled')
      AND (snoozed_until IS NULL OR snoozed_until <= ?)
      AND due_date IS NOT NULL
      AND due_date <= ?
    ORDER BY due_date ASC
  `).all(today, horizon);

  const out = [];
  for (const raw of rows) {
    const row = enrichRow(raw);
    if (!isActive(row)) continue;
    const kinds = computeReminderKinds(row, today);
    for (const kind of kinds) {
      const key = reminderKey(row.id, kind, row.due_date);
      if (!includeLogged) {
        const logged = db.prepare(
          'SELECT 1 FROM money_obligation_reminder_log WHERE obligation_id = ? AND reminder_key = ?'
        ).get(row.id, key);
        if (logged) continue;
      }
      out.push({
        obligationId: row.id,
        kind,
        reminderKey: key,
        title: row.title,
        amount: row.amount_remaining,
        currency: row.currency,
        dueDate: row.due_date,
        direction: row.direction,
        counterparty: row.counterparty,
        status: row.status,
      });
    }
  }
  return out;
}

function markReminderFired(db, obligationId, reminderKeyValue) {
  db.prepare(`
    INSERT OR IGNORE INTO money_obligation_reminder_log (obligation_id, reminder_key)
    VALUES (?, ?)
  `).run(obligationId, reminderKeyValue);
}

function clearReminderLogForObligation(db, obligationId) {
  db.prepare('DELETE FROM money_obligation_reminder_log WHERE obligation_id = ?').run(obligationId);
}

module.exports = {
  reminderKey,
  computeReminderKinds,
  listDueReminders,
  markReminderFired,
  clearReminderLogForObligation,
};
