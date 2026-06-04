/**
 * Finance Manager — Express API server
 * Local-only: bind 0.0.0.0 for LAN, optional HTTPS, session auth.
 */

// START-LAN.bat passes --lan (must run before any module loads config)
if (process.argv.includes('--lan')) {
  process.env.HOST = '0.0.0.0';
  process.env.PORT = process.env.PORT || '3001';
  process.env.LAN_MODE = 'true';
  process.env.AUTH_ENABLED = process.env.AUTH_ENABLED || 'true';
  process.env.SERVE_FRONTEND = 'true';
}

const fs   = require('fs');
const http = require('http');
const https = require('https');

const { initDb } = require('./db/database');
const { createApp } = require('./app');
const config = require('./config');
const userRegistry = require('./services/userRegistry');
const { getLanUrls, getPrimaryLanIp, hostname } = require('./services/networkInfo');
const logger = require('./services/logger');

async function startMdns() {
  if (process.env.MDNS_ENABLED !== 'true') return;
  try {
    const { Bonjour } = require('bonjour-service');
    const bonjour = new Bonjour();
    bonjour.publish({
      name: `FinanceOS on ${hostname()}`,
      type: 'http',
      port: config.PORT,
      txt: { app: 'FinanceOS', path: '/' },
    });
    logger.info('[mDNS] Published HTTP service (Bonjour/Zeroconf) — optional discovery on local network');
    return bonjour;
  } catch (err) {
    logger.warn(`[mDNS] Skipped: ${err.message}`);
  }
}

function createServer(app) {
  if (config.HTTPS_ENABLED) {
    if (!fs.existsSync(config.TLS_KEY_PATH) || !fs.existsSync(config.TLS_CERT_PATH)) {
      throw new Error(
        `HTTPS enabled but certificates not found.\n` +
        `  Run: node scripts/generate-certs.mjs\n` +
        `  Or set TLS_KEY_PATH / TLS_CERT_PATH in .env`
      );
    }
    return https.createServer(
      {
        key: fs.readFileSync(config.TLS_KEY_PATH),
        cert: fs.readFileSync(config.TLS_CERT_PATH),
      },
      app
    );
  }
  return http.createServer(app);
}

function printStartupBanner(scheme) {
  const port = config.PORT;
  const urls = getLanUrls({ port: config.SERVE_FRONTEND ? port : config.FRONTEND_PORT, https: config.HTTPS_ENABLED });

  console.log('\n  ╔══════════════════════════════════════════════════╗');
  console.log('  ║           FinanceOS — Local Finance Manager       ║');
  console.log('  ╚══════════════════════════════════════════════════╝\n');
  console.log(`  Mode:     ${config.LAN_MODE ? 'LAN (0.0.0.0)' : 'Local only'}`);
  console.log(`  API:      ${scheme}://0.0.0.0:${port}/api/health`);
  if (config.SERVE_FRONTEND) {
    console.log(`  App UI:   ${scheme}://0.0.0.0:${port}  (single port — recommended for phones)\n`);
  } else {
    console.log(`  Frontend: ${scheme}://0.0.0.0:${config.FRONTEND_PORT}  (run npm run dev in frontend/)\n`);
  }

  if (config.AUTH_ENABLED) {
    if (!userRegistry.hasUsers()) {
      console.log('  ⚠  First visit: open the app URL and register an admin account.\n');
    } else {
      console.log('  🔒  Authentication enabled — sign in required on other devices.\n');
    }
  }

  console.log('  Access from other devices on your Wi‑Fi:\n');
  for (const { label, url } of urls) {
    const display = config.SERVE_FRONTEND ? url.replace(/:\d+$/, `:${port}`) : url;
    console.log(`    • ${label}`);
    console.log(`      ${display}`);
  }
  console.log('\n  Phone URL also in OPEN-ON-YOUR-PHONE.txt\n');

  try {
    const lanIp = getPrimaryLanIp();
    const primary = lanIp
      ? { url: `${scheme}://${lanIp}:${port}` }
      : urls.find((u) => /192\.168\.|10\./.test(u.url) && !u.url.includes('localhost'));
    const fs = require('fs');
    const path = require('path');
    const lines = [
      'FinanceOS — open on another device (same Wi-Fi)',
      '',
      primary ? `  Phone / tablet / other PC:\n\n    ${primary.url.replace(/:\d+$/, `:${port}`)}\n` : '',
      '  On this computer:\n',
      `    ${scheme}://localhost:${port}`,
      '',
      '  First visit: register an account (stored only on this server).',
      '  Keep START-LAN.bat open while using the app.',
      '',
    ].filter(Boolean);
    fs.writeFileSync(path.join(config.ROOT, 'OPEN-ON-YOUR-PHONE.txt'), lines.join('\n'), 'utf8');
  } catch {
    /* optional helper file */
  }
}

async function main() {
  await initDb();

  const { startPriceSyncScheduler } = require('./services/investmentPriceSync');
  startPriceSyncScheduler();

  if (process.env.YAHOO_TLS_RELAXED === 'true') {
    logger.info('[market] YAHOO_TLS_RELAXED=true — TLS certificate verification disabled for Yahoo API');
  }

  const app = createApp();
  const server = createServer(app);
  const scheme = config.HTTPS_ENABLED ? 'https' : 'http';

  await startMdns();

  server.listen(config.PORT, config.HOST, () => {
    logger.info(`[Server] ${scheme}://${config.HOST}:${config.PORT}`);
    if (config.LAN_MODE) {
      const lanIp = getPrimaryLanIp();
      if (lanIp) logger.info(`[LAN] http://${lanIp}:${config.PORT}/`);
    }
    printStartupBanner(scheme);
  });
}

main().catch((err) => {
  console.error('[Startup error]', err);
  process.exit(1);
});
