const config = require('../config');
const { runWithUserId } = require('../db/requestContext');
const userRegistry = require('../services/userRegistry');
const { openUserDatabase } = require('../db/database');

/**
 * Attach per-request user id for database scoping.
 * Must run after requireAuth on protected /api routes.
 */
function attachUserContext(req, res, next) {
  let userId = req.session?.userId;

  if (!config.AUTH_ENABLED) {
    const dev = userRegistry.getOrCreateDevUser();
    userId = dev.id;
    req.session.authenticated = true;
    req.session.userId = dev.id;
    req.session.email = dev.email;
    req.session.role = dev.role;
  }

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
  }

  req.financeosUserId = userId;

  try {
    openUserDatabase(userId);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  return runWithUserId(userId, () => next());
}

/**
 * Re-enter user DB context after async middleware (e.g. multer file upload).
 */
function reenterUserContext(req, res, next) {
  let userId = req.financeosUserId || req.session?.userId;

  if (!userId && !config.AUTH_ENABLED) {
    const dev = userRegistry.getOrCreateDevUser();
    userId = dev.id;
    req.session.userId = dev.id;
    req.financeosUserId = dev.id;
  }

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
  }

  try {
    openUserDatabase(userId);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  return runWithUserId(userId, () => next());
}

module.exports = { attachUserContext, reenterUserContext };
