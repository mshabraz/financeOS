const express = require('express');
const { getDb } = require('../db/database');
const logger = require('../services/logger');
const {
  buildGoalProgress,
  getActiveGoal,
  listGoals,
  createGoalAndProgress,
  updateGoal,
  deleteGoal,
  serializeGoal,
} = require('../services/wealthGoalTracking');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const status = req.query.status || (req.query.all === '1' ? undefined : 'active');
    const rows = listGoals(db, { status });
    res.json(rows.map(serializeGoal));
  } catch (err) {
    logger.error('[wealth-goals/list]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/active', async (req, res) => {
  try {
    const db = getDb();
    const goal = getActiveGoal(db);
    if (!goal) return res.json({ goal: null, progress: null });
    const progress = await buildGoalProgress(db, goal);
    res.json(progress);
  } catch (err) {
    logger.error('[wealth-goals/active]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/progress', async (req, res) => {
  try {
    const db = getDb();
    const goal = db.prepare('SELECT * FROM wealth_goals WHERE id = ?').get(req.params.id);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    const progress = await buildGoalProgress(db, goal);
    res.json(progress);
  } catch (err) {
    logger.error('[wealth-goals/progress]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const progress = await createGoalAndProgress(db, req.body || {});
    res.status(201).json(progress);
  } catch (err) {
    logger.error('[wealth-goals/create]', err);
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const db = getDb();
    const row = updateGoal(db, Number(req.params.id), req.body || {});
    if (!row) return res.status(404).json({ error: 'Goal not found' });
    const progress = await buildGoalProgress(db, row);
    res.json(progress);
  } catch (err) {
    logger.error('[wealth-goals/update]', err);
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    deleteGoal(db, Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    logger.error('[wealth-goals/delete]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
