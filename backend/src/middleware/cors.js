const cors = require('cors');
const config = require('../config');
const { isPrivateIPv4 } = require('../services/networkInfo');

/** Bump when CORS/tunnel behaviour changes — visible in GET /api/health. */
const CORS_TUNNEL_VERSION = 2;

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

function originHostname(origin) {
  try {
    return new URL(origin).hostname;
  } catch {
    return '';
  }
}

function isTunnelHostname(hostname) {
  return TUNNEL_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

function isTunnelOrigin(origin) {
  return isTunnelHostname(originHostname(origin));
}

/** Built frontend assets — skip strict CORS (Vite may emit crossorigin on script tags). */
function isPublicStaticAssetPath(pathname) {
  if (!pathname) return false;
  return (
    pathname.startsWith('/assets/') ||
    pathname === '/logo-icon.svg' ||
    pathname === '/logo.svg' ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.map')
  );
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

function isSameHostOrigin(origin, req) {
  if (!origin || !req) return false;
  const oh = originHostname(origin);
  const forwarded = req.headers['x-forwarded-host'] || req.headers.host || '';
  const requestHostname = parseHostname(forwarded);
  return Boolean(requestHostname && oh === requestHostname);
}

function isProxiedTunnelOrigin(origin, req) {
  if (!origin || !req || !isTunnelOrigin(origin)) return false;

  const requestHostname = parseHostname(req.headers.host || '');
  const behindProxy = Boolean(
    req.headers['cf-ray'] ||
    req.headers['cf-connecting-ip'] ||
    req.headers['x-forwarded-for'] ||
    req.headers['x-forwarded-host']
  );

  if (!behindProxy && !config.LAN_MODE) return false;
  if (requestHostname === 'localhost' || requestHostname === '127.0.0.1') return true;
  if (originHostname(origin) === requestHostname) return true;
  return config.LAN_MODE;
}

function isOriginAllowed(origin, req) {
  if (!origin) return true;
  // LAN + Cloudflare quick tunnel: always allow (personal server use case)
  if (config.LAN_MODE && isTunnelOrigin(origin)) return true;
  if (isSameHostOrigin(origin, req)) return true;
  if (isProxiedTunnelOrigin(origin, req)) return true;
  if (config.CORS_ORIGINS.includes(origin)) return true;
  if (config.LAN_MODE && isAllowedLanOrigin(origin)) return true;
  if (!config.LAN_MODE && origin.startsWith('http://localhost:')) return true;
  return false;
}

function applyCorsHeaders(origin, req, res) {
  if (!origin || !isOriginAllowed(origin, req)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
  return true;
}

function createCorsMiddleware() {
  return (req, res, next) => {
    const origin = req.headers.origin;

    // Static assets: never block; reflect Origin when present (module scripts with crossorigin)
    if (req.method === 'GET' && isPublicStaticAssetPath(req.path)) {
      if (origin) applyCorsHeaders(origin, req, res);
      return next();
    }

    if (req.method === 'OPTIONS') {
      return cors({
        origin(originHeader, callback) {
          if (isOriginAllowed(originHeader, req)) return callback(null, true);
          callback(new Error(`CORS blocked: ${originHeader}`));
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      })(req, res, next);
    }

    return cors({
      origin(originHeader, callback) {
        if (isOriginAllowed(originHeader, req)) return callback(null, true);
        callback(new Error(`CORS blocked: ${originHeader}`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })(req, res, next);
  };
}

module.exports = {
  CORS_TUNNEL_VERSION,
  createCorsMiddleware,
  isAllowedLanOrigin,
  isSameHostOrigin,
  isProxiedTunnelOrigin,
  isOriginAllowed,
  isPublicStaticAssetPath,
  isTunnelOrigin,
};
