/**
 * Revolut statement import + listing (isolated from main bank transactions).
 */

const express = require('express');
const multer = require('multer');
const { getDb } = require('../db/database');
const logger = require('../services/logger');
const { previewRevolutImport, commitRevolutImport } = require('../services/revolutImporter');
const { reenterUserContext } = require('../middleware/userContext');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are accepted'));
    }
  },
});

// GET /api/revolut/transactions — deprecated; use GET /api/transactions?source=revolut
router.get('/transactions', (req, res) => {
  res.set('X-FinanceOS-Deprecated', 'Use GET /api/transactions with source=revolut');
  try {
    const db = getDb();
    const {
      page = 1,
      limit = 50,
      search = '',
      type = '',
      dateFrom = '',
      dateTo = '',
      tag = '',
      hasNotes = '',
      sortBy = 'date',
      sortDir = 'DESC',
    } = req.query;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const conditions = [];
    const params = [];

    if (search) {
      conditions.push(
        `(r.description LIKE ? OR r.revolut_type LIKE ? OR r.product LIKE ? OR IFNULL(r.notes,'') LIKE ?)`
      );
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (type) {
      conditions.push('r.revolut_type = ?');
      params.push(type);
    }
    if (dateFrom) {
      conditions.push('r.date >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push('r.date <= ?');
      params.push(dateTo);
    }
    if (tag) {
      conditions.push(
        'EXISTS (SELECT 1 FROM revolut_transaction_tags rtt WHERE rtt.revolut_transaction_id = r.id AND rtt.tag_id = ?)'
      );
      params.push(parseInt(tag, 10));
    }
    if (hasNotes === '1' || hasNotes === 'true') {
      conditions.push("(r.notes IS NOT NULL AND TRIM(r.notes) != '')");
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const allowedSort = ['date', 'amount', 'description', 'revolut_type'];
    const col = allowedSort.includes(sortBy) ? `r.${sortBy}` : 'r.date';
    const dir = String(sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const countRow = db.prepare(`SELECT COUNT(*) AS total FROM revolut_transactions r ${where}`).get(...params);

    const rows = db.prepare(
      `SELECT r.* FROM revolut_transactions r
       ${where}
       ORDER BY ${col} ${dir}, r.id DESC
       LIMIT ? OFFSET ?`
    ).all(...params, parseInt(limit, 10), offset);

    const tagStmt = db.prepare(
      `SELECT tg.* FROM tags tg
       JOIN revolut_transaction_tags rtt ON rtt.tag_id = tg.id
       WHERE rtt.revolut_transaction_id = ?
       ORDER BY tg.name`
    );
    const rowsWithTags = rows.map((r) => ({ ...r, tags: tagStmt.all(r.id) }));

    res.json({
      data: rowsWithTags,
      total: countRow.total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(countRow.total / parseInt(limit, 10)),
    });
  } catch (err) {
    logger.error('[GET /revolut/transactions]', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/revolut/transactions/:id — user note only
router.patch('/transactions/:id', (req, res) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id, 10);
    const { notes } = req.body;
    if (notes === undefined) return res.status(400).json({ error: 'notes required (string or null)' });

    const row = db.prepare('SELECT id FROM revolut_transactions WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Not found' });

    db.prepare('UPDATE revolut_transactions SET notes = ? WHERE id = ?').run(
      notes === null || notes === '' ? null : String(notes),
      id
    );
    const updated = db.prepare('SELECT * FROM revolut_transactions WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    logger.error('[PATCH /revolut/transactions/:id]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/revolut/export/csv
router.get('/export/csv', (_req, res) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT date, completed_datetime, revolut_type, product, description, amount, fee, currency,
            COALESCE(notes,'') AS user_note
     FROM revolut_transactions
     ORDER BY date DESC, id DESC`
  ).all();
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const header = 'Date,Completed At,Type,Product,Description,Amount,Fee,Currency,User Note';
  const lines = rows.map((r) =>
    [
      r.date,
      r.completed_datetime ?? '',
      r.revolut_type ?? '',
      esc(r.product ?? ''),
      esc(r.description ?? ''),
      r.amount,
      r.fee ?? 0,
      r.currency,
      esc(r.user_note),
    ].join(',')
  );
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="revolut-transactions.csv"');
  res.send([header, ...lines].join('\n'));
});

// GET /api/revolut/types — distinct Type values for filters
router.get('/types', (_req, res) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT DISTINCT revolut_type AS type FROM revolut_transactions
     WHERE revolut_type IS NOT NULL AND TRIM(revolut_type) != ''
     ORDER BY revolut_type`
  ).all();
  res.json(rows.map((r) => r.type));
});

// POST /api/revolut/import/preview
router.post('/import/preview', upload.single('file'), reenterUserContext, (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = previewRevolutImport(req.file.buffer, req.file.originalname);
    res.json(result);
  } catch (err) {
    logger.error('[revolut import/preview]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/revolut/import/commit
router.post('/import/commit', upload.single('file'), reenterUserContext, (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = commitRevolutImport(req.file.buffer, req.file.originalname);
    res.json(result);
  } catch (err) {
    logger.error('[revolut import/commit]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/revolut/import/sessions
router.get('/import/sessions', (_req, res) => {
  const db = getDb();
  const sessions = db.prepare(
    'SELECT * FROM revolut_import_sessions ORDER BY created_at DESC LIMIT 50'
  ).all();
  res.json(sessions);
});

module.exports = router;
