#!/usr/bin/env node
/**
 * Generate a self-signed TLS certificate for local HTTPS (LAN use).
 * Output: backend/data/certs/key.pem, cert.pem
 *
 * Requires OpenSSL on PATH (Git for Windows includes it).
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../backend/data/certs');
const keyPath = path.join(outDir, 'key.pem');
const certPath = path.join(outDir, 'cert.pem');

const hostname = os.hostname();
const san = `DNS:localhost,DNS:${hostname},DNS:${hostname}.local,IP:127.0.0.1`;

fs.mkdirSync(outDir, { recursive: true });

const opensslCmd = [
  'openssl req -x509 -newkey rsa:2048',
  `-keyout "${keyPath}"`,
  `-out "${certPath}"`,
  '-days 825 -nodes',
  '-subj "/CN=FinanceOS Local/O=FinanceOS/C=EE"',
  `-addext "subjectAltName=${san}"`,
].join(' ');

try {
  execSync(opensslCmd, { stdio: 'inherit', shell: true });
  console.log('\nCertificates written to:');
  console.log(' ', certPath);
  console.log(' ', keyPath);
  console.log('\nEnable HTTPS in .env:');
  console.log('  HTTPS=true');
  console.log('  COOKIE_SECURE=true');
  console.log('\nBrowsers will warn about self-signed cert — accept for your LAN only.\n');
} catch (err) {
  console.error('OpenSSL failed. Install OpenSSL or use Git for Windows openssl.');
  console.error(err.message);
  process.exit(1);
}
