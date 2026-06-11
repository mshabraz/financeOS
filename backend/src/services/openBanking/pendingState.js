/**
 * Temporary OAuth state → user mapping (callback may arrive without session cookie).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../../config');

const STORE_PATH = path.join(config.DATA_DIR, 'open-banking-pending.json');
const TTL_MS = 60 * 60 * 1000;

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeStore(data) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function prune(store) {
  const now = Date.now();
  let changed = false;
  for (const [key, entry] of Object.entries(store)) {
    if (!entry?.createdAt || now - Date.parse(entry.createdAt) > TTL_MS) {
      delete store[key];
      changed = true;
    }
  }
  if (changed) writeStore(store);
  return store;
}

function createPending({ userId, aspspName, aspspCountry }) {
  const state = crypto.randomUUID();
  const store = prune(readStore());
  store[state] = {
    userId,
    aspspName,
    aspspCountry,
    createdAt: new Date().toISOString(),
  };
  writeStore(store);
  return state;
}

function consumePending(state) {
  if (!state) return null;
  const store = prune(readStore());
  const entry = store[state];
  if (!entry) return null;
  delete store[state];
  writeStore(store);
  return entry;
}

module.exports = { createPending, consumePending };
