const cors = require('cors');
const config = require('../config');
const { isPrivateIPv4 } = require('../services/networkInfo');

function isAllowedLanOrigin(origin) {
  if (!origin) return true;
  try {
    const { protocol, hostname, port } = new URL(origin);
    if (!['http:', 'https:'].includes(protocol)) return false;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    if (isPrivateIPv4(hostname)) return true;
    // Allow hostname.local / .local mDNS names
    if (hostname.endsWith('.local')) return true;
    // Dev: vite default port on same host
    if (config.LAN_MODE && (port === String(config.FRONTEND_PORT) || port === String(config.PORT))) {
      return isPrivateIPv4(hostname) || hostname === 'localhost';
    }
    return false;
  } catch {
    return false;
  }
}

function createCorsMiddleware() {
  return cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (config.CORS_ORIGINS.includes(origin)) return callback(null, true);
      if (config.LAN_MODE && isAllowedLanOrigin(origin)) return callback(null, true);
      if (!config.LAN_MODE && origin.startsWith('http://localhost:')) {
        return callback(null, true);
      }
      callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
}

module.exports = { createCorsMiddleware, isAllowedLanOrigin };
