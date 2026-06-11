const cors = require('cors');
const config = require('../config');
const { isPrivateIPv4 } = require('../services/networkInfo');

const TUNNEL_HOST_SUFFIXES = ['.trycloudflare.com', '.cfargotunnel.com'];

function parseHostname(hostHeader) {
  if (!hostHeader) return '';
  const first = String(hostHeader).split(',')[0].trim();
  if (!first) return '';
  if (first.startsWith('[')) {
    const end = first.indexOf(']');
    return end > 0 ? first.slice(1, end) : first;
  }
  return first.split(':')[0];
}

function isTunnelHostname(hostname) {
  return TUNNEL_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

function isAllowedLanOrigin(origin) {
  if (!origin) return true;
  try {
    const { protocol, hostname, port } = new URL(origin);
    if (!['http:', 'https:'].includes(protocol)) return false;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    if (isPrivateIPv4(hostname)) return true;
    if (hostname.endsWith('.local')) return true;
    if (config.LAN_MODE && (port === String(config.FRONTEND_PORT) || port === String(config.PORT))) {
      return isPrivateIPv4(hostname) || hostname === 'localhost';
    }
    return false;
  } catch {
    return false;
  }
}

/** Browser Origin host matches request Host / X-Forwarded-Host (hostname only). */
function isSameHostOrigin(origin, req) {
  if (!origin || !req) return false;
  try {
    const originHostname = new URL(origin).hostname;
    const forwarded = req.headers['x-forwarded-host'] || req.headers.host || '';
    const requestHostname = parseHostname(forwarded);
    return Boolean(requestHostname && originHostname === requestHostname);
  } catch {
    return false;
  }
}

/**
 * cloudflared forwards to localhost:3001 — Express Host is localhost but Origin is the public tunnel URL.
 */
function isProxiedTunnelOrigin(origin, req) {
  if (!origin || !req) return false;
  try {
    const originHostname = new URL(origin).hostname;
    if (!isTunnelHostname(originHostname)) return false;

    const requestHostname = parseHostname(req.headers.host || '');
    const behindProxy = Boolean(
      req.headers['cf-ray'] ||
      req.headers['cf-connecting-ip'] ||
      req.headers['x-forwarded-for'] ||
      req.headers['x-forwarded-host']
    );

    if (!behindProxy && !config.LAN_MODE) return false;

    if (requestHostname === 'localhost' || requestHostname === '127.0.0.1') return true;
    if (originHostname === requestHostname) return true;
    return config.LAN_MODE;
  } catch {
    return false;
  }
}

function isOriginAllowed(origin, req) {
  if (!origin) return true;
  if (isSameHostOrigin(origin, req)) return true;
  if (isProxiedTunnelOrigin(origin, req)) return true;
  if (config.CORS_ORIGINS.includes(origin)) return true;
  if (config.LAN_MODE && isAllowedLanOrigin(origin)) return true;
  if (!config.LAN_MODE && origin.startsWith('http://localhost:')) return true;
  return false;
}

function createCorsMiddleware() {
  return (req, res, next) => {
    cors({
      origin(origin, callback) {
        if (isOriginAllowed(origin, req)) return callback(null, true);
        callback(new Error(`CORS blocked: ${origin}`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })(req, res, next);
  };
}

module.exports = {
  createCorsMiddleware,
  isAllowedLanOrigin,
  isSameHostOrigin,
  isProxiedTunnelOrigin,
  isOriginAllowed,
};
