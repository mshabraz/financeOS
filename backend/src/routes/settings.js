const express = require('express');
const { getDb } = require('../db/database');
const {
  getRevolutExpenseSplitRatio,
  backfillRevolutAmounts,
} = require('../services/revolutCalculations');
const logger = require('../services/logger');

const router = express.Router();

function setAppSetting(db, key, value) {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, String(value));
}

// GET /api/settings/revolut-split
router.get('/revolut-split', (_req, res) => {
  const db = getDb();
  res.json({ ratio: getRevolutExpenseSplitRatio(db) });
});

// PUT /api/settings/revolut-split  body: { ratio: 0.5 }
router.put('/revolut-split', (req, res) => {
  try {
    const ratio = Number(req.body?.ratio);
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1) {
      return res.status(400).json({ error: 'ratio must be a number between 0 and 1 (exclusive of 0)' });
    }
    const db = getDb();
    setAppSetting(db, 'revolut_expense_split_ratio', ratio);
    const updated = backfillRevolutAmounts(db);
    res.json({ ok: true, ratio, rowsUpdated: updated });
  } catch (err) {
    logger.error('[PUT /settings/revolut-split]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
