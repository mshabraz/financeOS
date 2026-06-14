const express = require('express');
const { getDb } = require('../db/database');
const logger = require('../services/logger');
const {
  scanDuplicateGroups,
  pairIgnoreKey,
  CONFIDENCE_LEVELS,
} = require('../services/duplicateDetection');
const {
  mergeIntoKeeper,
  restoreFromArchive,
  listRecentArchive,
} = require('../services/transactionArchive');

const router = express.Router();

function memberUnifiedId(member) {
  if (member == null) return null;
  if (typeof member === 'string' || typeof member === 'number') return String(member);
  return member.unified_id != null ? String(member.unified_id) : null;
}

function recordIgnoredPair(db, members, reason) {
  if (!members?.length || members.length < 2) return false;
  const a = memberUnifiedId(members[0]);
  const b = memberUnifiedId(members[1]);
  if (!a || !b) return false;
  const ignoreKey = pairIgnoreKey({ unified_id: a }, { unified_id: b });
  db.prepare(
    `INSERT OR IGNORE INTO duplicate_ignore_rules (key, reason) VALUES (?, ?)`,
  ).run(ignoreKey, reason);
  return true;
}

function getDuplicateSettings(db) {
  const keys = [
    'duplicate_min_confidence',
    'duplicate_skip_pending_zero',
    'duplicate_sync_overlap_days',
  ];
  const settings = {};
  for (const key of keys) {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
    settings[key] = row?.value ?? null;
  }
  return {
    minConfidence: settings.duplicate_min_confidence || 'medium',
    skipPendingZero: settings.duplicate_skip_pending_zero !== 'false',
    syncOverlapDays: parseInt(settings.duplicate_sync_overlap_days || '3', 10),
    confidenceLevels: CONFIDENCE_LEVELS,
  };
}

router.get('/settings', (req, res) => {
  try {
    const db = getDb();
    res.json(getDuplicateSettings(db));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/settings', (req, res) => {
  try {
    const db = getDb();
    const { minConfidence, skipPendingZero, syncOverlapDays } = req.body;
    const upsert = db.prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    );
    if (minConfidence && CONFIDENCE_LEVELS.includes(minConfidence)) {
      upsert.run('duplicate_min_confidence', minConfidence);
    }
    if (skipPendingZero != null) {
      upsert.run('duplicate_skip_pending_zero', skipPendingZero ? 'true' : 'false');
    }
    if (syncOverlapDays != null) {
      upsert.run('duplicate_sync_overlap_days', String(syncOverlapDays));
    }
    res.json(getDuplicateSettings(db));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/scan', (req, res) => {
  try {
    const db = getDb();
    const settings = getDuplicateSettings(db);
    const result = scanDuplicateGroups(db, {
      mode: req.query.mode || 'last30',
      minLevel: req.query.minConfidence || settings.minConfidence,
      search: req.query.search || '',
      merchant: req.query.merchant || '',
      amount: req.query.amount ? parseFloat(req.query.amount) : null,
      source: req.query.source || '',
    });
    res.json(result);
  } catch (err) {
    logger.error('[GET /duplicates/scan]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/resolve', (req, res) => {
  try {
    const db = getDb();
    const { action, keepId, removeIds, groupId, members } = req.body;

    if (action === 'keep_both') {
      recordIgnoredPair(db, members, 'User marked as not duplicate (keep both)');
      return res.json({ ok: true, action: 'keep_both', ignored: true });
    }

    if (action === 'ignore_pattern') {
      const ok = recordIgnoredPair(db, members, 'User ignored duplicate match');
      if (!ok) {
        return res.status(400).json({ error: 'Could not record ignore rule for this pair' });
      }
      return res.json({ ok: true, action: 'ignore_pattern', ignored: true });
    }

    if (action === 'delete' || action === 'merge') {
      if (!keepId || !removeIds?.length) {
        return res.status(400).json({ error: 'keepId and removeIds[] required' });
      }
      const result = mergeIntoKeeper(db, keepId, removeIds);
      return res.json({
        ok: true,
        action,
        groupId,
        removed: result.removed,
        restoreTokens: result.restoreTokens,
      });
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    logger.error('[POST /duplicates/resolve]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/bulk-resolve', (req, res) => {
  try {
    const db = getDb();
    const { items } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'items[] required' });

    let removed = 0;
    const restoreTokens = [];
    for (const item of items) {
      if (item.action !== 'delete' && item.action !== 'merge') continue;
      if (!item.keepId || !item.removeIds?.length) continue;
      const r = mergeIntoKeeper(db, item.keepId, item.removeIds);
      removed += r.removed;
      restoreTokens.push(...r.restoreTokens);
    }
    res.json({ ok: true, removed, restoreTokens });
  } catch (err) {
    logger.error('[POST /duplicates/bulk-resolve]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/archive', (req, res) => {
  try {
    const db = getDb();
    const rows = listRecentArchive(db, parseInt(req.query.limit || '50', 10));
    res.json({ items: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/restore', (req, res) => {
  try {
    const db = getDb();
    const { restoreTokens } = req.body;
    if (!restoreTokens?.length) return res.status(400).json({ error: 'restoreTokens[] required' });
    const result = restoreFromArchive(db, restoreTokens);
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error('[POST /duplicates/restore]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
