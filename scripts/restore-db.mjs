#!/usr/bin/env node
/**
 * Restore database from a backup folder under backend/data/backups/.
 * Usage: npm run db:restore -- 2026-05-20T10-30-00
 *        npm run db:restore -- --latest
 *
 * Stop the app before restoring.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

try {
  const dotenv = require('dotenv');
  const rootEnv = path.join(ROOT, '.env');
  if (fs.existsSync(rootEnv)) dotenv.config({ path: rootEnv });
} catch { /* optional */ }

const config = require(path.join(ROOT, 'backend', 'src', 'config.js'));
const DATA_DIR = config.DATA_DIR;
const backupsRoot = path.join(DATA_DIR, 'backups');

function listBackups() {
  if (!fs.existsSync(backupsRoot)) return [];
  return fs.readdirSync(backupsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse();
}

const arg = process.argv[2];
const force = process.argv.includes('--yes') || process.argv.includes('-y');

if (!arg || arg === '--help') {
  console.log('Usage: npm run db:restore -- <backup-folder-name>');
  console.log('       npm run db:restore -- --latest');
  console.log('\nAvailable backups:');
  const list = listBackups();
  if (!list.length) console.log('  (none)');
  else list.forEach((n) => console.log(`  ${n}`));
  process.exit(arg ? 0 : 1);
}

const folderName = arg === '--latest' ? listBackups()[0] : arg;
if (!folderName) {
  console.error('[restore] No backups found.');
  process.exit(1);
}

const srcDir = path.join(backupsRoot, folderName);
if (!fs.existsSync(srcDir)) {
  console.error(`[restore] Backup not found: ${srcDir}`);
  process.exit(1);
}

if (!force) {
  console.warn('[restore] Stop FinanceOS (backend) before continuing.');
  console.warn(`[restore] Will overwrite files in: ${DATA_DIR}`);
  console.warn('[restore] Re-run with --yes to confirm.');
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });

for (const name of ['finance.db', 'auth.json', '.session-secret']) {
  const src = path.join(srcDir, name);
  if (fs.existsSync(src)) {
    const dest = path.join(DATA_DIR, name);
    if (fs.existsSync(dest)) {
      const pre = `${dest}.pre-restore-${Date.now()}`;
      fs.copyFileSync(dest, pre);
      console.log(`[restore] Previous ${name} → ${path.basename(pre)}`);
    }
    fs.copyFileSync(src, dest);
    console.log(`[restore] Restored ${name}`);
  }
}

const certSrc = path.join(srcDir, 'certs');
if (fs.existsSync(certSrc)) {
  const certDest = path.join(DATA_DIR, 'certs');
  fs.mkdirSync(certDest, { recursive: true });
  for (const f of fs.readdirSync(certSrc)) {
    fs.copyFileSync(path.join(certSrc, f), path.join(certDest, f));
    console.log(`[restore] certs/${f}`);
  }
}

console.log(`\n[restore] Done from: ${folderName}`);
console.log('[restore] Start the app and run: npm run db:migrate');
