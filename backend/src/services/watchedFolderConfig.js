/**
 * Watched-folder auto-import settings (app_settings key-value store).
 */

const { getDb } = require('../db/database');
const path = require('path');
const fs = require('fs');

const KEYS = {
  enabled: 'watched_folder_enabled',
  folderPath: 'watched_folder_path',
  intervalSec: 'watched_scan_interval_sec',
  useFsWatch: 'watched_use_fs_watch',
};

const DEFAULTS = {
  enabled: false,
  folderPath: '',
  intervalSec: 60,
  useFsWatch: true,
};

function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row?.value ?? null;
}

function setSetting(db, key, value) {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, String(value));
}

function getWatchedFolderConfig(db = getDb()) {
  const enabled = getSetting(db, KEYS.enabled) === 'true';
  const folderPath = getSetting(db, KEYS.folderPath) || '';
  const intervalSec = Math.max(
    15,
    Math.min(3600, parseInt(getSetting(db, KEYS.intervalSec) || String(DEFAULTS.intervalSec), 10) || 60)
  );
  const useFsWatch = getSetting(db, KEYS.useFsWatch) !== 'false';

  let folderExists = false;
  let folderReadable = false;
  if (folderPath) {
    try {
      const resolved = path.resolve(folderPath);
      folderExists = fs.existsSync(resolved);
      folderReadable = folderExists && fs.statSync(resolved).isDirectory();
    } catch {
      folderExists = false;
    }
  }

  return {
    enabled,
    folderPath,
    intervalSec,
    intervalMs: intervalSec * 1000,
    useFsWatch,
    folderExists,
    folderReadable,
    supportedExtensions: ['.csv'],
    supportedKinds: ['bank', 'revolut', 'investment'],
  };
}

function updateWatchedFolderConfig(patch, db = getDb()) {
  if (patch.enabled != null) setSetting(db, KEYS.enabled, patch.enabled ? 'true' : 'false');
  if (patch.folderPath != null) {
    const trimmed = String(patch.folderPath).trim();
    setSetting(db, KEYS.folderPath, trimmed ? path.resolve(trimmed) : '');
  }
  if (patch.intervalSec != null) {
    const sec = Math.max(15, Math.min(3600, parseInt(patch.intervalSec, 10) || 60));
    setSetting(db, KEYS.intervalSec, String(sec));
  }
  if (patch.useFsWatch != null) setSetting(db, KEYS.useFsWatch, patch.useFsWatch ? 'true' : 'false');
  return getWatchedFolderConfig(db);
}

module.exports = {
  KEYS,
  getWatchedFolderConfig,
  updateWatchedFolderConfig,
};
