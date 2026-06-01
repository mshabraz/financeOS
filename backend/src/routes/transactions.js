const express = require('express');
const { getDb } = require('../db/database');
const logger = require('../services/logger');
const { listUnifiedTransactions, UNIFIED_LEDGER_SQL } = require('../services/unifiedLedger');

const router = express.Router();

function parseTxnRouteId(param) {
  const s = String(param);
  if (s.startsWith('r')) {
    return { source: 'revolut', revolutId: parseInt(s.slice(1), 10) };
  }
  return { source: 'bank', bankId: parseInt(s, 10) };
}

function splitTxnIds(ids = []) {
  const bankIds = [];
  const revolutIds = [];
  for (const raw of ids) {
    const s = String(raw);
    if (s.startsWith('r')) {
      const n = parseInt(s.slice(1), 10);
      if (!Number.isNaN(n)) revolutIds.push(n);
    } else {
      const n = parseInt(s, 10);
      if (!Number.isNaN(n)) bankIds.push(n);
    }
  }
  return { bankIds, revolutIds };
}

router.get('/', (req, res) => {
  try {
    const result = listUnifiedTransactions({
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      category: req.query.category,
      direction: req.query.direction,
      source: req.query.source,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      tag: req.query.tag,
      hasNotes: req.query.hasNotes,
      sortBy: req.query.sortBy,
      sortDir: req.query.sortDir,
    });
    res.json(result);
  } catch (err) {
    logger.error('[GET /transactions]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/export/csv', (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT u.date, u.source, u.merchant, u.amount, u.effective_amount, u.split_ratio,
            u.applies_shared_split, u.exclude_from_analytics, u.currency, u.direction,
            c.name AS category, u.notes, u.transfer_ref, u.details, u.revolut_type
     FROM (${UNIFIED_LEDGER_SQL}) u
     LEFT JOIN categories c ON c.id = u.category_id
     ORDER BY u.date DESC`
  ).all();

  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const header = 'Date,Source,Merchant,Original Amount,Analytics Amount,Split Ratio,Shared Split,Excluded From Analytics,Currency,Direction,Category,User note,Reference,Details,Revolut Type';
  const lines = rows.map((r) =>
    [
      r.date,
      r.source,
      esc(r.merchant),
      r.amount,
      r.effective_amount,
      r.split_ratio ?? '',
      r.applies_shared_split ? 'yes' : 'no',
      r.exclude_from_analytics ? 'yes' : 'no',
      r.currency,
      r.direction,
      esc(r.category),
      esc(r.notes),
      r.transfer_ref || '',
      esc(r.details),
      r.revolut_type || '',
    ].join(',')
  );

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
  res.send([header, ...lines].join('\n'));
});

router.patch('/bulk', (req, res) => {
  try {
    const db = getDb();
    const { ids, categoryId } = req.body;
    if (!ids?.length || !categoryId) return res.status(400).json({ error: 'ids[] and categoryId required' });

    const { bankIds, revolutIds } = splitTxnIds(ids);
    const cat = parseInt(categoryId, 10);

    const updateBank = db.prepare(
      `UPDATE transactions SET category_id = ?, category_source = 'manual', updated_at = datetime('now') WHERE id = ?`
    );
    const updateRev = db.prepare(
      `UPDATE revolut_transactions SET category_id = ?, category_source = 'manual' WHERE id = ?`
    );
    const doUpdate = db.transaction(() => {
      for (const id of bankIds) updateBank.run(cat, id);
      for (const id of revolutIds) updateRev.run(cat, id);
    });
    doUpdate();
    res.json({ ok: true, updated: bankIds.length + revolutIds.length });
  } catch (err) {
    logger.error('[PATCH /transactions/bulk]', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/transactions/bulk — permanently remove bank and/or Revolut rows (tag links cascade)
router.delete('/bulk', (req, res) => {
  try {
    const db = getDb();
    const { ids } = req.body;
    if (!ids?.length) return res.status(400).json({ error: 'ids[] required' });

    const { bankIds, revolutIds } = splitTxnIds(ids);
    if (!bankIds.length && !revolutIds.length) {
      return res.status(400).json({ error: 'No valid transaction ids' });
    }

    const deleteBank = db.prepare('DELETE FROM transactions WHERE id = ?');
    const deleteRev = db.prepare('DELETE FROM revolut_transactions WHERE id = ?');
    const doDelete = db.transaction(() => {
      for (const id of bankIds) deleteBank.run(id);
      for (const id of revolutIds) deleteRev.run(id);
    });
    doDelete();

    res.json({ ok: true, deleted: bankIds.length + revolutIds.length });
  } catch (err) {
    logger.error('[DELETE /transactions/bulk]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const parsed = parseTxnRouteId(req.params.id);

  if (parsed.source === 'revolut') {
    const tx = db.prepare(
      `SELECT r.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
       FROM revolut_transactions r
       LEFT JOIN categories c ON c.id = r.category_id
       WHERE r.id = ?`
    ).get(parsed.revolutId);
    if (!tx) return res.status(404).json({ error: 'Not found' });
    const tags = db.prepare(
      `SELECT tg.* FROM tags tg
       JOIN revolut_transaction_tags rt ON rt.tag_id = tg.id
       WHERE rt.revolut_transaction_id = ?`
    ).all(parsed.revolutId);
    return res.json({
      source: 'revolut',
      id: `r${tx.id}`,
      revolut_id: tx.id,
      date: tx.date,
      amount: tx.amount,
      effective_amount: tx.effective_amount,
      split_ratio: tx.split_ratio,
      applies_shared_split: tx.applies_shared_split,
      exclude_from_analytics: tx.exclude_from_analytics,
      direction: tx.amount >= 0 ? 'K' : 'D',
      merchant: tx.description,
      description: tx.description,
      details: tx.description,
      currency: tx.currency,
      revolut_type: tx.revolut_type,
      product: tx.product,
      notes: tx.notes,
      category_id: tx.category_id,
      category_name: tx.category_name,
      category_icon: tx.category_icon,
      category_color: tx.category_color,
      category_source: tx.category_source,
      tags,
    });
  }

  const tx = db.prepare(
    `SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color
     FROM transactions t LEFT JOIN categories c ON c.id = t.category_id WHERE t.id = ?`
  ).get(parsed.bankId);
  if (!tx) return res.status(404).json({ error: 'Not found' });

  const tags = db.prepare(
    `SELECT tg.* FROM tags tg JOIN transaction_tags tt ON tt.tag_id = tg.id WHERE tt.transaction_id = ?`
  ).all(parsed.bankId);

  res.json({
    ...tx,
    source: 'bank',
    effective_amount: tx.amount,
    split_ratio: null,
    applies_shared_split: 0,
    exclude_from_analytics: 0,
    tags,
  });
});

router.patch('/:id', (req, res) => {
  try {
    const db = getDb();
    const { categoryId, notes } = req.body;
    const parsed = parseTxnRouteId(req.params.id);

    if (parsed.source === 'revolut') {
      const tx = db.prepare('SELECT * FROM revolut_transactions WHERE id = ?').get(parsed.revolutId);
      if (!tx) return res.status(404).json({ error: 'Not found' });

      const updates = [];
      const vals = [];
      if (categoryId !== undefined) {
        updates.push('category_id = ?', 'category_source = ?');
        vals.push(parseInt(categoryId, 10), 'manual');
      }
      if (notes !== undefined) {
        updates.push('notes = ?');
        vals.push(notes);
      }
      if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

      vals.push(parsed.revolutId);
      db.prepare(`UPDATE revolut_transactions SET ${updates.join(', ')} WHERE id = ?`).run(...vals);

      const updated = db.prepare(
        `SELECT r.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
         FROM revolut_transactions r
         LEFT JOIN categories c ON c.id = r.category_id
         WHERE r.id = ?`
      ).get(parsed.revolutId);
      return res.json({ source: 'revolut', id: `r${updated.id}`, ...updated });
    }

    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(parsed.bankId);
    if (!tx) return res.status(404).json({ error: 'Not found' });

    const updates = [];
    const vals = [];
    if (categoryId !== undefined) {
      updates.push('category_id = ?', 'category_source = ?');
      vals.push(parseInt(categoryId), 'manual');
    }
    if (notes !== undefined) { updates.push('notes = ?'); vals.push(notes); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

    updates.push("updated_at = datetime('now')");
    vals.push(parsed.bankId);
    db.prepare(`UPDATE transactions SET ${updates.join(', ')} WHERE id = ?`).run(...vals);

    const updated = db.prepare(
      `SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id WHERE t.id = ?`
    ).get(parsed.bankId);
    res.json({ ...updated, source: 'bank', effective_amount: updated.amount });
  } catch (err) {
    logger.error('[PATCH /transactions]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/bulk-categorize/preview', (req, res) => {
  const db = getDb();
  const { merchant, exactOnly = false } = req.body;
  if (!merchant) return res.status(400).json({ error: 'merchant required' });

  const bankRows = exactOnly
    ? db.prepare(
        `SELECT t.id, t.date, t.merchant, t.amount, t.direction, c.name AS category_name, 'bank' AS source
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.merchant = ? ORDER BY t.date DESC LIMIT 100`
      ).all(merchant)
    : db.prepare(
        `SELECT t.id, t.date, t.merchant, t.amount, t.direction, c.name AS category_name, 'bank' AS source
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.merchant LIKE ? OR t.merchant LIKE ?
         ORDER BY t.date DESC LIMIT 100`
      ).all(`${merchant.split(' ')[0]}%`, `%${merchant}%`);

  const revRows = exactOnly
    ? db.prepare(
        `SELECT r.id, r.date, r.description AS merchant, r.amount,
                CASE WHEN r.amount >= 0 THEN 'K' ELSE 'D' END AS direction,
                c.name AS category_name, 'revolut' AS source
         FROM revolut_transactions r
         LEFT JOIN categories c ON c.id = r.category_id
         WHERE r.description = ? ORDER BY r.date DESC LIMIT 100`
      ).all(merchant)
    : db.prepare(
        `SELECT r.id, r.date, r.description AS merchant, r.amount,
                CASE WHEN r.amount >= 0 THEN 'K' ELSE 'D' END AS direction,
                c.name AS category_name, 'revolut' AS source
         FROM revolut_transactions r
         LEFT JOIN categories c ON c.id = r.category_id
         WHERE r.description LIKE ? OR r.description LIKE ?
         ORDER BY r.date DESC LIMIT 100`
      ).all(`${merchant.split(' ')[0]}%`, `%${merchant}%`);

  const merged = [
    ...bankRows.map((r) => ({ ...r, id: String(r.id) })),
    ...revRows.map((r) => ({ ...r, id: `r${r.id}` })),
  ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const seen = new Set();
  const unique = merged.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  res.json({ count: unique.length, examples: unique.slice(0, 5), transactions: unique });
});

router.post('/bulk-categorize/apply', (req, res) => {
  try {
    const db = getDb();
    const { transactionIds, categoryId } = req.body;
    if (!transactionIds?.length || !categoryId) {
      return res.status(400).json({ error: 'transactionIds[] and categoryId required' });
    }

    const { bankIds, revolutIds } = splitTxnIds(transactionIds);
    const cat = parseInt(categoryId, 10);

    const updateBank = db.prepare(
      `UPDATE transactions SET category_id = ?, category_source = 'manual', updated_at = datetime('now') WHERE id = ?`
    );
    const updateRev = db.prepare(
      `UPDATE revolut_transactions SET category_id = ?, category_source = 'manual' WHERE id = ?`
    );
    const doUpdate = db.transaction(() => {
      for (const id of bankIds) updateBank.run(cat, id);
      for (const id of revolutIds) updateRev.run(cat, id);
    });
    doUpdate();

    res.json({ ok: true, updated: bankIds.length + revolutIds.length });
  } catch (err) {
    logger.error('[bulk-categorize/apply]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
