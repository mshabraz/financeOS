const userRegistry = require('../services/userRegistry');

function requireAdmin(req, res, next) {
  const role = req.session?.role;
  if (role !== userRegistry.ROLES.ADMIN) {
    return res.status(403).json({ error: 'Admin access required', code: 'ADMIN_REQUIRED' });
  }
  return next();
}

module.exports = { requireAdmin };
