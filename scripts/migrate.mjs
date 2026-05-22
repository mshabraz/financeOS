#!/usr/bin/env node
/**
 * Apply database migrations without starting the HTTP server.
 * Usage: npm run db:migrate
 *        npm run db:status
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

// Load .env before config
try {
  const dotenv = require('dotenv');
  const fs = require('fs');
  const rootEnv = path.join(ROOT, '.env');
  const backendEnv = path.join(ROOT, 'backend', '.env');
  if (fs.existsSync(rootEnv)) dotenv.config({ path: rootEnv });
  else if (fs.existsSync(backendEnv)) dotenv.config({ path: backendEnv });
} catch {
  /* optional */
}

const statusOnly = process.argv.includes('--status');

async function main() {
  const { initDb, getDb } = require(path.join(ROOT, 'backend', 'src', 'db', 'database.js'));
  const config = require(path.join(ROOT, 'backend', 'src', 'config.js'));

  console.log(`[migrate] Database: ${path.join(config.DATA_DIR, 'finance.db')}`);

  await initDb();
  const db = getDb();

  const rows = db.prepare('SELECT version, applied_at FROM schema_migrations ORDER BY version').all();
  console.log(`[migrate] Applied migrations: ${rows.length ? rows.map((r) => `v${r.version}`).join(', ') : '(none yet)'}`);

  if (statusOnly) {
    const max = rows.length ? Math.max(...rows.map((r) => r.version)) : 0;
    console.log(`[migrate] Latest applied version: v${max || 0}`);
    console.log('[migrate] Migrations also run automatically when the server starts.');
    return;
  }

  const { runMigrations } = require(path.join(ROOT, 'backend', 'src', 'db', 'schema.js'));
  runMigrations(db);
  console.log('[migrate] Migrations complete.');
}

main().catch((err) => {
  console.error('[migrate] Failed:', err.message);
  process.exit(1);
});
