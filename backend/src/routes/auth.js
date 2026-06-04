const express = require('express');
const config = require('../config');
const userRegistry = require('../services/userRegistry');
const { createUserDatabase } = require('../db/database');
const { attachPendingLegacyOnRegister } = require('../db/legacyMigration');

const router = express.Router();

function sessionUser(req) {
  if (!req.session?.userId) return null;
  return {
    id: req.session.userId,
    email: req.session.email,
    role: req.session.role,
  };
}

function setSession(req, user) {
  req.session.authenticated = true;
  req.session.userId = user.id;
  req.session.email = user.email;
  req.session.role = user.role;
  req.session.createdAt = Date.now();
}

// GET /api/auth/status
router.get('/status', (req, res) => {
  const authenticated =
    !config.AUTH_ENABLED || !!(req.session?.authenticated && req.session?.userId);
  res.json({
    authEnabled: config.AUTH_ENABLED,
    configured: userRegistry.hasUsers(),
    authenticated,
    user: authenticated ? sessionUser(req) : null,
    canRegister: config.AUTH_ENABLED && !authenticated,
  });
});

// POST /api/auth/register — self-registration (first user becomes admin)
router.post('/register', async (req, res) => {
  try {
    if (!config.AUTH_ENABLED) {
      return res.status(400).json({ error: 'Registration is disabled when auth is off' });
    }
    const { email, password } = req.body || {};
    const user = await userRegistry.createUser({ email, password });
    createUserDatabase(user.id);
    attachPendingLegacyOnRegister(user.id);
    setSession(req, user);
    res.json({ ok: true, user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    if (!config.AUTH_ENABLED) {
      const dev = userRegistry.getOrCreateDevUser();
      createUserDatabase(dev.id);
      setSession(req, dev);
      return res.json({ ok: true, authEnabled: false, user: dev });
    }
    if (!userRegistry.hasUsers()) {
      return res.status(400).json({
        error: 'No accounts yet — register first',
        code: 'REGISTER_REQUIRED',
        configured: false,
      });
    }
    const { email, password } = req.body || {};
    const user = await verifyWithRateLimit(req, email, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    createUserDatabase(user.id);
    setSession(req, user);
    res.json({ ok: true, user });
  } catch (err) {
    res.status(429).json({ error: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.clearCookie('financeos.sid');
    res.json({ ok: true });
  });
});

// POST /api/auth/change-password (requires session)
router.post('/change-password', async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const { currentPassword, newPassword } = req.body || {};
    await userRegistry.changePassword(req.session.userId, currentPassword, newPassword);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const loginAttempts = new Map();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

async function verifyWithRateLimit(req, email, password) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let record = loginAttempts.get(ip);
  if (!record || now - record.start > WINDOW_MS) {
    record = { start: now, count: 0 };
  }
  if (record.count >= MAX_ATTEMPTS) {
    throw new Error('Too many login attempts. Try again in 15 minutes.');
  }
  const user = await userRegistry.verifyCredentials(email, password);
  if (!user) {
    record.count += 1;
    loginAttempts.set(ip, record);
    return null;
  }
  loginAttempts.delete(ip);
  return user;
}

module.exports = router;
