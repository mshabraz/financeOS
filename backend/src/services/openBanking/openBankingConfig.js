/**
 * Enable Banking / open banking configuration from environment.
 */

const fs = require('fs');
const config = require('../../config');

const PROVIDER = process.env.OPEN_BANKING_PROVIDER || '';
const APP_ID = process.env.ENABLE_BANKING_APP_ID || '';
const PRIVATE_KEY_PATH = process.env.ENABLE_BANKING_PRIVATE_KEY_PATH || '';
const REDIRECT_URL = process.env.OPEN_BANKING_REDIRECT_URL || '';
const API_BASE = process.env.ENABLE_BANKING_API_BASE || 'https://api.enablebanking.com';

/** Estonian banks we surface in the UI (matched case-insensitively). */
const EE_BANK_PATTERNS = [
  { match: /revolut/i, label: 'Revolut' },
  { match: /swedbank/i, label: 'Swedbank' },
  { match: /\bseb\b/i, label: 'SEB' },
];

function privateKeyExists() {
  if (!PRIVATE_KEY_PATH) return false;
  try {
    return fs.existsSync(PRIVATE_KEY_PATH);
  } catch {
    return false;
  }
}

function isEnabled() {
  return (
    PROVIDER === 'enable_banking' &&
    Boolean(APP_ID) &&
    Boolean(REDIRECT_URL) &&
    privateKeyExists()
  );
}

function getStatus() {
  const enabled = isEnabled();
  return {
    enabled,
    provider: PROVIDER || null,
    configured: Boolean(APP_ID && REDIRECT_URL),
    privateKeyPresent: privateKeyExists(),
    redirectUrl: REDIRECT_URL || null,
    message: enabled
      ? null
      : 'Open banking is disabled. Set OPEN_BANKING_PROVIDER=enable_banking and Enable Banking env vars on the server.',
  };
}

function assertEnabled() {
  if (!isEnabled()) {
    const err = new Error(getStatus().message);
    err.code = 'OPEN_BANKING_DISABLED';
    err.status = 503;
    throw err;
  }
}

function filterEstonianBanks(aspsps) {
  const list = Array.isArray(aspsps) ? aspsps : aspsps?.aspsps || [];
  return list.filter((bank) => {
    if ((bank.country || '').toUpperCase() !== 'EE') return false;
    const name = bank.name || '';
    return EE_BANK_PATTERNS.some((p) => p.match.test(name));
  });
}

module.exports = {
  PROVIDER,
  APP_ID,
  PRIVATE_KEY_PATH,
  REDIRECT_URL,
  API_BASE,
  EE_BANK_PATTERNS,
  isEnabled,
  getStatus,
  assertEnabled,
  filterEstonianBanks,
};
