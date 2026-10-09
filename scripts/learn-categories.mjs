#!/usr/bin/env node
/**
 * Learn category rules from categorized transactions and apply to uncategorized only.
 * Does NOT override manual or existing rule categories.
 *
 * Usage (in container):
 *   node /app/scripts/learn-categories.mjs
 *   DATA_DIR=/data node scripts/learn-categories.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

try {
  const dotenv = require('dotenv');
  const fs = require('fs');
  const rootEnv = path.join(ROOT, '.env');
  if (fs.existsSync(rootEnv)) dotenv.config({ path: rootEnv });
} catch { /* optional */ }

async function main() {
  const { initDb, openUserDatabase } = require(path.join(ROOT, 'backend', 'src', 'db', 'database.js'));
  const { runWithUserId } = require(path.join(ROOT, 'backend', 'src', 'db', 'requestContext.js'));
  const { learnAndApplyCategories } = require(
    path.join(ROOT, 'backend', 'src', 'services', 'categoryLearning.js'),
  );
  const userRegistry = require(path.join(ROOT, 'backend', 'src', 'services', 'userRegistry.js'));

  await initDb();
  const users = userRegistry.listUsers();
  if (!users.length) {
    console.log('[learn] No users found');
    return;
  }

  for (const u of users) {
    console.log(`\n[learn] === ${u.email} (${u.id}) ===`);
    const summary = runWithUserId(u.id, () => {
      openUserDatabase(u.id);
      const db = openUserDatabase(u.id);
      return learnAndApplyCategories(db);
    });
    console.log(JSON.stringify(summary, null, 2));
  }
  console.log('\n[learn] Done');
}

main().catch((err) => {
  console.error('[learn] Failed:', err);
  process.exit(1);
});
