/**
 * Per-user SQLite databases (sql.js WASM).
 * getDb() resolves the database for the current request user (AsyncLocalStorage).
 */

const path = require('path');
const fs = require('fs');
const config = require('../config');
const { getSQL } = require('./sqljsLoader');
const { getRequestUserId } = require('./requestContext');

const userCache = new Map();

function userDbPath(userId) {
  return path.join(config.USERS_DIR, userId, 'finance.db');
}

function createWrapper(raw, dbPath) {
  let _inTx = false;
  let _persistQueue = Promise.resolve();
  let _persistTimer = null;
  const PERSIST_DEBOUNCE_MS = 250;

  function persist() {
    if (_inTx) return;
    if (_persistTimer) clearTimeout(_persistTimer);
    _persistTimer = setTimeout(() => {
      _persistTimer = null;
      _persistQueue = _persistQueue.then(() => {
        const data = raw.export();
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        const tmp = `${dbPath}.tmp`;
        fs.writeFileSync(tmp, Buffer.from(data));
        fs.renameSync(tmp, dbPath);
      }).catch((err) => {
        console.error(`[DB] Persist failed (${dbPath}):`, err.message);
      });
    }, PERSIST_DEBOUNCE_MS);
  }

  function normalize(args) {
    if (!args || args.length === 0) return null;
    if (args.length === 1 && Array.isArray(args[0])) {
      return args[0].length ? args[0] : null;
    }
    if (
      args.length === 1 &&
      args[0] !== null &&
      typeof args[0] === 'object' &&
      !Array.isArray(args[0])
    ) {
      const named = {};
      for (const [k, v] of Object.entries(args[0])) {
        const key = /^[@$:]/.test(k) ? k : `@${k}`;
        named[key] = v ?? null;
      }
      return named;
    }
    return args.map((v) => (v === undefined ? null : v));
  }

  function queryOne(sql, bindings) {
    const stmt = raw.prepare(sql);
    try {
      if (bindings) stmt.bind(bindings);
      return stmt.step() ? stmt.getAsObject() : undefined;
    } finally {
      stmt.free();
    }
  }

  function queryAll(sql, bindings) {
    const stmt = raw.prepare(sql);
    try {
      if (bindings) stmt.bind(bindings);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  function execute(sql, bindings) {
    const stmt = raw.prepare(sql);
    try {
      if (bindings) stmt.bind(bindings);
      stmt.step();
    } finally {
      stmt.free();
    }

    const changes = raw.getRowsModified();
    let lastInsertRowid = null;
    if (/^\s*INSERT/i.test(sql)) {
      try {
        const res = raw.exec('SELECT last_insert_rowid()');
        lastInsertRowid = res[0]?.values?.[0]?.[0] ?? null;
      } catch { /* ignore */ }
    }

    persist();
    return { changes, lastInsertRowid };
  }

  function prepare(sql) {
    return {
      run(...args) { return execute(sql, normalize(args)); },
      get(...args) { return queryOne(sql, normalize(args)); },
      all(...args) { return queryAll(sql, normalize(args)); },
    };
  }

  function exec(sql) {
    raw.exec(sql);
    persist();
  }

  function pragma(str) {
    try {
      if (str.includes('=')) {
        raw.run(`PRAGMA ${str}`);
      } else {
        return queryAll(`PRAGMA ${str}`, null);
      }
    } catch { /* ignore */ }
    return [];
  }

  function transaction(fn) {
    return (...args) => {
      raw.run('BEGIN');
      _inTx = true;
      try {
        const result = fn(...args);
        raw.run('COMMIT');
        _inTx = false;
        persist();
        return result;
      } catch (e) {
        _inTx = false;
        try { raw.run('ROLLBACK'); } catch { /* ignore */ }
        throw e;
      }
    };
  }

  return { _raw: raw, exec, pragma, prepare, transaction, dbPath };
}

function openUserDatabase(userId) {
  if (!userId) throw new Error('[DB] userId required');
  if (userCache.has(userId)) return userCache.get(userId);

  const dbPath = userDbPath(userId);
  if (!global.__financeosSql) {
    throw new Error('[DB] SQL engine not initialized — call initDb() first');
  }

  let raw;
  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    raw = new global.__financeosSql.Database(buf);
  } else {
    raw = new global.__financeosSql.Database();
  }

  try { raw.run('PRAGMA foreign_keys = ON'); } catch { /* ignore */ }
  try { raw.run('PRAGMA synchronous = NORMAL'); } catch { /* ignore */ }

  const wrapper = createWrapper(raw, dbPath);
  const { runMigrations, seedDefaultData } = require('./schema');
  runMigrations(wrapper);
  seedDefaultData(wrapper);

  userCache.set(userId, wrapper);
  return wrapper;
}

function createUserDatabase(userId) {
  fs.mkdirSync(path.join(config.USERS_DIR, userId), { recursive: true });
  const dbPath = userDbPath(userId);
  if (!fs.existsSync(dbPath)) {
    const raw = new global.__financeosSql.Database();
    const wrapper = createWrapper(raw, dbPath);
    const { runMigrations, seedDefaultData } = require('./schema');
    runMigrations(wrapper);
    seedDefaultData(wrapper);
    userCache.set(userId, wrapper);
  } else {
    openUserDatabase(userId);
  }
  return userCache.get(userId);
}

function adoptDatabaseFile(userId, sourcePath) {
  fs.mkdirSync(path.join(config.USERS_DIR, userId), { recursive: true });
  const dest = userDbPath(userId);
  if (userCache.has(userId)) {
    try { userCache.get(userId)._raw.close(); } catch { /* ignore */ }
    userCache.delete(userId);
  }
  if (fs.existsSync(sourcePath)) {
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    fs.renameSync(sourcePath, dest);
  }
  return openUserDatabase(userId);
}

/** Startup: load WASM, run legacy migration (does not open user DBs). */
async function initDb() {
  const SQL = await getSQL();
  global.__financeosSql = SQL;
  fs.mkdirSync(config.USERS_DIR, { recursive: true });

  const { runLegacyMigration } = require('./legacyMigration');
  runLegacyMigration();

  console.log('[DB] Per-user databases ready');
  return true;
}

function getDb() {
  const userId = getRequestUserId();
  if (!userId) {
    throw new Error('[DB] No user context — ensure userContext middleware is active');
  }
  return openUserDatabase(userId);
}

function listCachedUserIds() {
  return [...userCache.keys()];
}

function forEachRegisteredUser(fn) {
  const userRegistry = require('../services/userRegistry');
  for (const u of userRegistry.listUsers()) {
    fn(u.id);
  }
}

module.exports = {
  initDb,
  getDb,
  openUserDatabase,
  createUserDatabase,
  adoptDatabaseFile,
  userDbPath,
  listCachedUserIds,
  forEachRegisteredUser,
};
