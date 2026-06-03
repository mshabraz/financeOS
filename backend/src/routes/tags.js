/**
 * Tag routes — full CRUD + bulk assign + merge + reporting
 * (supports both bank transactions and isolated Revolut rows)
 */
const express = require('express');
const { getDb } = require('../db/database');
const logger = require('../services/logger');

const router = express.Router();

function minDates(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return a <= b ? a : b;
}

function maxDates(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return a >= b ? a : b;
}

function mergeByMonth(byMonthBank, byMonthRev) {
  const m = {};
  const addRows = (rows, keyExpense, keyIncome) => {
    for (const row of rows) {
      const mon = row.month;
      if (!m[mon]) m[mon] = { month: mon, expenseNet: 0, incomeNet: 0, count: 0 };
      m[mon].expenseNet += row[keyExpense] ?? row.expenseNet ?? 0;
      m[mon].incomeNet += row[keyIncome] ?? row.incomeNet ?? 0;
      m[mon].count += row.count ?? 0;
    }
  };
  addRows(byMonthBank, 'expenseNet', 'incomeNet');
  addRows(byMonthRev, 'expenseNet', 'incomeNet');
  return Object.values(m).sort((x, y) => x.month.localeCompare(y.month));
}

// GET /api/tags — all tags with usage counts (bank + Revolut)
router.get('/', (_req, res) => {
  const db = getDb();
  const tags = db.prepare(
    `SELECT t.*,
      (SELECT COUNT(*) FROM transaction_tags tt WHERE tt.tag_id = t.id)
      + (SELECT COUNT(*) FROM revolut_transaction_tags rt WHERE rt.tag_id = t.id) AS usage_count
     FROM tags t
     ORDER BY usage_count DESC, t.name`
  ).all();
  res.json(tags);
});

// POST /api/tags — create tag
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { name, color = '#6366f1', description = '' } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

    const result = db.prepare(
      'INSERT INTO tags (name, color, description) VALUES (?, ?, ?)'
    ).run(name.trim(), color, description);

    res.json(db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Tag name already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/tags/:id — rename / recolor
router.patch('/:id', (req, res) => {
  const db = getDb();
  const { name, color, description } = req.body;
  const id = req.params.id;
  const fields = [];
  const vals = [];
  if (name !== undefined) { fields.push('name = ?'); vals.push(name.trim()); }
  if (color !== undefined) { fields.push('color = ?'); vals.push(color); }
  if (description !== undefined) { fields.push('description = ?'); vals.push(description); }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(id);
  db.prepare(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  res.json(db.prepare('SELECT * FROM tags WHERE id = ?').get(id));
});

// DELETE /api/tags/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/tags/:id/merge/:targetId — move all tx from :id to :targetId, then delete :id
router.post('/:id/merge/:targetId', (req, res) => {
  const db = getDb();
  const { id, targetId } = req.params;

  const doMerge = db.transaction(() => {
    const txs = db.prepare('SELECT transaction_id FROM transaction_tags WHERE tag_id = ?').all(id);
    for (const { transaction_id } of txs) {
      const exists = db.prepare(
        'SELECT 1 FROM transaction_tags WHERE transaction_id = ? AND tag_id = ?'
      ).get(transaction_id, targetId);
      if (!exists) {
        db.prepare('INSERT INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)').run(transaction_id, targetId);
      }
    }

    const revRows = db.prepare(
      'SELECT revolut_transaction_id FROM revolut_transaction_tags WHERE tag_id = ?'
    ).all(id);
    for (const { revolut_transaction_id } of revRows) {
      const exists = db.prepare(
        'SELECT 1 FROM revolut_transaction_tags WHERE revolut_transaction_id = ? AND tag_id = ?'
      ).get(revolut_transaction_id, targetId);
      if (!exists) {
        db.prepare(
          'INSERT INTO revolut_transaction_tags (revolut_transaction_id, tag_id) VALUES (?, ?)'
        ).run(revolut_transaction_id, targetId);
      }
    }

    db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  });

  doMerge();
  res.json({ ok: true, mergedInto: parseInt(targetId, 10) });
});

// ── Transaction ↔ Tag assignment ─────────────────────────────────────────────

// GET /api/tags/transaction/:txId — tags for a specific transaction
router.get('/transaction/:txId', (req, res) => {
  const db = getDb();
  const tags = db.prepare(
    `SELECT t.* FROM tags t
     JOIN transaction_tags tt ON tt.tag_id = t.id
     WHERE tt.transaction_id = ?
     ORDER BY t.name`
  ).all(req.params.txId);
  res.json(tags);
});

// POST /api/tags/transaction/:txId — assign a tag to a transaction
router.post('/transaction/:txId', (req, res) => {
  try {
    const db = getDb();
    const { tagId } = req.body;
    if (!tagId) return res.status(400).json({ error: 'tagId required' });
    db.prepare(
      'INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)'
    ).run(parseInt(req.params.txId, 10), parseInt(tagId, 10));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tags/transaction/:txId/:tagId — remove tag from transaction
router.delete('/transaction/:txId/:tagId', (req, res) => {
  const db = getDb();
  db.prepare(
    'DELETE FROM transaction_tags WHERE transaction_id = ? AND tag_id = ?'
  ).run(parseInt(req.params.txId, 10), parseInt(req.params.tagId, 10));
  res.json({ ok: true });
});

// GET /api/tags/revolut-transaction/:rxId
router.get('/revolut-transaction/:rxId', (req, res) => {
  const db = getDb();
  const tags = db.prepare(
    `SELECT t.* FROM tags t
     JOIN revolut_transaction_tags tt ON tt.tag_id = t.id
     WHERE tt.revolut_transaction_id = ?
     ORDER BY t.name`
  ).all(req.params.rxId);
  res.json(tags);
});

// POST /api/tags/revolut-transaction/:rxId
router.post('/revolut-transaction/:rxId', (req, res) => {
  try {
    const db = getDb();
    const { tagId } = req.body;
    if (!tagId) return res.status(400).json({ error: 'tagId required' });
    const exists = db.prepare('SELECT id FROM revolut_transactions WHERE id = ?').get(req.params.rxId);
    if (!exists) return res.status(404).json({ error: 'Revolut transaction not found' });
    db.prepare(
      'INSERT OR IGNORE INTO revolut_transaction_tags (revolut_transaction_id, tag_id) VALUES (?, ?)'
    ).run(parseInt(req.params.rxId, 10), parseInt(tagId, 10));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tags/revolut-transaction/:rxId/:tagId
router.delete('/revolut-transaction/:rxId/:tagId', (req, res) => {
  const db = getDb();
  db.prepare(
    'DELETE FROM revolut_transaction_tags WHERE revolut_transaction_id = ? AND tag_id = ?'
  ).run(parseInt(req.params.rxId, 10), parseInt(req.params.tagId, 10));
  res.json({ ok: true });
});

// POST /api/tags/bulk-assign — assign one tag to many bank and/or Revolut transactions
router.post('/bulk-assign', (req, res) => {
  try {
    const db = getDb();
    const { tagId, transactionIds = [], revolutTransactionIds = [] } = req.body;
    if (!tagId) return res.status(400).json({ error: 'tagId required' });
    if ((!Array.isArray(transactionIds) || !transactionIds.length)
        && (!Array.isArray(revolutTransactionIds) || !revolutTransactionIds.length)) {
      return res.status(400).json({ error: 'transactionIds and/or revolutTransactionIds required' });
    }

    const insertBank = db.prepare(
      'INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)'
    );
    const insertRev = db.prepare(
      'INSERT OR IGNORE INTO revolut_transaction_tags (revolut_transaction_id, tag_id) VALUES (?, ?)'
    );

    const doInsert = db.transaction(() => {
      for (const txId of transactionIds) insertBank.run(parseInt(txId, 10), parseInt(tagId, 10));
      for (const rxId of revolutTransactionIds) insertRev.run(parseInt(rxId, 10), parseInt(tagId, 10));
    });
    doInsert();

    res.json({
      ok: true,
      count: (transactionIds?.length || 0) + (revolutTransactionIds?.length || 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tags/bulk-remove — remove a tag from many bank and/or Revolut transactions
router.post('/bulk-remove', (req, res) => {
  const db = getDb();
  const { tagId, transactionIds = [], revolutTransactionIds = [] } = req.body;
  if (!tagId) {
    return res.status(400).json({ error: 'tagId required' });
  }
  if ((!Array.isArray(transactionIds) || !transactionIds.length)
      && (!Array.isArray(revolutTransactionIds) || !revolutTransactionIds.length)) {
    return res.status(400).json({ error: 'transactionIds and/or revolutTransactionIds required' });
  }

  const delBank = db.prepare(
    'DELETE FROM transaction_tags WHERE transaction_id = ? AND tag_id = ?'
  );
  const delRev = db.prepare(
    'DELETE FROM revolut_transaction_tags WHERE revolut_transaction_id = ? AND tag_id = ?'
  );
  const doDelete = db.transaction(() => {
    for (const txId of transactionIds) delBank.run(parseInt(txId, 10), parseInt(tagId, 10));
    for (const rxId of revolutTransactionIds) delRev.run(parseInt(rxId, 10), parseInt(tagId, 10));
  });
  doDelete();
  res.json({ ok: true });
});

// GET /api/tags/summary/all — all tags with total spending summary (+ Revolut flows)
router.get('/summary/all', (_req, res) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT
       tg.id, tg.name, tg.color, tg.description,
       (SELECT COUNT(*) FROM transaction_tags tt WHERE tt.tag_id = tg.id)
         + (SELECT COUNT(*) FROM revolut_transaction_tags rt WHERE rt.tag_id = tg.id) AS txCount,
       COALESCE((
         SELECT SUM(CASE
               WHEN COALESCE(c.type, 'expense') = 'expense' AND tx.direction = 'D' THEN ABS(COALESCE(tx.amount, 0))
               WHEN COALESCE(c.type, 'expense') = 'expense' AND tx.direction = 'K' THEN -ABS(COALESCE(tx.amount, 0))
               ELSE 0
             END)
         FROM transaction_tags tt
         JOIN transactions tx ON tx.id = tt.transaction_id
         LEFT JOIN categories c ON c.id = tx.category_id
         WHERE tt.tag_id = tg.id
       ), 0)
       + COALESCE((
         SELECT SUM(CASE
               WHEN COALESCE(c2.type, 'expense') = 'expense' AND r.effective_amount < 0 THEN ABS(r.effective_amount)
               WHEN COALESCE(c2.type, 'expense') = 'expense' AND r.effective_amount > 0 THEN -r.effective_amount
               ELSE 0
             END)
         FROM revolut_transaction_tags rtt
         JOIN revolut_transactions r ON r.id = rtt.revolut_transaction_id
         LEFT JOIN categories c2 ON c2.id = r.category_id
         WHERE rtt.tag_id = tg.id AND COALESCE(r.exclude_from_analytics, 0) = 0
       ), 0) AS totalSpending,
       COALESCE((
         SELECT SUM(CASE
               WHEN COALESCE(c.type, 'expense') = 'income' AND tx.direction = 'K' THEN ABS(tx.amount)
               WHEN COALESCE(c.type, 'expense') = 'income' AND tx.direction = 'D' THEN -ABS(tx.amount)
               ELSE 0
             END)
         FROM transaction_tags tt
         JOIN transactions tx ON tx.id = tt.transaction_id
         LEFT JOIN categories c ON c.id = tx.category_id
         WHERE tt.tag_id = tg.id
       ), 0)
       + COALESCE((
         SELECT SUM(CASE WHEN r.effective_amount > 0 THEN r.effective_amount ELSE 0 END)
         FROM revolut_transaction_tags rtt
         JOIN revolut_transactions r ON r.id = rtt.revolut_transaction_id
         WHERE rtt.tag_id = tg.id AND COALESCE(r.exclude_from_analytics, 0) = 0
       ), 0) AS totalIncome,
       (SELECT MIN(u.d) FROM (
          SELECT tx.date AS d FROM transaction_tags tt
          JOIN transactions tx ON tx.id = tt.transaction_id WHERE tt.tag_id = tg.id
          UNION ALL
          SELECT r.date AS d FROM revolut_transaction_tags rtt
          JOIN revolut_transactions r ON r.id = rtt.revolut_transaction_id WHERE rtt.tag_id = tg.id
        ) AS u WHERE u.d IS NOT NULL) AS firstDate,
       (SELECT MAX(u.d) FROM (
          SELECT tx.date AS d FROM transaction_tags tt
          JOIN transactions tx ON tx.id = tt.transaction_id WHERE tt.tag_id = tg.id
          UNION ALL
          SELECT r.date AS d FROM revolut_transaction_tags rtt
          JOIN revolut_transactions r ON r.id = rtt.revolut_transaction_id WHERE rtt.tag_id = tg.id
        ) AS u WHERE u.d IS NOT NULL) AS lastDate
     FROM tags tg
     ORDER BY totalSpending DESC`
  ).all();
  res.json(rows);
});

// ── Tag-based analytics ───────────────────────────────────────────────────────

// GET /api/tags/:id/analytics — spending by tag (bank + Revolut)
router.get('/:id/analytics', (req, res) => {
  const db = getDb();
  const id = req.params.id;

  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(id);
  if (!tag) return res.status(404).json({ error: 'Tag not found' });

  try {
    const bankSummary = db.prepare(
      `SELECT
       COUNT(t.id) AS txCount,
       SUM(CASE
             WHEN COALESCE(c.type, 'expense') = 'expense' AND t.direction = 'D' THEN ABS(t.amount)
             WHEN COALESCE(c.type, 'expense') = 'expense' AND t.direction = 'K' THEN -ABS(t.amount)
             ELSE 0
           END) AS totalSpending,
       SUM(CASE
             WHEN COALESCE(c.type, 'expense') = 'income' AND t.direction = 'K' THEN ABS(t.amount)
             WHEN COALESCE(c.type, 'expense') = 'income' AND t.direction = 'D' THEN -ABS(t.amount)
             ELSE 0
           END) AS totalIncome,
       MIN(t.date) AS firstDate,
       MAX(t.date) AS lastDate
     FROM transactions t
     JOIN transaction_tags tt ON tt.transaction_id = t.id
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE tt.tag_id = ?`
    ).get(id);

    const revSummary = db.prepare(
      `SELECT
       COUNT(r.id) AS txCount,
       SUM(CASE
             WHEN COALESCE(c.type, 'expense') = 'expense' AND r.effective_amount < 0 THEN ABS(r.effective_amount)
             WHEN COALESCE(c.type, 'expense') = 'expense' AND r.effective_amount > 0 THEN -r.effective_amount
             ELSE 0
           END) AS totalSpending,
       SUM(CASE
             WHEN COALESCE(c.type, 'expense') = 'income' AND r.effective_amount > 0 THEN r.effective_amount
             WHEN COALESCE(c.type, 'expense') = 'income' AND r.effective_amount < 0 THEN ABS(r.effective_amount)
             ELSE 0
           END) AS totalIncome,
       MIN(r.date) AS firstDate,
       MAX(r.date) AS lastDate
     FROM revolut_transactions r
     JOIN revolut_transaction_tags rt ON rt.revolut_transaction_id = r.id
     LEFT JOIN categories c ON c.id = r.category_id
     WHERE rt.tag_id = ? AND COALESCE(r.exclude_from_analytics, 0) = 0`
    ).get(id);

    const summary = {
      txCount:       (bankSummary?.txCount || 0) + (revSummary?.txCount || 0),
      totalSpending: (bankSummary?.totalSpending || 0) + (revSummary?.totalSpending || 0),
      totalIncome:   (bankSummary?.totalIncome || 0) + (revSummary?.totalIncome || 0),
      firstDate:     minDates(bankSummary?.firstDate, revSummary?.firstDate),
      lastDate:      maxDates(bankSummary?.lastDate, revSummary?.lastDate),
    };

    const byMonthBank = db.prepare(
      `SELECT
       strftime('%Y-%m', t.date) AS month,
       SUM(CASE
             WHEN COALESCE(c.type, 'expense') = 'expense' AND t.direction = 'D' THEN ABS(t.amount)
             WHEN COALESCE(c.type, 'expense') = 'expense' AND t.direction = 'K' THEN -ABS(t.amount)
             ELSE 0
           END) AS expenseNet,
       SUM(CASE
             WHEN COALESCE(c.type, 'expense') = 'income' AND t.direction = 'K' THEN ABS(t.amount)
             WHEN COALESCE(c.type, 'expense') = 'income' AND t.direction = 'D' THEN -ABS(t.amount)
             ELSE 0
           END) AS incomeNet,
       COUNT(*) AS count
     FROM transactions t
     JOIN transaction_tags tt ON tt.transaction_id = t.id
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE tt.tag_id = ?
     GROUP BY month
     ORDER BY month`
    ).all(id);

    const byMonthRev = db.prepare(
      `SELECT
       strftime('%Y-%m', r.date) AS month,
       SUM(CASE
             WHEN COALESCE(c.type, 'expense') = 'expense' AND r.effective_amount < 0 THEN ABS(r.effective_amount)
             WHEN COALESCE(c.type, 'expense') = 'expense' AND r.effective_amount > 0 THEN -r.effective_amount
             ELSE 0
           END) AS expenseNet,
       SUM(CASE
             WHEN COALESCE(c.type, 'expense') = 'income' AND r.effective_amount > 0 THEN r.effective_amount
             WHEN COALESCE(c.type, 'expense') = 'income' AND r.effective_amount < 0 THEN ABS(r.effective_amount)
             ELSE 0
           END) AS incomeNet,
       COUNT(*) AS count
     FROM revolut_transactions r
     JOIN revolut_transaction_tags rt ON rt.revolut_transaction_id = r.id
     LEFT JOIN categories c ON c.id = r.category_id
     WHERE rt.tag_id = ? AND COALESCE(r.exclude_from_analytics, 0) = 0
     GROUP BY month
     ORDER BY month`
    ).all(id);

    const byMonth = mergeByMonth(byMonthBank, byMonthRev);

    const byCategory = db.prepare(
      `SELECT
       COALESCE(c.id, 0) AS id,
       COALESCE(c.name, 'Uncategorized') AS name,
       COALESCE(c.icon, '📋') AS icon,
       COALESCE(c.color, '#94a3b8') AS color,
       c.type,
       COUNT(t.id) AS txCount,
       (CASE COALESCE(c.type, 'expense')
          WHEN 'income' THEN
            (SUM(CASE WHEN t.direction = 'K' THEN ABS(t.amount) ELSE 0 END) -
             SUM(CASE WHEN t.direction = 'D' THEN ABS(t.amount) ELSE 0 END))
          ELSE
            (SUM(CASE WHEN t.direction = 'D' THEN ABS(t.amount) ELSE 0 END) -
             SUM(CASE WHEN t.direction = 'K' THEN ABS(t.amount) ELSE 0 END))
        END) AS total,
        'bank' AS source
     FROM transactions t
     JOIN transaction_tags tt ON tt.transaction_id = t.id
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE tt.tag_id = ?
     GROUP BY COALESCE(c.id, 0)
     HAVING ABS(total) > 0.0001
     ORDER BY ABS(total) DESC`
    ).all(id);

    if (revSummary && (revSummary.totalSpending > 0.0001 || revSummary.totalIncome > 0.0001 || revSummary.txCount > 0)) {
      const netOut = Number(revSummary.totalSpending) || 0;
      const netIn = Number(revSummary.totalIncome) || 0;
      const total = netOut > 0.0001 || netIn > 0.0001 ? netOut + netIn : 0;
      byCategory.unshift({
        id: -9001,
        name: 'Revolut',
        icon: '💜',
        color: '#7c3aed',
        type: 'revolut',
        txCount: revSummary.txCount,
        total,
        source: 'revolut',
      });
    }

    const bankTx = db.prepare(
      `SELECT t.*,
         c.name AS category_name,
         c.icon AS category_icon,
         c.color AS category_color,
         'bank' AS source
       FROM transactions t
       JOIN transaction_tags tt ON tt.transaction_id = t.id
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE tt.tag_id = ?
       ORDER BY t.date DESC, t.id DESC`
    ).all(id);

    const revTx = db.prepare(
      `SELECT
         r.id,
         r.date,
         NULL AS beneficiary,
         r.description AS merchant,
         NULL AS merchant_normal,
         r.description AS details,
         r.amount AS amount,
         r.effective_amount AS effective_amount,
         r.split_ratio AS split_ratio,
         r.applies_shared_split AS applies_shared_split,
         r.exclude_from_analytics AS exclude_from_analytics,
         r.currency AS currency,
         CASE WHEN r.amount >= 0 THEN 'K' ELSE 'D' END AS direction,
         NULL AS transfer_ref,
         r.revolut_type AS transaction_type,
         r.category_id AS category_id,
         r.notes AS notes,
         r.product,
         c.name AS category_name,
         c.icon AS category_icon,
         c.color AS category_color,
         'revolut' AS source
       FROM revolut_transactions r
       LEFT JOIN categories c ON c.id = r.category_id
       JOIN revolut_transaction_tags rt ON rt.revolut_transaction_id = r.id
       WHERE rt.tag_id = ?
       ORDER BY r.date DESC, r.id DESC`
    ).all(id);

    const merged = [...bankTx.map((row) => ({ ...row })), ...revTx.map((row) => ({ ...row }))];

    merged.sort((a, b) => {
      const d = (b.date || '').localeCompare(a.date || '');
      if (d !== 0) return d;
      return (b.source === a.source ? b.id - a.id : a.source.localeCompare(b.source));
    });

    res.json({ tag, summary, byMonth, byCategory, transactions: merged });
  } catch (err) {
    logger.error('[tags/:id/analytics]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
