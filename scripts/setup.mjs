#!/usr/bin/env node
/**
 * First-time setup: install dependencies and create local .env if missing.
 * Usage: npm run setup
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const depsOnly = process.argv.includes('--deps-only');

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function copyEnvIfMissing() {
  const src = path.join(ROOT, '.env.example');
  const dest = path.join(ROOT, '.env');
  if (!fs.existsSync(src)) return;
  if (fs.existsSync(dest)) {
    console.log('[setup] .env already exists — left unchanged');
    return;
  }
  fs.copyFileSync(src, dest);
  console.log('[setup] Created .env from .env.example');
}

function ensureDirs() {
  for (const dir of [
    path.join(ROOT, 'backend', 'data'),
    path.join(ROOT, 'backend', 'data', 'certs'),
    path.join(ROOT, 'backend', 'logs'),
    path.join(ROOT, 'backend', 'data', 'backups'),
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

console.log('FinanceOS setup\n');

ensureDirs();

console.log('[setup] Installing backend dependencies…');
run('npm', ['install'], path.join(ROOT, 'backend'));

console.log('[setup] Installing frontend dependencies…');
run('npm', ['install'], path.join(ROOT, 'frontend'));

if (!depsOnly) {
  copyEnvIfMissing();
  const feExample = path.join(ROOT, 'frontend', '.env.local.example');
  const feLocal = path.join(ROOT, 'frontend', '.env.local');
  if (fs.existsSync(feExample) && !fs.existsSync(feLocal)) {
    console.log('[setup] Tip: for LAN dev on another device, copy frontend/.env.local.example → .env.local');
  }
  console.log('\n[setup] Done. Next steps:');
  console.log('  npm run dev          — start backend + frontend');
  console.log('  npm run db:migrate   — apply DB migrations (also runs on server start)');
  console.log('  See docs/GETTING-STARTED.md');
}
