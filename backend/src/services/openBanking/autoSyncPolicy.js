/**
 * Debounce automatic open-banking sync (login / session restore) so rapid triggers
 * do not hammer Enable Banking or duplicate work with manual sync.
 */

const MIN_INTERVAL_MS = 3 * 60 * 1000;

const lastByUser = new Map();

function getAutoSyncEnabled(db) {
  try {
    const row = db.prepare(
      'SELECT value FROM app_settings WHERE key = ?',
    ).get('open_banking_auto_sync_on_login');
    return row?.value !== 'false';
  } catch {
    return true;
  }
}

function getLastAutoSyncAt(db) {
  try {
    const row = db.prepare(
      'SELECT value FROM app_settings WHERE key = ?',
    ).get('open_banking_auto_sync_last_at');
    const n = parseInt(row?.value, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function recordAutoSyncRun(userId, db) {
  const now = Date.now();
  lastByUser.set(userId, now);
  try {
    db.prepare(
      `INSERT INTO app_settings (key, value) VALUES ('open_banking_auto_sync_last_at', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(String(now));
  } catch {
    /* app_settings may not exist in tests */
  }
}

function shouldRunAutoSync(db, userId) {
  if (!getAutoSyncEnabled(db)) return false;
  const now = Date.now();
  const last = Math.max(lastByUser.get(userId) || 0, getLastAutoSyncAt(db));
  return now - last >= MIN_INTERVAL_MS;
}

module.exports = {
  MIN_INTERVAL_MS,
  getAutoSyncEnabled,
  shouldRunAutoSync,
  recordAutoSyncRun,
};
