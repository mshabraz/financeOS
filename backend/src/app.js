/**
 * Express application factory (HTTP/HTTPS server created in index.js).
 */

const path = require('path');
const express = require('express');
const morgan = require('morgan');
const session = require('express-session');

const config = require('./config');
const { createCorsMiddleware } = require('./middleware/cors');
const { requireAuth } = require('./middleware/auth');
const { attachUserContext } = require('./middleware/userContext');
const { requireAdmin } = require('./middleware/requireAdmin');
const logger = require('./services/logger');

const authRoutes        = require('./routes/auth');
const adminRoutes       = require('./routes/admin');
const networkRoutes     = require('./routes/network');
const importRoutes      = require('./routes/import');
const transactionRoutes = require('./routes/transactions');
const categoryRoutes    = require('./routes/categories');
const dashboardRoutes   = require('./routes/dashboard');
const tagRoutes         = require('./routes/tags');
const investmentRoutes  = require('./routes/investments');
const revolutRoutes     = require('./routes/revolut');
const sharedExpensesRoutes = require('./routes/sharedExpenses');
const wealthGoalsRoutes    = require('./routes/wealthGoals');
const obligationsRoutes    = require('./routes/obligations');
const tasksRoutes          = require('./routes/tasks');
const settingsRoutes       = require('./routes/settings');

function createApp() {
  const app = express();

  // Trust X-Forwarded-* when behind reverse proxy (Docker, Cloudflare tunnel)
  if (process.env.TRUST_PROXY === 'true' || config.LAN_MODE) {
    app.set('trust proxy', 1);
  }

  app.use(createCorsMiddleware());
  app.use(express.json({ limit: '10mb' }));
  app.use(morgan(config.LAN_MODE ? 'combined' : 'dev'));

  app.use(
    session({
      name: 'financeos.sid',
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: config.COOKIE_SECURE,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );

  // Public routes (no session required)
  app.use('/api/auth', authRoutes);
  app.use('/api/network', networkRoutes);

  app.get('/api/health', async (req, res) => {
    try {
      const userRegistry = require('./services/userRegistry');
      const payload = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        lanMode: config.LAN_MODE,
        authRequired: config.AUTH_ENABLED && !req.session?.authenticated,
        userCount: userRegistry.hasUsers() ? userRegistry.listUsers().length : 0,
        sharedExpensesApi: true,
      };

      if (req.session?.userId) {
        const { openUserDatabase } = require('./db/database');
        const db = openUserDatabase(req.session.userId);
        const row = db.prepare('SELECT COUNT(*) as count FROM transactions').get();
        payload.transactions = row?.count ?? 0;
      }

      if (req.session?.authenticated && req.session?.userId) {
        try {
          const { searchSecurities } = require('./services/marketData/yahooProvider');
          const hits = await searchSecurities('AAPL', 2);
          payload.yahoo = {
            ok: true,
            provider: 'yahoo-finance2',
            sampleCount: hits.length,
            sample: hits[0]?.providerSymbol ?? null,
          };
        } catch (err) {
          const hint =
            err.message?.includes('certificate') || err.code === 'SELF_SIGNED_CERT_IN_CHAIN'
              ? ' Set YAHOO_TLS_RELAXED=true on the backend.'
              : '';
          payload.yahoo = { ok: false, error: `${err.message}${hint}` };
        }
      }

      res.json(payload);
    } catch (err) {
      res.status(503).json({ status: 'starting', error: err.message });
    }
  });

  // Protected API
  app.use('/api', requireAuth);
  app.use('/api', attachUserContext);
  app.use('/api/admin', requireAdmin, adminRoutes);
  app.use('/api/import', importRoutes);
  app.use('/api/transactions', transactionRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/tags', tagRoutes);
  app.use('/api/investments', investmentRoutes);
  app.use('/api/revolut', revolutRoutes);
  app.use('/api/shared', sharedExpensesRoutes);
  app.use('/api/wealth-goals', wealthGoalsRoutes);
  app.use('/api/obligations', obligationsRoutes);
  app.use('/api/tasks', tasksRoutes);
  app.use('/api/settings', settingsRoutes);

  // Serve built React app when dist exists (LAN / production)
  const fs = require('fs');
  const distPath = path.join(config.ROOT, 'frontend', 'dist');
  const indexHtml = path.join(distPath, 'index.html');
  const serveUi = config.SERVE_FRONTEND || fs.existsSync(indexHtml);

  if (serveUi && fs.existsSync(indexHtml)) {
    logger.info(`[UI] Serving frontend from ${distPath}`);
    app.use(express.static(distPath, { maxAge: config.LAN_MODE ? '1h' : 0, index: false }));
    const sendIndex = (_req, res) => res.sendFile(indexHtml);
    app.get('/', sendIndex);
    app.get(/^\/(?!api(?:\/|$)).*$/, sendIndex);
  } else if (config.SERVE_FRONTEND) {
    logger.error(`[UI] Missing ${indexHtml} — run START-LAN.bat to build the frontend`);
    app.get('/', (req, res) => {
      res.status(503).type('text/html').send(
        '<h1>FinanceOS</h1><p>Frontend not built yet.</p><p>Double-click <b>START-LAN.bat</b> and wait for the build to finish.</p>'
      );
    });
  }

  app.use((err, req, res, _next) => {
    if (err.message?.startsWith('CORS blocked')) {
      return res.status(403).json({ error: err.message });
    }
    logger.error(err.message, { stack: err.stack });
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
