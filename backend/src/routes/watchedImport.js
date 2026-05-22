/**
 * Watched-folder auto-import configuration, history, and manual scan trigger.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const {
  getWatchedFolderConfig,
  updateWatchedFolderConfig,
} = require('../services/watchedFolderConfig');
const {
  runScan,
  reschedule,
  getNotifications,
  getImportHistory,
  getWatcherStatus,
} = require('../services/watchedFolderImport');
const logger = require('../services/logger');

const router = express.Router();

router.get('/config', (req, res) => {
  res.json({
    ...getWatchedFolderConfig(),
    status: getWatcherStatus(),
  });
});

router.put('/config', (req, res) => {
  try {
    const { enabled, folderPath, intervalSec, useFsWatch } = req.body;
    const config = updateWatchedFolderConfig({
      enabled,
      folderPath,
      intervalSec,
      useFsWatch,
    });
    reschedule();
    res.json({
      ...config,
      status: getWatcherStatus(),
    });
  } catch (err) {
    logger.error('[watched-import/config]', err);
    res.status(400).json({ error: err.message });
  }
});

router.post('/validate-path', (req, res) => {
  const raw = req.body?.folderPath ?? req.body?.path ?? '';
  const trimmed = String(raw).trim();
  if (!trimmed) {
    return res.json({ valid: false, error: 'Path is empty' });
  }
  try {
    const resolved = path.resolve(trimmed);
    if (!fs.existsSync(resolved)) {
      return res.json({ valid: false, resolved, error: 'Folder does not exist' });
    }
    if (!fs.statSync(resolved).isDirectory()) {
      return res.json({ valid: false, resolved, error: 'Path is not a directory' });
    }
    const csvCount = fs.readdirSync(resolved).filter((f) => /\.csv$/i.test(f)).length;
    res.json({ valid: true, resolved, csvCount });
  } catch (err) {
    res.json({ valid: false, error: err.message });
  }
});

router.get('/history', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  res.json(getImportHistory(undefined, limit));
});

router.get('/notifications', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
  res.json(getNotifications(limit));
});

router.get('/status', (req, res) => {
  res.json(getWatcherStatus());
});

router.post('/scan-now', async (req, res) => {
  try {
    const summary = await runScan('manual');
    res.json({ ok: true, summary });
  } catch (err) {
    logger.error('[watched-import/scan-now]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
