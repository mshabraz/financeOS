const { runWithUserId } = require('../../db/requestContext');
const { openUserDatabase } = require('../../db/database');
const { isEnabled } = require('./openBankingConfig');
const { syncConnections } = require('./bankSync');
const { shouldRunAutoSync, recordAutoSyncRun } = require('./autoSyncPolicy');
const logger = require('../logger');

/**
 * Fire-and-forget incremental sync after login/register (non-blocking for auth response).
 */
function triggerAutoSyncOnAuth(userId, req) {
  if (!isEnabled() || !userId) return;

  setImmediate(() => {
    runWithUserId(userId, async () => {
      try {
        const db = openUserDatabase(userId);
        const row = db.prepare('SELECT COUNT(*) AS n FROM bank_connections').get();
        if ((row?.n ?? 0) === 0) return;
        if (!shouldRunAutoSync(db, userId)) return;

        recordAutoSyncRun(userId, db);
        await syncConnections(db, {}, req);
        logger.info(`[OpenBanking] Auto-sync on auth completed for user ${userId}`);
      } catch (err) {
        logger.warn(`[OpenBanking] Auto-sync on auth failed: ${err.message}`);
      }
    }).catch((err) => {
      logger.warn(`[OpenBanking] Auto-sync on auth error: ${err.message}`);
    });
  });
}

module.exports = { triggerAutoSyncOnAuth };
