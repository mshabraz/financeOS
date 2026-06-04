const { getDb } = require('../../db/database');

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function enrich(row) {
  if (!row) return null;
  return {
    ...row,
    completed: !!row.completed_at,
  };
}

function list({ includeCompleted = false, q } = {}) {
  const db = getDb();
  const conds = [];
  const params = [];
  if (!includeCompleted) {
    conds.push('completed_at IS NULL');
  }
  if (q && String(q).trim()) {
    const s = `%${String(q).trim().toLowerCase()}%`;
    conds.push('(LOWER(title) LIKE ? OR LOWER(IFNULL(notes,\'\')) LIKE ?)');
    params.push(s, s);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT * FROM finance_tasks ${where}
    ORDER BY completed_at IS NOT NULL, due_date IS NULL, due_date ASC, sort_order ASC, id DESC
  `).all(...params);
  return rows.map(enrich);
}

function getById(id) {
  const db = getDb();
  return enrich(db.prepare('SELECT * FROM finance_tasks WHERE id = ?').get(id));
}

function create(body) {
  const db = getDb();
  const title = String(body.title || '').trim();
  if (!title) throw new Error('Title is required');
  const maxOrder = db.prepare(
    'SELECT COALESCE(MAX(sort_order), 0) AS m FROM finance_tasks WHERE completed_at IS NULL'
  ).get().m;
  const result = db.prepare(`
    INSERT INTO finance_tasks (title, notes, due_date, due_time, list_name, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    title,
    body.notes?.trim() || null,
    body.due_date || null,
    body.due_time || null,
    body.list_name?.trim() || 'Tasks',
    maxOrder + 1,
  );
  return getById(result.lastInsertRowid);
}

function update(id, body) {
  const db = getDb();
  const existing = getById(id);
  if (!existing) return null;
  const fields = [];
  const params = [];
  for (const key of ['title', 'notes', 'due_date', 'due_time', 'list_name', 'sort_order']) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`);
      params.push(body[key]);
    }
  }
  if (!fields.length) return existing;
  fields.push(`updated_at = datetime('now')`);
  params.push(id);
  db.prepare(`UPDATE finance_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  return getById(id);
}

function complete(id, completed = true) {
  const db = getDb();
  db.prepare(`
    UPDATE finance_tasks
    SET completed_at = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(completed ? new Date().toISOString() : null, id);
  return getById(id);
}

function remove(id) {
  const db = getDb();
  db.prepare('DELETE FROM finance_tasks WHERE id = ?').run(id);
  return { ok: true };
}

/** Group active tasks like Google Tasks: overdue, today, upcoming, no date. */
function grouped() {
  const today = todayStr();
  const active = list({ includeCompleted: false });
  const completed = list({ includeCompleted: true }).filter((t) => t.completed);

  const overdue = [];
  const todayList = [];
  const scheduled = [];
  const noDate = [];

  for (const t of active) {
    if (!t.due_date) noDate.push(t);
    else if (t.due_date < today) overdue.push(t);
    else if (t.due_date === today) todayList.push(t);
    else scheduled.push(t);
  }

  return { overdue, today: todayList, scheduled, noDate, completed };
}

module.exports = {
  list,
  getById,
  create,
  update,
  complete,
  remove,
  grouped,
};
