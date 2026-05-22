#!/usr/bin/env node
/**
 * Start backend and frontend for local development (single terminal).
 * Usage: npm run dev
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const isWin = process.platform === 'win32';
const backend = spawn(isWin ? 'npm.cmd' : 'npm', ['run', 'dev'], {
  cwd: path.join(ROOT, 'backend'),
  stdio: 'inherit',
  shell: isWin,
});

setTimeout(() => {
  const frontend = spawn(isWin ? 'npm.cmd' : 'npm', ['run', 'dev'], {
    cwd: path.join(ROOT, 'frontend'),
    stdio: 'inherit',
    shell: isWin,
  });
  frontend.on('exit', (code) => process.exit(code ?? 0));
}, 2500);

backend.on('exit', (code) => {
  if (code) process.exit(code);
});

process.on('SIGINT', () => {
  backend.kill('SIGINT');
  process.exit(0);
});

console.log('FinanceOS dev — backend starting, then frontend…');
console.log('  App: http://localhost:5173');
console.log('  API: http://localhost:3001/api/health\n');
