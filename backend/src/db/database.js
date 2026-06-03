/**
 * SQLite database using sql.js (pure WASM — no native compilation required).
 *
 * Provides a better-sqlite3-compatible synchronous API so all route handlers
 * remain synchronous. The WASM module is initialized once at server startup
 * via initDb(). All write operations auto-persist to disk.
 */

const path = require('path');
const fs   = require('fs');
const config = require('../config');

const DB_PATH = path.join(config.DATA_DIR, 'finance.db');

let _wrapper = null;  // our compatibility wrapper
let _raw     = null;  // raw sql.js Database

/** Call once at startup (async) before Express starts handling requests. */
async function initDb() {
  if (_wrapper) return _wrapper;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    _raw = new SQL.Database(buf);
  } else {
    _raw = new SQL.Database();
  }

  // Apply pragmas directly on raw db
  try { _raw.run('PRAGMA foreign_keys = ON'); }     catch {}
  try { _raw.run('PRAGMA synchronous = NORMAL'); }  catch {}

  _wrapper = createWrapper(_raw);

  const { runMigrations, seedDefaultData } = require('./schema');
  runMigrations(_wrapper);
  seedDefaultData(_wrapper);

  console.log(`[DB] Ready → ${DB_PATH}`);
  return _wrapper;
}

/** Synchronous getter used by all route handlers. */
function getDb() {
  if (!_wrapper) {
    throw new Error('[DB] Not initialized — ensure initDb() is awaited before handling requests.');
  }
  return _wrapper;
}

// ─── Compatibility wrapper ────────────────────────────────────────────────────

function createWrapper(raw) {
  let _inTx = false;
  let _persistQueue = Promise.resolve();
  let _persistTimer = null;
  const PERSIST_DEBOUNCE_MS = 250;

  /** Serialize disk writes — debounced between rapid writes (single Node process). */
  function persist() {
    if (_inTx) return;
    if (_persistTimer) clearTimeout(_persistTimer);
    _persistTimer = setTimeout(() => {
      _persistTimer = null;
      _persistQueue = _persistQueue.then(() => {
        const data = raw.export();
        const tmp = `${DB_PATH}.tmp`;
        fs.writeFileSync(tmp, Buffer.from(data));
        fs.renameSync(tmp, DB_PATH);
      }).catch((err) => {
        console.error('[DB] Persist failed:', err.message);
      });
    }, PERSIST_DEBOUNCE_MS);
  }

  /**
   * Normalize call arguments to a form sql.js can bind.
   * - Multiple positional args → array:  .run('a', 1, true) → ['a', 1, 1]
   * - Single plain object     → named:   .run({ foo: 'x' }) → { '@foo': 'x' }
   * - Single array            → array:   (treated as positional)
   * - No args                 → null (no bind)
   */
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
      // Named param object → prefix un-prefixed keys with @
      const named = {};
      for (const [k, v] of Object.entries(args[0])) {
        const key = /^[@$:]/.test(k) ? k : `@${k}`;
        named[key] = v ?? null;
      }
      return named;
    }

    // Multiple primitives
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
      } catch {}
    }

    persist();
    return { changes, lastInsertRowid };
  }

  function prepare(sql) {
    return {
      run(...args)  { return execute(sql,   normalize(args)); },
      get(...args)  { return queryOne(sql,  normalize(args)); },
      all(...args)  { return queryAll(sql,  normalize(args)); },
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
    } catch {}
    return [];
  }

  /** Wraps a function in a BEGIN/COMMIT transaction. Returns a callable. */
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
        try { raw.run('ROLLBACK'); } catch {}
        throw e;
      }
    };
  }

  return { _raw: raw, exec, pragma, prepare, transaction };
}

module.exports = { initDb, getDb };
