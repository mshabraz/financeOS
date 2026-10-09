/**
 * Allocation strategy routes — configurable targets & buy-only rebalancing.
 */
const express = require('express');
const { getDb } = require('../db/database');
const logger = require('../services/logger');
const {
  listStrategies,
  loadStrategyBundle,
  createStrategy,
  updateStrategy,
  deleteStrategy,
  replaceCategories,
  replaceTargets,
  replaceMappings,
  listHoldingsForMapping,
  computeActiveAllocation,
  suggestFromAssetClasses,
} = require('../services/portfolioAllocationStrategy');

const router = express.Router();

router.get('/strategies', (req, res) => {
  try {
    res.json(listStrategies(getDb()));
  } catch (err) {
    logger.error('[allocation/strategies]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/strategies/:id', (req, res) => {
  try {
    const bundle = loadStrategyBundle(getDb(), Number(req.params.id));
    if (!bundle) return res.status(404).json({ error: 'Strategy not found' });
    res.json(bundle);
  } catch (err) {
    logger.error('[allocation/strategy]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/strategies', (req, res) => {
  try {
    const bundle = createStrategy(getDb(), req.body || {});
    res.status(201).json(bundle);
  } catch (err) {
    logger.error('[allocation/create]', err);
    res.status(400).json({ error: err.message });
  }
});

router.put('/strategies/:id', (req, res) => {
  try {
    const bundle = updateStrategy(getDb(), Number(req.params.id), req.body || {});
    if (!bundle) return res.status(404).json({ error: 'Strategy not found' });
    res.json(bundle);
  } catch (err) {
    logger.error('[allocation/update]', err);
    res.status(400).json({ error: err.message });
  }
});

router.delete('/strategies/:id', (req, res) => {
  try {
    const ok = deleteStrategy(getDb(), Number(req.params.id));
    if (!ok) return res.status(404).json({ error: 'Strategy not found' });
    res.json({ ok: true });
  } catch (err) {
    logger.error('[allocation/delete]', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/strategies/:id/categories', (req, res) => {
  try {
    const categories = Array.isArray(req.body) ? req.body : req.body?.categories;
    const bundle = replaceCategories(getDb(), Number(req.params.id), categories || []);
    res.json(bundle);
  } catch (err) {
    logger.error('[allocation/categories]', err);
    res.status(400).json({ error: err.message });
  }
});

router.put('/strategies/:id/targets', (req, res) => {
  try {
    const targets = Array.isArray(req.body) ? req.body : req.body?.targets;
    const bundle = replaceTargets(getDb(), Number(req.params.id), targets || []);
    res.json(bundle);
  } catch (err) {
    logger.error('[allocation/targets]', err);
    res.status(400).json({ error: err.message });
  }
});

router.put('/strategies/:id/mappings', (req, res) => {
  try {
    const mappings = Array.isArray(req.body) ? req.body : req.body?.mappings;
    const bundle = replaceMappings(getDb(), Number(req.params.id), mappings || []);
    res.json(bundle);
  } catch (err) {
    logger.error('[allocation/mappings]', err);
    res.status(400).json({ error: err.message });
  }
});

router.get('/active/compute', async (req, res) => {
  try {
    const data = await computeActiveAllocation(getDb(), {
      contribution: req.query.contribution,
      broker: req.query.broker || '',
    });
    res.json(data);
  } catch (err) {
    logger.error('[allocation/compute]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/holdings-for-mapping', async (req, res) => {
  try {
    const data = await listHoldingsForMapping(getDb(), req.query.broker || '');
    res.json(data);
  } catch (err) {
    logger.error('[allocation/holdings]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/strategies/:id/suggest', async (req, res) => {
  try {
    const suggestion = await suggestFromAssetClasses(
      getDb(),
      Number(req.params.id),
      req.query.broker || ''
    );
    res.json(suggestion);
  } catch (err) {
    logger.error('[allocation/suggest]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
