const { getDb } = require('../../db/database');
const { OBLIGATION_KINDS, DIRECTIONS, DEFAULT_REMINDER_DAYS } = require('./constants');
const { enrichRow, computeStatus, roundMoney, todayStr } = require('./status');
const { ensureRecurringInstances, attachRecurrenceOnCreate, nextDueDate } = require('./recurrence');
const { clearReminderLogForObligation } = require('./reminders');
const { addDaysStr, monthRangeStr } = require('./dates');

function excludeTemplates(rows) {
  return rows.filter((r) => !r.is_series_template);
}

/** Active obligation with a due date in the current calendar month. */
function isDueThisMonth(r, monthStart, monthEnd) {
  if (!r.due_date) return false;
  return r.due_date >= monthStart && r.due_date <= monthEnd;
}

/** Payable still owed: this month's dues, past overdue, or undated one-offs — never future months. */
function isPayableThisMonth(r, monthStart, monthEnd) {
  if (r.is_series_template) return false;
  if (r.direction !== 'payable') return false;
  if (['paid', 'settled', 'cancelled'].includes(r.status)) return false;
  if (!r.due_date) return true;
  if (r.due_date > monthEnd) return false;
  if (r.status === 'overdue') return true;
  return r.due_date >= monthStart && r.due_date <= monthEnd;
}

/** Receivable to collect this month (or overdue), not future months. */
function isReceivableThisMonth(r, monthStart, monthEnd) {
  if (r.is_series_template) return false;
  if (r.direction !== 'receivable') return false;
  if (['settled', 'cancelled'].includes(r.status)) return false;
  if (!r.due_date) return true;
  if (r.due_date > monthEnd) return false;
  if (r.status === 'overdue') return true;
  return r.due_date >= monthStart && r.due_date <= monthEnd;
}

function syncStatus(db, id) {
  const row = db.prepare('SELECT * FROM money_obligations WHERE id = ?').get(id);
  if (!row) return null;
  const status = computeStatus(row);
  db.prepare(
    `UPDATE money_obligations SET status = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(status, id);
  return enrichRow(db.prepare('SELECT * FROM money_obligations WHERE id = ?').get(id));
}

function listSettlements(db, obligationId) {
  return db.prepare(
    `SELECT * FROM money_obligation_settlements WHERE obligation_id = ? ORDER BY paid_at DESC, id DESC`
  ).all(obligationId);
}

function getById(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM money_obligations WHERE id = ?').get(id);
  if (!row) return null;
  const enriched = enrichRow(row);
  enriched.settlements = listSettlements(db, id);
  return enriched;
}

function list({ filter, direction, from, to, q, horizon } = {}) {
  const db = getDb();
  const { monthStart, monthEnd } = monthRangeStr();
  const recurThrough = filter === 'calendar' || filter === 'active'
    ? (horizon || addDaysStr(todayStr(), 90))
    : monthEnd;
  ensureRecurringInstances(db, { throughDate: recurThrough });

  if (recurThrough === monthEnd) {
    db.prepare(`
      DELETE FROM money_obligations
      WHERE is_series_template = 0 AND series_id IS NOT NULL
        AND due_date > ? AND cancelled_at IS NULL
    `).run(monthEnd);
  }

  const conds = ['cancelled_at IS NULL'];
  const params = [];

  if (direction && DIRECTIONS.includes(direction)) {
    conds.push('direction = ?');
    params.push(direction);
  }

  if (from) {
    conds.push('(due_date IS NULL OR due_date >= ?)');
    params.push(from);
  }
  if (to) {
    conds.push('(due_date IS NULL OR due_date <= ?)');
    params.push(to);
  }

  if (q && String(q).trim()) {
    const s = `%${String(q).trim().toLowerCase()}%`;
    conds.push(`(
      LOWER(title) LIKE ? OR LOWER(IFNULL(counterparty,'')) LIKE ?
      OR LOWER(IFNULL(category,'')) LIKE ? OR LOWER(IFNULL(description,'')) LIKE ?
    )`);
    params.push(s, s, s, s);
  }

  let rows = db.prepare(
    `SELECT * FROM money_obligations WHERE ${conds.join(' AND ')} ORDER BY due_date IS NULL, due_date ASC, id DESC`
  ).all(...params);

  rows = rows.map(enrichRow);

  const today = todayStr();
  const weekEnd = addDaysStr(today, 7);

  if (filter === 'upcoming') {
    rows = excludeTemplates(rows).filter((r) =>
      !['paid', 'settled', 'cancelled'].includes(r.status)
      && isDueThisMonth(r, monthStart, monthEnd));
  } else if (filter === 'overdue') {
    rows = excludeTemplates(rows).filter((r) => r.status === 'overdue');
  } else if (filter === 'due_week') {
    rows = excludeTemplates(rows).filter((r) =>
      r.due_date && r.due_date >= today && r.due_date <= weekEnd
      && !['paid', 'settled', 'cancelled'].includes(r.status));
  } else if (filter === 'payable') {
    rows = excludeTemplates(rows).filter((r) => isPayableThisMonth(r, monthStart, monthEnd));
  } else if (filter === 'receivable') {
    rows = excludeTemplates(rows).filter((r) => isReceivableThisMonth(r, monthStart, monthEnd));
  } else if (filter === 'settled') {
    rows = rows.filter((r) => ['paid', 'settled'].includes(r.status));
  } else if (filter === 'recurring') {
    rows = rows.filter((r) => r.is_series_template);
  } else if (filter === 'active') {
    rows = rows.filter((r) => !['paid', 'settled', 'cancelled'].includes(r.status));
  }

  return rows;
}

function summary() {
  const db = getDb();
  const { monthStart, monthEnd, monthLabel } = monthRangeStr();
  ensureRecurringInstances(db, { throughDate: monthEnd });
  const all = db.prepare(
    `SELECT * FROM money_obligations WHERE cancelled_at IS NULL`
  ).all().map(enrichRow);

  const today = todayStr();
  const weekEnd = addDaysStr(today, 7);

  const active = excludeTemplates(all).filter((r) => !['paid', 'settled', 'cancelled'].includes(r.status));
  const overdue = active.filter((r) => r.status === 'overdue');
  const dueWeek = active.filter((r) => r.due_date && r.due_date >= today && r.due_date <= weekEnd);
  const dueThisMonth = active.filter((r) => isDueThisMonth(r, monthStart, monthEnd));
  const owedToMe = active.filter((r) => isReceivableThisMonth(r, monthStart, monthEnd));
  const iOwe = active.filter((r) => isPayableThisMonth(r, monthStart, monthEnd));

  const sumRemaining = (rows) => roundMoney(rows.reduce((s, r) => s + r.amount_remaining, 0));

  const byKind = {};
  for (const r of active) {
    byKind[r.obligation_kind] = roundMoney((byKind[r.obligation_kind] || 0) + r.amount_remaining);
  }

  const subscriptions = active.filter((r) => r.obligation_kind === 'subscription');

  return {
    monthLabel,
    monthStart,
    monthEnd,
    counts: {
      active: active.length,
      overdue: overdue.length,
      dueNext7Days: dueWeek.length,
      dueThisMonth: dueThisMonth.length,
      owedToMe: owedToMe.length,
      iOwe: iOwe.length,
      recurring: all.filter((r) => r.is_series_template).length,
    },
    totals: {
      owedToMeEur: sumRemaining(owedToMe),
      iOweEur: sumRemaining(iOwe),
      overduePayableEur: sumRemaining(overdue.filter((r) => r.direction === 'payable')),
      dueWeekEur: sumRemaining(dueWeek),
      dueThisMonthEur: sumRemaining(dueThisMonth),
    },
    byKind,
    subscriptionsCount: subscriptions.length,
    subscriptionsMonthlyEur: sumRemaining(subscriptions),
  };
}

function validatePayload(body, partial = false) {
  const errors = [];
  if (!partial || body.direction != null) {
    if (!DIRECTIONS.includes(body.direction)) errors.push('Invalid direction');
  }
  if (!partial || body.title != null) {
    if (!body.title || !String(body.title).trim()) errors.push('Title is required');
  }
  if (!partial || body.amount != null) {
    if (body.amount == null || Number(body.amount) <= 0) errors.push('Amount must be positive');
  }
  if (body.obligation_kind && !OBLIGATION_KINDS.includes(body.obligation_kind)) {
    errors.push('Invalid obligation kind');
  }
  return errors;
}

function create(body) {
  const db = getDb();
  const errors = validatePayload(body);
  if (errors.length) throw new Error(errors.join('; '));

  const recurrence = attachRecurrenceOnCreate(body);
  const reminderDays = JSON.stringify(
    body.reminder_days?.length ? body.reminder_days : DEFAULT_REMINDER_DAYS,
  );
  const tags = body.tags?.length ? JSON.stringify(body.tags) : null;

  const result = db.prepare(`
    INSERT INTO money_obligations (
      direction, obligation_kind, title, amount, currency, due_date, counterparty,
      category, description, reminder_days, recurrence_rule, series_id, is_series_template,
      tags, shared_event_id, linked_transaction_id, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'upcoming')
  `).run(
    body.direction,
    body.obligation_kind || 'custom',
    String(body.title).trim(),
    roundMoney(body.amount),
    (body.currency || 'EUR').toUpperCase(),
    body.due_date || null,
    body.counterparty?.trim() || null,
    body.category?.trim() || null,
    body.description?.trim() || null,
    reminderDays,
    recurrence.recurrence_rule,
    recurrence.series_id,
    recurrence.is_series_template,
    tags,
    body.shared_event_id || null,
    body.linked_transaction_id || null,
  );

  ensureRecurringInstances(db);
  return syncStatus(db, result.lastInsertRowid);
}

function update(id, body) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM money_obligations WHERE id = ?').get(id);
  if (!existing) return null;

  const errors = validatePayload(body, true);
  if (errors.length) throw new Error(errors.join('; '));

  const fields = [];
  const params = [];
  const allowed = [
    'direction', 'obligation_kind', 'title', 'amount', 'currency', 'due_date',
    'counterparty', 'category', 'description', 'shared_event_id', 'linked_transaction_id',
    'snoozed_until',
  ];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`);
      params.push(body[key]);
    }
  }

  if (body.reminder_days !== undefined) {
    fields.push('reminder_days = ?');
    params.push(JSON.stringify(body.reminder_days));
  }
  if (body.tags !== undefined) {
    fields.push('tags = ?');
    params.push(body.tags?.length ? JSON.stringify(body.tags) : null);
  }
  if (body.recurrence_rule !== undefined) {
    const rec = attachRecurrenceOnCreate({ recurrence_rule: body.recurrence_rule });
    fields.push('recurrence_rule = ?', 'series_id = ?', 'is_series_template = ?');
    params.push(rec.recurrence_rule, rec.series_id, rec.is_series_template);
  }

  if (!fields.length) return getById(id);

  fields.push(`updated_at = datetime('now')`);
  params.push(id);
  db.prepare(`UPDATE money_obligations SET ${fields.join(', ')} WHERE id = ?`).run(...params);

  if (body.due_date !== undefined) clearReminderLogForObligation(db, id);

  ensureRecurringInstances(db);
  return syncStatus(db, id);
}

function recordSettlement(id, { amount, paidAt, notes }) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM money_obligations WHERE id = ?').get(id);
  if (!row) return null;

  const pay = roundMoney(amount);
  if (pay <= 0) throw new Error('Settlement amount must be positive');

  db.prepare(`
    INSERT INTO money_obligation_settlements (obligation_id, amount, paid_at, notes)
    VALUES (?, ?, ?, ?)
  `).run(id, pay, paidAt || todayStr(), notes?.trim() || null);

  const newPaid = roundMoney((row.amount_paid || 0) + pay);
  db.prepare(`
    UPDATE money_obligations SET amount_paid = ?, updated_at = datetime('now') WHERE id = ?
  `).run(newPaid, id);

  const updated = syncStatus(db, id);

  if (updated.amount_remaining <= 0.005) {
    db.prepare(`
      UPDATE money_obligations SET completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
    `).run(id);
    clearReminderLogForObligation(db, id);

    if (row.is_series_template && row.recurrence_rule && row.due_date) {
      const next = nextDueDate(row.due_date, row.recurrence_rule);
      if (next) {
        db.prepare(`
          UPDATE money_obligations SET due_date = ?, amount_paid = 0, completed_at = NULL,
            status = 'upcoming', updated_at = datetime('now')
          WHERE id = ? AND is_series_template = 1
        `).run(next, id);
      }
    }
  }

  ensureRecurringInstances(db);
  return getById(id);
}

function markPaid(id) {
  const row = getById(id);
  if (!row) return null;
  const remaining = row.amount_remaining;
  if (remaining <= 0.005) return row;
  return recordSettlement(id, { amount: remaining, notes: 'Marked paid' });
}

function snooze(id, untilDate) {
  return update(id, { snoozed_until: untilDate });
}

function cancel(id) {
  const db = getDb();
  db.prepare(`
    UPDATE money_obligations
    SET cancelled_at = datetime('now'), status = 'cancelled', updated_at = datetime('now')
    WHERE id = ?
  `).run(id);
  clearReminderLogForObligation(db, id);
  return getById(id);
}

function remove(id) {
  const db = getDb();
  db.prepare('DELETE FROM money_obligations WHERE id = ?').run(id);
  return { ok: true };
}

function calendar({ from, to }) {
  const rows = list({ filter: 'active', from, to, horizon: to });
  const byDate = {};
  for (const r of rows) {
    const d = r.due_date || 'no_date';
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(r);
  }
  return { byDate, items: rows };
}

module.exports = {
  list,
  getById,
  summary,
  create,
  update,
  recordSettlement,
  markPaid,
  snooze,
  cancel,
  remove,
  calendar,
};
