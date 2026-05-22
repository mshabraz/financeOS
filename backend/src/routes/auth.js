const express = require('express');
const authStore = require('../services/authStore');
const config = require('../config');

const router = express.Router();

// GET /api/auth/status
router.get('/status', (req, res) => {
  const authenticated =
    !config.AUTH_ENABLED || !!(req.session?.authenticated);
  res.json({
    authEnabled: config.AUTH_ENABLED,
    configured: authStore.isConfigured(),
    authenticated,
    user: req.session?.user || null,
  });
});

// POST /api/auth/setup — first-time password (LAN: only while unset)
router.post('/setup', async (req, res) => {
  try {
    if (!config.AUTH_ENABLED) {
      return res.status(400).json({ error: 'Authentication is disabled' });
    }
    const { password } = req.body;
    await authStore.setupPassword(password);
    req.session.authenticated = true;
    req.session.user = 'local';
    req.session.createdAt = Date.now();
    res.json({ ok: true, message: 'Password configured' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    if (!config.AUTH_ENABLED) {
      req.session.authenticated = true;
      return res.json({ ok: true, authEnabled: false });
    }
    if (!authStore.isConfigured()) {
      return res.status(400).json({
        error: 'Password not configured yet',
        code: 'SETUP_REQUIRED',
        configured: false,
      });
    }
    const { password } = req.body;
    const ok = await verifyWithRateLimit(req, password);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    req.session.authenticated = true;
    req.session.user = 'local';
    req.session.createdAt = Date.now();
    res.json({ ok: true });
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
  if (!req.session?.authenticated) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const { currentPassword, newPassword } = req.body;
    await authStore.changePassword(currentPassword, newPassword);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Simple in-memory rate limit for login attempts per IP
const loginAttempts = new Map();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

async function verifyWithRateLimit(req, password) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let record = loginAttempts.get(ip);
  if (!record || now - record.start > WINDOW_MS) {
    record = { start: now, count: 0 };
  }
  record.count += 1;
  loginAttempts.set(ip, record);
  if (record.count > MAX_ATTEMPTS) {
    throw new Error('Too many login attempts. Try again in 15 minutes.');
  }
  return authStore.verifyPassword(password);
}

module.exports = router;
