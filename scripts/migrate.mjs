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
  const { initDb, migrateAllUserDatabases } = require(path.join(ROOT, 'backend', 'src', 'db', 'database.js'));
  const config = require(path.join(ROOT, 'backend', 'src', 'config.js'));

  console.log(`[migrate] Data dir: ${config.DATA_DIR}`);
  console.log(`[migrate] Per-user DBs: ${config.USERS_DIR}`);

  await initDb();
  const result = migrateAllUserDatabases();

  if (result.message) {
    console.log(`[migrate] ${result.message}`);
    if (statusOnly) return;
    console.log('[migrate] Migrations complete.');
    return;
  }

  for (const u of result.users) {
    const label = u.migrations.length
      ? `v${u.migrations.join(', v')}`
      : '(none yet)';
    console.log(`[migrate] ${u.email}`);
    console.log(`          ${u.dbPath}`);
    console.log(`          applied: ${label} (latest v${u.latestVersion})`);
  }

  if (statusOnly) {
    console.log('[migrate] Migrations also run automatically when each user DB is opened.');
    return;
  }

  console.log(`[migrate] Migrations complete for ${result.users.length} user(s).`);
}

main().catch((err) => {
  console.error('[migrate] Failed:', err.message);
  process.exit(1);
});
