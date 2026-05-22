/**
 * Local password storage (bcrypt hash in data/auth.json).
 * No cloud — credentials never leave this machine.
 */

const fs = require('fs');
const bcrypt = require('bcryptjs');
const config = require('../config');

const BCRYPT_ROUNDS = 12;

function load() {
  if (!fs.existsSync(config.AUTH_STORE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(config.AUTH_STORE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function isConfigured() {
  const data = load();
  return !!(data && data.passwordHash);
}

function savePasswordHash(passwordHash) {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  const payload = {
    passwordHash,
    createdAt: new Date().toISOString(),
    version: 1,
  };
  fs.writeFileSync(config.AUTH_STORE_PATH, JSON.stringify(payload, null, 2), { mode: 0o600 });
}

async function setupPassword(plainPassword) {
  if (!plainPassword || plainPassword.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  if (isConfigured()) {
    throw new Error('Password already configured');
  }
  const hash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
  savePasswordHash(hash);
  return true;
}

async function verifyPassword(plainPassword) {
  const data = load();
  if (!data?.passwordHash) return false;
  return bcrypt.compare(plainPassword, data.passwordHash);
}

async function changePassword(currentPassword, newPassword) {
  const ok = await verifyPassword(currentPassword);
  if (!ok) throw new Error('Current password is incorrect');
  if (!newPassword || newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters');
  }
  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  savePasswordHash(hash);
  return true;
}

module.exports = {
  isConfigured,
  setupPassword,
  verifyPassword,
  changePassword,
};
