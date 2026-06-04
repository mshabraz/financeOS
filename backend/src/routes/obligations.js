const express = require('express');
const repo = require('../services/obligations/repository');
const { listDueReminders, markReminderFired } = require('../services/obligations/reminders');
const { getDb } = require('../db/database');
const { OBLIGATION_KINDS, DIRECTIONS, DEFAULT_REMINDER_DAYS } = require('../services/obligations/constants');
const logger = require('../services/logger');

const router = express.Router();

router.get('/meta', (_req, res) => {
  res.json({
    obligationKinds: OBLIGATION_KINDS,
    directions: DIRECTIONS,
    defaultReminderDays: DEFAULT_REMINDER_DAYS,
  });
});

router.get('/summary', (_req, res) => {
  try {
    res.json(repo.summary());
  } catch (err) {
    logger.error('[obligations/summary]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/reminders', (req, res) => {
  try {
    const db = getDb();
    const includeLogged = req.query.includeLogged === '1';
    const reminders = listDueReminders(db, { includeLogged });
    res.json({ reminders });
  } catch (err) {
    logger.error('[obligations/reminders]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/reminders/:obligationId/ack', (req, res) => {
  try {
    const db = getDb();
    const { reminderKey } = req.body || {};
    if (!reminderKey) return res.status(400).json({ error: 'reminderKey required' });
    markReminderFired(db, Number(req.params.obligationId), reminderKey);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/calendar', (req, res) => {
  try {
    res.json(repo.calendar({ from: req.query.from, to: req.query.to }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', (req, res) => {
  try {
    res.json(repo.list({
      filter: req.query.filter,
      direction: req.query.direction,
      from: req.query.from,
      to: req.query.to,
      q: req.query.q,
    }));
  } catch (err) {
    logger.error('[obligations/list]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const row = repo.getById(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const row = repo.create(req.body || {});
    res.status(201).json(row);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', (req, res) => {
  try {
    const row = repo.update(Number(req.params.id), req.body || {});
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/settle', (req, res) => {
  try {
    const row = repo.recordSettlement(Number(req.params.id), req.body || {});
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/mark-paid', (req, res) => {
  try {
    const row = repo.markPaid(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/snooze', (req, res) => {
  try {
    const { until } = req.body || {};
    if (!until) return res.status(400).json({ error: 'until (YYYY-MM-DD) required' });
    const row = repo.snooze(Number(req.params.id), until);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/cancel', (req, res) => {
  try {
    const row = repo.cancel(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    repo.remove(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
