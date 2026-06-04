/**
 * Local user accounts (email + bcrypt). Stored in data/users-registry.json.
 */

const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config');

const BCRYPT_ROUNDS = 12;
const ROLES = { ADMIN: 'admin', USER: 'user' };

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function loadRegistry() {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  if (!fs.existsSync(config.REGISTRY_PATH)) {
    return { version: 1, users: [] };
  }
  try {
    const data = JSON.parse(fs.readFileSync(config.REGISTRY_PATH, 'utf8'));
    if (!Array.isArray(data.users)) data.users = [];
    return data;
  } catch {
    return { version: 1, users: [] };
  }
}

function saveRegistry(data) {
  const tmp = `${config.REGISTRY_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, config.REGISTRY_PATH);
}

function listUsers() {
  return loadRegistry().users.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt,
  }));
}

function hasUsers() {
  return loadRegistry().users.length > 0;
}

function countAdmins() {
  return loadRegistry().users.filter((u) => u.role === ROLES.ADMIN).length;
}

function findByEmail(email) {
  const norm = normalizeEmail(email);
  return loadRegistry().users.find((u) => u.email === norm) || null;
}

function findById(id) {
  return loadRegistry().users.find((u) => u.id === id) || null;
}

async function createUser({ email, password }) {
  const norm = normalizeEmail(email);
  if (!norm || !norm.includes('@')) throw new Error('Valid email is required');
  if (!password || password.length < 8) throw new Error('Password must be at least 8 characters');

  const data = loadRegistry();
  if (data.users.some((u) => u.email === norm)) throw new Error('Email already registered');

  /** First registered account is always admin; later accounts are standard users. */
  const assignedRole = data.users.length === 0 ? ROLES.ADMIN : ROLES.USER;

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = {
    id: crypto.randomUUID(),
    email: norm,
    passwordHash: hash,
    role: assignedRole,
    createdAt: new Date().toISOString(),
  };
  data.users.push(user);
  saveRegistry(data);
  return { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt };
}

function createUserWithHash({ email, passwordHash, role }) {
  const norm = normalizeEmail(email);
  if (!norm || !norm.includes('@')) throw new Error('Valid email is required');
  const data = loadRegistry();
  if (data.users.some((u) => u.email === norm)) throw new Error('Email already registered');

  const user = {
    id: crypto.randomUUID(),
    email: norm,
    passwordHash,
    role: role || ROLES.ADMIN,
    createdAt: new Date().toISOString(),
  };
  data.users.push(user);
  saveRegistry(data);
  return { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt };
}

async function verifyCredentials(email, password) {
  const user = findByEmail(email);
  if (!user?.passwordHash) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return { id: user.id, email: user.email, role: user.role };
}

async function changePassword(userId, currentPassword, newPassword) {
  const data = loadRegistry();
  const user = data.users.find((u) => u.id === userId);
  if (!user) throw new Error('User not found');
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw new Error('Current password is incorrect');
  if (!newPassword || newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters');
  }
  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  saveRegistry(data);
  return true;
}

async function adminResetPassword(actorId, targetUserId, newPassword) {
  const actor = findById(actorId);
  if (!actor || actor.role !== ROLES.ADMIN) throw new Error('Admin access required');
  if (!newPassword || newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters');
  }

  const data = loadRegistry();
  const target = data.users.find((u) => u.id === targetUserId);
  if (!target) throw new Error('User not found');

  target.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  saveRegistry(data);
  return { id: target.id, email: target.email, role: target.role };
}

function getOrCreateDevUser() {
  const data = loadRegistry();
  const devEmail = 'dev@local.financeos';
  let user = data.users.find((u) => u.email === devEmail);
  if (!user) {
    const hash = bcrypt.hashSync('dev-local-only', BCRYPT_ROUNDS);
    user = {
      id: crypto.randomUUID(),
      email: devEmail,
      passwordHash: hash,
      role: ROLES.ADMIN,
      createdAt: new Date().toISOString(),
    };
    data.users.push(user);
    saveRegistry(data);
  }
  return { id: user.id, email: user.email, role: user.role };
}

module.exports = {
  ROLES,
  normalizeEmail,
  listUsers,
  hasUsers,
  countAdmins,
  findByEmail,
  findById,
  createUser,
  createUserWithHash,
  verifyCredentials,
  changePassword,
  adminResetPassword,
  getOrCreateDevUser,
};
