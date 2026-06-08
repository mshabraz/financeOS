const express = require('express');
const multer  = require('multer');
const { previewImport, commitImport } = require('../services/importer');
const { reenterUserContext } = require('../middleware/userContext');
const logger = require('../services/logger');

const router = express.Router();

// Store file in memory (no disk write for preview)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are accepted'));
    }
  },
});

// POST /api/import/preview  — parse & check duplicates, no DB write
router.post('/preview', upload.single('file'), reenterUserContext, (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const result = previewImport(req.file.buffer, req.file.originalname);
    res.json(result);
  } catch (err) {
    logger.error('[Route /import/preview]', err);
    if (err.code === 'REVOLUT_USE_DEDICATED') {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/import/commit  — actually write new transactions to DB
router.post('/commit', upload.single('file'), reenterUserContext, (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const result = commitImport(req.file.buffer, req.file.originalname);
    res.json(result);
  } catch (err) {
    logger.error('[Route /import/commit]', err);
    if (err.code === 'REVOLUT_USE_DEDICATED') {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/import/sessions  — import history
router.get('/sessions', (req, res) => {
  const { getDb } = require('../db/database');
  const db = getDb();
  const sessions = db.prepare(
    'SELECT * FROM import_sessions ORDER BY created_at DESC LIMIT 50'
  ).all();
  res.json(sessions);
});

module.exports = router;
