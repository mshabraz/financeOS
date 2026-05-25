const { getDb } = require('../../db/database');
const { computeShares, validateExpense } = require('./calculations');
const { minimizeTransfers, roundMoney } = require('./settlement');

function listEvents() {
  const db = getDb();
  return db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM shared_participants p WHERE p.event_id = e.id) AS participant_count,
      (SELECT COUNT(*) FROM shared_expenses x WHERE x.event_id = e.id) AS expense_count,
      (SELECT COALESCE(SUM(
        (SELECT COALESCE(SUM(amount),0) FROM shared_expense_payments pay WHERE pay.expense_id = x.id)
      ),0) FROM shared_expenses x WHERE x.event_id = e.id) AS total_spend
    FROM shared_events e
    ORDER BY e.updated_at DESC, e.id DESC
  `).all();
}

function getEvent(eventId) {
  const db = getDb();
  const event = db.prepare('SELECT * FROM shared_events WHERE id = ?').get(eventId);
  if (!event) return null;

  const participants = db.prepare(
    'SELECT * FROM shared_participants WHERE event_id = ? ORDER BY sort_order, id'
  ).all(eventId);

  const expenses = db.prepare(
    'SELECT * FROM shared_expenses WHERE event_id = ? ORDER BY expense_date, id'
  ).all(eventId);

  for (const exp of expenses) {
    exp.payments = db.prepare(
      `SELECT pay.*, p.name AS participant_name
       FROM shared_expense_payments pay
       JOIN shared_participants p ON p.id = pay.participant_id
       WHERE pay.expense_id = ?`
    ).all(exp.id);
    exp.shares = db.prepare(
      `SELECT sh.*, p.name AS participant_name
       FROM shared_expense_shares sh
       JOIN shared_participants p ON p.id = sh.participant_id
       WHERE sh.expense_id = ?`
    ).all(exp.id);
    exp.amount = roundMoney(exp.payments.reduce((s, x) => s + x.amount, 0));
  }

  return { event, participants, expenses };
}

function computeSummary(eventId) {
  const data = getEvent(eventId);
  if (!data) return null;
  const { participants, expenses } = data;

  const paid = Object.fromEntries(participants.map((p) => [p.id, 0]));
  const should = Object.fromEntries(participants.map((p) => [p.id, 0]));

  for (const exp of expenses) {
    for (const pay of exp.payments) paid[pay.participant_id] = (paid[pay.participant_id] || 0) + pay.amount;
    for (const sh of exp.shares) should[sh.participant_id] = (should[sh.participant_id] || 0) + sh.amount;
  }

  const balances = participants.map((p) => ({
    id: p.id,
    name: p.name,
    paid: roundMoney(paid[p.id] || 0),
    shouldPay: roundMoney(should[p.id] || 0),
    balance: roundMoney((should[p.id] || 0) - (paid[p.id] || 0)),
  }));

  const totalSpend = roundMoney(expenses.reduce((s, e) => s + (e.amount || 0), 0));
  const byCategory = {};
  for (const exp of expenses) {
    const cat = exp.category || 'Uncategorized';
    byCategory[cat] = roundMoney((byCategory[cat] || 0) + (exp.amount || 0));
  }

  return {
    totalSpend,
    balances,
    byCategory: Object.entries(byCategory).map(([category, amount]) => ({ category, amount })),
    checks: {
      balancesSumToZero: Math.abs(roundMoney(balances.reduce((s, b) => s + b.balance, 0))) < 0.03,
      paidEqualsShould: Math.abs(roundMoney(
        balances.reduce((s, b) => s + b.paid, 0) - balances.reduce((s, b) => s + b.shouldPay, 0)
      )) < 0.03,
    },
  };
}

function getSettlement(eventId) {
  const summary = computeSummary(eventId);
  if (!summary) return null;
  const transfers = minimizeTransfers(summary.balances);
  return { balances: summary.balances, transfers };
}

function createEvent({ name, currency = 'EUR', notes = '', eventDate = null }) {
  const db = getDb();
  const r = db.prepare(
    `INSERT INTO shared_events (name, currency, notes, event_date) VALUES (?, ?, ?, ?)`
  ).run(name.trim(), currency, notes || '', eventDate);
  return db.prepare('SELECT * FROM shared_events WHERE id = ?').get(r.lastInsertRowid);
}

function updateEvent(id, fields) {
  const db = getDb();
  const sets = [];
  const vals = [];
  if (fields.name !== undefined) { sets.push('name = ?'); vals.push(fields.name.trim()); }
  if (fields.currency !== undefined) { sets.push('currency = ?'); vals.push(fields.currency); }
  if (fields.notes !== undefined) { sets.push('notes = ?'); vals.push(fields.notes); }
  if (fields.eventDate !== undefined) { sets.push('event_date = ?'); vals.push(fields.eventDate); }
  if (!sets.length) return getEvent(id)?.event;
  sets.push("updated_at = datetime('now')");
  vals.push(id);
  db.prepare(`UPDATE shared_events SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return db.prepare('SELECT * FROM shared_events WHERE id = ?').get(id);
}

function deleteEvent(id) {
  getDb().prepare('DELETE FROM shared_events WHERE id = ?').run(id);
}

function addParticipant(eventId, name) {
  const db = getDb();
  const max = db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) AS m FROM shared_participants WHERE event_id = ?'
  ).get(eventId);
  const r = db.prepare(
    'INSERT INTO shared_participants (event_id, name, sort_order) VALUES (?, ?, ?)'
  ).run(eventId, name.trim(), (max?.m ?? -1) + 1);
  return db.prepare('SELECT * FROM shared_participants WHERE id = ?').get(r.lastInsertRowid);
}

function updateParticipant(id, name) {
  const db = getDb();
  db.prepare('UPDATE shared_participants SET name = ? WHERE id = ?').run(name.trim(), id);
  return db.prepare('SELECT * FROM shared_participants WHERE id = ?').get(id);
}

function deleteParticipant(id) {
  getDb().prepare('DELETE FROM shared_participants WHERE id = ?').run(id);
}

function upsertExpense(eventId, payload, expenseId = null) {
  const db = getDb();
  const data = getEvent(eventId);
  if (!data) throw new Error('Event not found');

  const {
    description,
    expenseDate = null,
    category = '',
    notes = '',
    splitType,
    splitParticipantIds = [],
    assigneeId = null,
    customShares = [],
    payers = [],
  } = payload;

  const total = roundMoney(payers.reduce((s, p) => s + Number(p.amount), 0));
  if (!description?.trim()) throw new Error('description is required');
  if (total <= 0) throw new Error('expense total must be positive');

  const allIds = data.participants.map((p) => p.id);
  const shares = computeShares(
    total,
    splitType,
    allIds,
    splitParticipantIds,
    assigneeId,
    customShares
  );
  validateExpense(total, payers, shares);

  let id = expenseId;
  if (id) {
    db.prepare(`
      UPDATE shared_expenses
      SET description = ?, expense_date = ?, category = ?, notes = ?, split_type = ?, updated_at = datetime('now')
      WHERE id = ? AND event_id = ?
    `).run(description.trim(), expenseDate, category, notes, splitType, id, eventId);
    db.prepare('DELETE FROM shared_expense_payments WHERE expense_id = ?').run(id);
    db.prepare('DELETE FROM shared_expense_shares WHERE expense_id = ?').run(id);
  } else {
    const r = db.prepare(`
      INSERT INTO shared_expenses (event_id, description, expense_date, category, notes, split_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(eventId, description.trim(), expenseDate, category, notes, splitType);
    id = r.lastInsertRowid;
  }

  const insPay = db.prepare(
    'INSERT INTO shared_expense_payments (expense_id, participant_id, amount) VALUES (?, ?, ?)'
  );
  const insShare = db.prepare(
    'INSERT INTO shared_expense_shares (expense_id, participant_id, amount) VALUES (?, ?, ?)'
  );

  for (const p of payers) insPay.run(id, p.participantId, roundMoney(p.amount));
  for (const s of shares) insShare.run(id, s.participantId, s.amount);

  db.prepare("UPDATE shared_events SET updated_at = datetime('now') WHERE id = ?").run(eventId);
  return getEvent(eventId).expenses.find((e) => e.id === id);
}

function deleteExpense(expenseId) {
  const db = getDb();
  const exp = db.prepare('SELECT event_id FROM shared_expenses WHERE id = ?').get(expenseId);
  if (!exp) return;
  db.prepare('DELETE FROM shared_expenses WHERE id = ?').run(expenseId);
  db.prepare("UPDATE shared_events SET updated_at = datetime('now') WHERE id = ?").run(exp.event_id);
}

module.exports = {
  listEvents,
  getEvent,
  computeSummary,
  getSettlement,
  createEvent,
  updateEvent,
  deleteEvent,
  addParticipant,
  updateParticipant,
  deleteParticipant,
  upsertExpense,
  deleteExpense,
};
