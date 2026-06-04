const config = require('../config');
const userRegistry = require('../services/userRegistry');

/** Paths that never require a session (auth + public network info). */
const PUBLIC_PATHS = [
  '/api/auth/status',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/network/info',
];

function isPublicPath(req) {
  if (!config.AUTH_ENABLED) return true;
  const p = req.path;
  return PUBLIC_PATHS.some((pub) => p === pub || p.startsWith(pub + '?'));
}

function requireAuth(req, res, next) {
  if (!config.AUTH_ENABLED) return next();
  if (isPublicPath(req)) return next();

  if (req.session?.authenticated && req.session?.userId) return next();

  return res.status(401).json({
    error: 'Authentication required',
    code: 'AUTH_REQUIRED',
    configured: userRegistry.hasUsers(),
  });
}

module.exports = { requireAuth, isPublicPath };
