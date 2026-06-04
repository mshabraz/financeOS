const express = require('express');
const repo = require('../services/tasks/repository');
const logger = require('../services/logger');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    if (req.query.grouped === '1') {
      return res.json(repo.grouped());
    }
    res.json(repo.list({
      includeCompleted: req.query.includeCompleted === '1',
      q: req.query.q,
    }));
  } catch (err) {
    logger.error('[tasks/list]', err);
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
    res.status(201).json(repo.create(req.body || {}));
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

router.post('/:id/complete', (req, res) => {
  try {
    const completed = req.body?.completed !== false;
    const row = repo.complete(Number(req.params.id), completed);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: err.message });
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
