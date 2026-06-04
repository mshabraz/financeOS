/**
 * Central configuration from environment variables.
 * See .env.example for LAN / HTTPS / auth options.
 */

const path = require('path');
const fs   = require('fs');

// Load .env from backend/ or project root (optional file)
try {
  const dotenv = require('dotenv');
  const backendEnv = path.join(__dirname, '../.env');
  const rootEnv = path.join(__dirname, '../../.env');
  if (fs.existsSync(backendEnv)) dotenv.config({ path: backendEnv });
  else if (fs.existsSync(rootEnv)) dotenv.config({ path: rootEnv });
} catch {
  /* dotenv optional */
}

const ROOT = path.join(__dirname, '../..');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const USERS_DIR = path.join(DATA_DIR, 'users');
const REGISTRY_PATH = path.join(DATA_DIR, 'users-registry.json');
const LEGACY_DB_PATH = path.join(DATA_DIR, 'finance.db');
const PENDING_LEGACY_DIR = path.join(DATA_DIR, '.pending-legacy');

function envBool(key, defaultValue = false) {
  const v = process.env[key];
  if (v === undefined) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function envInt(key, defaultValue) {
  const n = parseInt(process.env[key], 10);
  return Number.isFinite(n) ? n : defaultValue;
}

const HOST = process.env.HOST || '0.0.0.0';
const PORT = envInt('PORT', 3001);
const FRONTEND_PORT = envInt('FRONTEND_PORT', 5173);

/** Comma-separated extra origins; LAN private IPs are auto-allowed when LAN_MODE=true */
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const LAN_MODE = envBool('LAN_MODE', HOST === '0.0.0.0');
const SERVE_FRONTEND = envBool('SERVE_FRONTEND', false);
const HTTPS_ENABLED = envBool('HTTPS', false);
const TLS_KEY_PATH  = process.env.TLS_KEY_PATH  || path.join(DATA_DIR, 'certs', 'key.pem');
const TLS_CERT_PATH = process.env.TLS_CERT_PATH || path.join(DATA_DIR, 'certs', 'cert.pem');

const AUTH_ENABLED = envBool('AUTH_ENABLED', LAN_MODE);
const SESSION_SECRET_PATH = path.join(DATA_DIR, '.session-secret');

function getOrCreateSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(SESSION_SECRET_PATH)) {
    return fs.readFileSync(SESSION_SECRET_PATH, 'utf8').trim();
  }
  const secret = require('crypto').randomBytes(32).toString('hex');
  fs.writeFileSync(SESSION_SECRET_PATH, secret, { mode: 0o600 });
  return secret;
}

const COOKIE_SECURE = envBool('COOKIE_SECURE', HTTPS_ENABLED);

module.exports = {
  ROOT,
  DATA_DIR,
  USERS_DIR,
  REGISTRY_PATH,
  LEGACY_DB_PATH,
  PENDING_LEGACY_DIR,
  HOST,
  PORT,
  FRONTEND_PORT,
  CORS_ORIGINS,
  LAN_MODE,
  SERVE_FRONTEND,
  HTTPS_ENABLED,
  TLS_KEY_PATH,
  TLS_CERT_PATH,
  AUTH_ENABLED,
  SESSION_SECRET: getOrCreateSessionSecret(),
  COOKIE_SECURE,
  AUTH_STORE_PATH: path.join(DATA_DIR, 'auth.json'),
};
