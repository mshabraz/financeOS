#!/usr/bin/env node
/**
 * Lightweight smoke test — no external test framework required.
 * Usage: npm test
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

let passed = 0;
let failed = 0;

function ok(name) {
  passed++;
  console.log(`  ✓ ${name}`);
}

function fail(name, detail) {
  failed++;
  console.error(`  ✗ ${name}${detail ? `: ${detail}` : ''}`);
}

// Required project files
const required = [
  'backend/src/index.js',
  'backend/src/db/schema.js',
  'frontend/package.json',
  '.env.example',
  '.gitignore',
];

console.log('FinanceOS smoke tests\n');

for (const rel of required) {
  const p = path.join(ROOT, rel);
  if (fs.existsSync(p)) ok(rel);
  else fail(rel, 'missing');
}

// Schema exports migrations runner
try {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const schema = require(path.join(ROOT, 'backend', 'src', 'db', 'schema.js'));
  if (typeof schema.runMigrations === 'function') ok('runMigrations exported');
  else fail('runMigrations exported');
} catch (e) {
  fail('schema.js load', e.message);
}

console.log(`\nSmoke: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

console.log('\n---\n');
const { spawnSync } = await import('node:child_process');
const auditRun = spawnSync(process.execPath, [path.join(__dirname, 'audit-tests.mjs')], {
  cwd: ROOT,
  stdio: 'inherit',
});
process.exit(auditRun.status ?? 1);
