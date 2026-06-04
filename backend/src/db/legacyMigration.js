/**
 * One-time migration from single-user finance.db + auth.json to per-user storage.
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');
const userRegistry = require('../services/userRegistry');

const LEGACY_AUTH_PATH = config.AUTH_STORE_PATH || path.join(config.DATA_DIR, 'auth.json');

function readLegacyPasswordHash() {
  if (!fs.existsSync(LEGACY_AUTH_PATH)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(LEGACY_AUTH_PATH, 'utf8'));
    return data.passwordHash || null;
  } catch {
    return null;
  }
}

function archiveLegacyAuth() {
  if (!fs.existsSync(LEGACY_AUTH_PATH)) return;
  const dest = `${LEGACY_AUTH_PATH}.migrated`;
  if (!fs.existsSync(dest)) {
    fs.renameSync(LEGACY_AUTH_PATH, dest);
  }
}

function stashPendingLegacyDb() {
  if (!fs.existsSync(config.LEGACY_DB_PATH)) return false;
  fs.mkdirSync(config.PENDING_LEGACY_DIR, { recursive: true });
  const dest = path.join(config.PENDING_LEGACY_DIR, 'finance.db');
  if (!fs.existsSync(dest)) {
    fs.renameSync(config.LEGACY_DB_PATH, dest);
  }
  return true;
}

function hasPendingLegacyDb() {
  return fs.existsSync(path.join(config.PENDING_LEGACY_DIR, 'finance.db'));
}

function moveLegacyDbToUser(userId, sourcePath) {
  fs.mkdirSync(path.join(config.USERS_DIR, userId), { recursive: true });
  const dest = path.join(config.USERS_DIR, userId, 'finance.db');
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  fs.renameSync(sourcePath, dest);
}

function consumePendingLegacyDb(userId) {
  const pending = path.join(config.PENDING_LEGACY_DIR, 'finance.db');
  if (!fs.existsSync(pending)) return false;
  moveLegacyDbToUser(userId, pending);
  try {
    fs.rmSync(config.PENDING_LEGACY_DIR, { recursive: true, force: true });
  } catch { /* ignore */ }
  return true;
}

function runLegacyMigration() {
  if (userRegistry.hasUsers()) return { migrated: false, reason: 'registry_populated' };

  const legacyDbExists = fs.existsSync(config.LEGACY_DB_PATH);
  const pendingExists = hasPendingLegacyDb();
  if (!legacyDbExists && !pendingExists) return { migrated: false, reason: 'no_legacy_db' };

  const email = process.env.LEGACY_ADMIN_EMAIL || 'owner@local.financeos';
  const passwordHash = readLegacyPasswordHash();

  if (passwordHash && legacyDbExists) {
    const user = userRegistry.createUserWithHash({
      email,
      passwordHash,
      role: userRegistry.ROLES.ADMIN,
    });
    moveLegacyDbToUser(user.id, config.LEGACY_DB_PATH);
    archiveLegacyAuth();
    console.log(`[Migration] Legacy data attached to admin ${user.email}`);
    return { migrated: true, userId: user.id, email: user.email };
  }

  if (legacyDbExists) {
    stashPendingLegacyDb();
    console.log('[Migration] Legacy database stashed — first registered user will receive it');
    return { migrated: false, reason: 'pending_first_registration' };
  }

  return { migrated: false, reason: 'nothing_to_do' };
}

function attachPendingLegacyOnRegister(userId) {
  if (!hasPendingLegacyDb()) return false;
  consumePendingLegacyDb(userId);
  console.log(`[Migration] Pending legacy database attached to user ${userId}`);
  return true;
}

module.exports = {
  runLegacyMigration,
  attachPendingLegacyOnRegister,
  hasPendingLegacyDb,
};
