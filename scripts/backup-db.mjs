#!/usr/bin/env node
/**
 * Backup local SQLite database and auth files.
 * Usage: npm run db:backup
 *        npm run db:backup -- --label before-update
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

const labelArg = process.argv.find((a) => a.startsWith('--label='));
const label = labelArg ? labelArg.split('=')[1] : process.argv.includes('--label')
  ? process.argv[process.argv.indexOf('--label') + 1]
  : null;

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const folderName = label ? `${stamp}_${label.replace(/[^\w.-]+/g, '_')}` : stamp;
const destDir = path.join(DATA_DIR, 'backups', folderName);

const FILES = [
  'finance.db',
  'auth.json',
  '.session-secret',
];

function copyOptional(name) {
  const src = path.join(DATA_DIR, name);
  if (!fs.existsSync(src)) return false;
  fs.copyFileSync(src, path.join(destDir, name));
  return true;
}

fs.mkdirSync(destDir, { recursive: true });

let copied = 0;
for (const name of FILES) {
  if (copyOptional(name)) {
    copied++;
    console.log(`[backup] ${name}`);
  }
}

const certsDir = path.join(DATA_DIR, 'certs');
if (fs.existsSync(certsDir)) {
  const certDest = path.join(destDir, 'certs');
  fs.mkdirSync(certDest, { recursive: true });
  for (const f of fs.readdirSync(certsDir)) {
    if (f.endsWith('.pem')) {
      fs.copyFileSync(path.join(certsDir, f), path.join(certDest, f));
      console.log(`[backup] certs/${f}`);
      copied++;
    }
  }
}

const meta = {
  createdAt: new Date().toISOString(),
  dataDir: DATA_DIR,
  files: fs.readdirSync(destDir),
};
fs.writeFileSync(path.join(destDir, 'manifest.json'), JSON.stringify(meta, null, 2));

if (!fs.existsSync(path.join(DATA_DIR, 'finance.db'))) {
  console.warn('[backup] No finance.db yet — backup folder created for future use.');
}

console.log(`\n[backup] Saved ${copied} item(s) → ${destDir}`);
console.log('[backup] Restore with: npm run db:restore -- <folder-name>');
