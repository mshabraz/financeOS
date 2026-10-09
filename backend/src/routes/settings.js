const express = require('express');
const { getDb } = require('../db/database');
const {
  getRevolutExpenseSplitRatio,
  backfillRevolutAmounts,
} = require('../services/revolutCalculations');
const {
  getNetWorthDisplayCurrency,
  updateNetWorthDisplayCurrency,
} = require('../services/displayCurrencySettings');
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

// PUT /api/settings/revolut-split
// body: { ratio: 0.5, applyScope?: 'from_date'|'all', applyFromDate?: 'YYYY-MM-DD' }
router.put('/revolut-split', (req, res) => {
  try {
    const ratio = Number(req.body?.ratio);
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1) {
      return res.status(400).json({ error: 'ratio must be a number between 0 and 1 (exclusive of 0)' });
    }

    const applyScope = String(req.body?.applyScope || 'from_date').trim().toLowerCase();
    if (applyScope !== 'from_date' && applyScope !== 'all') {
      return res.status(400).json({ error: "applyScope must be 'from_date' or 'all'" });
    }

    let applyFromDate = null;
    if (applyScope === 'from_date') {
      const raw = String(req.body?.applyFromDate || '').trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return res.status(400).json({
          error: 'applyFromDate (YYYY-MM-DD) is required when applyScope is from_date',
        });
      }
      applyFromDate = raw;
    }

    const db = getDb();
    setAppSetting(db, 'revolut_expense_split_ratio', ratio);

    const result = applyScope === 'from_date'
      ? backfillRevolutAmounts(db, { ratio, dateFrom: applyFromDate })
      : backfillRevolutAmounts(db, { ratio });
    db.flushSync();

    res.json({
      ok: true,
      ratio,
      applyScope,
      applyFromDate,
      rowsUpdated: result.rowsUpdated,
    });
  } catch (err) {
    logger.error('[PUT /settings/revolut-split]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings/net-worth-currency
router.get('/net-worth-currency', (req, res) => {
  const db = getDb();
  res.json(getNetWorthDisplayCurrency(db));
});

// PUT /api/settings/net-worth-currency  body: { enabled?, currency? }
router.put('/net-worth-currency', (req, res) => {
  try {
    const db = getDb();
    const updated = updateNetWorthDisplayCurrency(db, {
      enabled: req.body?.enabled,
      currency: req.body?.currency,
    });
    db.flushSync();
    res.json({ ok: true, ...updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
