/**
 * Investment routes — multi-broker import, holdings, dividends, portfolio analytics.
 * Uses modular parser system: parsers/index.js detects broker automatically.
 */
const express = require('express');
const multer  = require('multer');
const { getDb }   = require('../db/database');
const { detect: detectBroker, parse: parseBrokerCSV, supportedBrokers } = require('../services/parsers');
const { computeHoldings } = require('../services/investmentHoldings');
const { buildPortfolioValuation } = require('../services/investmentValuation');
const { buildPortfolioAnalytics } = require('../services/investmentPortfolioAnalytics');
const {
  searchSecurities,
  bindFromSearchResult,
  clearBinding,
  getBinding,
  setManualQuantity,
  setManualAvgCostPerShare,
} = require('../services/investmentSecurities');
const { runPriceSync, isSyncRunning } = require('../services/investmentPriceSync');
const { commitInvestmentImport } = require('../services/investmentImporter');
const {
  listKnownBrokers,
  getAllBrokerCash,
  getBrokerCash,
  setBrokerCash,
  BROKER_LABELS,
} = require('../services/investmentBrokerCash');
const {
  loadInvestmentDedupSets,
  isDuplicateInvestmentTx,
} = require('../services/investmentDedup');
const logger = require('../services/logger');

const INVESTMENT_PREVIEW_LIMIT = 100;

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ── Broker info ───────────────────────────────────────────────────────────────

// GET /api/investments/brokers — list supported parsers
router.get('/brokers', (req, res) => {
  const db = getDb();
  const registered = db.prepare('SELECT * FROM investment_brokers ORDER BY name').all();
  res.json({ supported: supportedBrokers(), registered });
});

// GET /api/investments/detect — detect broker from uploaded file without parsing
router.post('/detect', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const detection = detectBroker(req.file.buffer);
    res.json({ filename: req.file.originalname, ...detection });
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

// ── Import ────────────────────────────────────────────────────────────────────

// POST /api/investments/preview
router.post('/preview', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const db = getDb();

    // Auto-detect and parse
    const detection = detectBroker(req.file.buffer);
    if (detection.broker === 'unknown' || detection.broker === 'lhv_bank') {
      return res.status(422).json({
        error: detection.broker === 'lhv_bank'
          ? 'This looks like an LHV bank account CSV. Use the Bank Import page instead.'
          : 'Could not detect broker format.',
        detection,
      });
    }

    const parsed = parseBrokerCSV(req.file.buffer);

    const dedupSets = loadInvestmentDedupSets(db);
    let newCount = 0;
    let dupCount = 0;
    const previewAll = parsed.transactions.map((tx) => {
      const isDuplicate = isDuplicateInvestmentTx(tx, dedupSets);
      if (isDuplicate) dupCount++;
      else newCount++;
      return { ...tx, isDuplicate };
    });

    res.json({
      filename:       req.file.originalname,
      broker:         parsed.broker,
      brokerName:     parsed.brokerName,
      parserVersion:  parsed.parserVersion,
      confidence:     parsed.confidence,
      detectionNotes: parsed.detectionNotes,
      accountId:      parsed.accountId ?? null,
      preview: previewAll.slice(0, INVESTMENT_PREVIEW_LIMIT),
      previewTruncated: previewAll.length > INVESTMENT_PREVIEW_LIMIT,
      totalRows: previewAll.length,
      errors:         parsed.errors,
      skipped:        parsed.skipped,
      warnings:       parsed.warnings ?? [],
      summary:        { ...parsed.summary, newCount, duplicateCount: dupCount },
    });
  } catch (err) {
    logger.error('[investments/preview]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/investments/commit
router.post('/commit', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const db = getDb();

    const result = commitInvestmentImport(req.file.buffer, req.file.originalname);

    logger.info(
      `[Investments/${result.brokerName}] ${req.file.originalname}: +${result.importedCount} new, ${result.duplicateCount} dupes`
    );

    res.json({
      historyId: result.historyId,
      broker: result.broker,
      brokerName: result.brokerName,
      importedCount: result.importedCount,
      duplicateCount: result.duplicateCount,
      errorCount: result.errorCount,
      skippedCount: result.skippedCount,
      summary: result.summary,
    });
  } catch (err) {
    logger.error('[investments/commit]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Import history ────────────────────────────────────────────────────────────

// GET /api/investments/history
router.get('/history', (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM investment_file_history ORDER BY created_at DESC'
  ).all();
  res.json(rows.map((r) => ({ ...r, warnings: JSON.parse(r.warnings || '[]') })));
});

// ── Transaction list ──────────────────────────────────────────────────────────

// GET /api/investments/transactions?broker=lightyear&type=Buy&ticker=VUSA&search=&hasNotes=
router.get('/transactions', (req, res) => {
  const db = getDb();
  const {
    page = 1, limit = 50,
    broker = '', type = '', ticker = '', dateFrom = '', dateTo = '',
    search = '',
    hasNotes = '',
    sortBy = 'date', sortDir = 'DESC',
  } = req.query;

  const conds = [];
  const params = [];
  if (broker)   { conds.push('broker = ?');    params.push(broker); }
  if (type)     { conds.push('type = ?');      params.push(type); }
  if (ticker)   { conds.push('ticker = ?');    params.push(ticker.toUpperCase()); }
  if (dateFrom) { conds.push('date >= ?');     params.push(dateFrom); }
  if (dateTo)   { conds.push('date <= ?');     params.push(dateTo); }
  if (search) {
    const s = `%${search}%`;
    conds.push(
      `(ticker LIKE ? OR IFNULL(isin,'') LIKE ? OR IFNULL(fund_name,'') LIKE ? OR IFNULL(raw_details,'') LIKE ? OR IFNULL(reference,'') LIKE ? OR IFNULL(notes,'') LIKE ?)`
    );
    params.push(s, s, s, s, s, s);
  }
  if (hasNotes === '1' || hasNotes === 'true') {
    conds.push("(notes IS NOT NULL AND TRIM(notes) != '')");
  }

  const where  = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const col    = ['date', 'ticker', 'net_amount', 'type', 'broker'].includes(sortBy) ? sortBy : 'date';
  const dir    = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const total = db.prepare(`SELECT COUNT(*) AS c FROM investment_transactions ${where}`).get(...params).c;
  const rows  = db.prepare(
    `SELECT * FROM investment_transactions ${where} ORDER BY ${col} ${dir} LIMIT ? OFFSET ?`
  ).all(...params, parseInt(limit), offset);

  res.json({ data: rows, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
});

// PATCH /api/investments/transactions/:id — update user note
router.patch('/transactions/:id', (req, res) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id, 10);
    const { notes } = req.body;
    if (notes === undefined) return res.status(400).json({ error: 'notes required' });

    const row = db.prepare('SELECT id FROM investment_transactions WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Not found' });

    db.prepare('UPDATE investment_transactions SET notes = ? WHERE id = ?').run(
      notes === null || notes === '' ? null : String(notes),
      id,
    );
    res.json(db.prepare('SELECT * FROM investment_transactions WHERE id = ?').get(id));
  } catch (err) {
    logger.error('[PATCH /investments/transactions/:id]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/investments/transactions/export/csv  (before other /transactions/* if any)
router.get('/transactions/export/csv', (_req, res) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT date, datetime, broker, type, ticker, isin, currency, net_amount, fee, tax_amount,
            quantity, price_per_share,
            COALESCE(fund_name,'') AS fund_name,
            COALESCE(raw_details,'') AS raw_details,
            COALESCE(reference,'') AS reference,
            COALESCE(notes,'') AS user_note
     FROM investment_transactions
     ORDER BY date DESC, id DESC`
  ).all();

  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const header = 'Date,DateTime,Broker,Type,Ticker,ISIN,CCY,Net Amount,Fee,Tax,Qty,Price Per Share,Fund,Details,Reference,User Note';
  const lines = rows.map((r) =>
    [
      r.date,
      r.datetime,
      r.broker,
      r.type,
      r.ticker ?? '',
      r.isin ?? '',
      r.currency,
      r.net_amount,
      r.fee ?? 0,
      r.tax_amount ?? 0,
      r.quantity ?? '',
      r.price_per_share ?? '',
      esc(r.fund_name),
      esc(r.raw_details),
      esc(r.reference),
      esc(r.user_note),
    ].join(',')
  );

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="investment-transactions.csv"');
  res.send([header, ...lines].join('\n'));
});

// ── Market prices & security bindings ─────────────────────────────────────────

// PUT /api/investments/holdings/avg-cost — manual avg cost per share (e.g. incomplete Swedbank CSV)
router.put('/holdings/avg-cost', async (req, res) => {
  try {
    const { broker, ticker, currency = 'EUR', avgCostPerShare } = req.body;
    if (!broker || !ticker) {
      return res.status(400).json({ error: 'broker and ticker required' });
    }
    const db = getDb();
    setManualAvgCostPerShare(db, { broker, ticker, currency, avgCostPerShare });
    res.json(await buildPortfolioValuation(db, req.query.broker || ''));
  } catch (err) {
    logger.error('[investments/holdings/avg-cost]', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/investments/holdings/quantity — manual units for fund holdings (e.g. Swedbank)
router.put('/holdings/quantity', async (req, res) => {
  try {
    const { broker, ticker, currency = 'EUR', quantity } = req.body;
    if (!broker || !ticker) {
      return res.status(400).json({ error: 'broker and ticker required' });
    }
    const db = getDb();
    setManualQuantity(db, { broker, ticker, currency, quantity });
    res.json(await buildPortfolioValuation(db, req.query.broker || ''));
  } catch (err) {
    logger.error('[investments/holdings/quantity]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/investments/broker-cash — per-broker uninvested cash
router.get('/broker-cash', (req, res) => {
  try {
    const db = getDb();
    const { broker = '' } = req.query;
    res.json({
      brokers: listKnownBrokers(db).map((key) => ({
        key,
        label: BROKER_LABELS[key] || key,
      })),
      rows: broker ? [getBrokerCash(db, broker)].filter(Boolean) : getAllBrokerCash(db),
    });
  } catch (err) {
    logger.error('[investments/broker-cash GET]', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/investments/broker-cash — set cash for one broker
router.put('/broker-cash', async (req, res) => {
  try {
    const { broker, amount, currency = 'EUR' } = req.body;
    if (!broker) return res.status(400).json({ error: 'broker is required' });
    if (amount == null || Number.isNaN(parseFloat(amount))) {
      return res.status(400).json({ error: 'amount is required' });
    }
    const db = getDb();
    const row = setBrokerCash(db, broker, amount, currency);
    const valuation = await buildPortfolioValuation(db, req.query.broker || broker);
    res.json({ row, valuation });
  } catch (err) {
    logger.error('[investments/broker-cash PUT]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/investments/valuations?broker=
router.get('/valuations', async (req, res) => {
  try {
    const db = getDb();
    const { broker = '' } = req.query;
    res.json(await buildPortfolioValuation(db, broker));
  } catch (err) {
    logger.error('[investments/valuations]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/investments/prices/sync-status
router.get('/prices/sync-status', (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare('SELECT * FROM investment_price_sync WHERE id = 1').get();
    res.json({
      ...(row || { status: 'idle', last_success_at: null, last_error: null }),
      running: isSyncRunning(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/investments/prices/sync — non-blocking background sync
router.post('/prices/sync', (req, res) => {
  if (isSyncRunning()) {
    return res.json({ ok: false, skipped: true, reason: 'sync already running' });
  }
  setImmediate(() => {
    runPriceSync().catch((e) => logger.warn(`[investments/prices/sync] ${e.message}`));
  });
  res.json({ ok: true, started: true });
});

// GET /api/investments/securities/search?q=
router.get('/securities/search', async (req, res) => {
  try {
    const { q = '' } = req.query;
    if (!String(q).trim()) return res.json({ results: [] });
    const results = await searchSecurities(String(q).trim(), 15);
    res.json({ results, query: String(q).trim() });
  } catch (err) {
    logger.error('[investments/securities/search]', err);
    const hint = err.message?.includes('certificate') || err.code === 'SELF_SIGNED_CERT_IN_CHAIN'
      ? ' Set YAHOO_TLS_RELAXED=true in the backend environment if you are behind a corporate proxy.'
      : '';
    res.status(502).json({ error: `${err.message}${hint}`, results: [] });
  }
});

// GET /api/investments/market-data/health — quick Yahoo connectivity check
router.get('/market-data/health', async (_req, res) => {
  try {
    const { searchSecurities: search } = require('../services/marketData/yahooProvider');
    const results = await search('AAPL', 3);
    res.json({
      ok: true,
      provider: 'yahoo-finance2',
      sampleCount: results.length,
      sample: results[0]?.providerSymbol ?? null,
    });
  } catch (err) {
    const hint = err.message?.includes('certificate') || err.code === 'SELF_SIGNED_CERT_IN_CHAIN'
      ? ' Try YAHOO_TLS_RELAXED=true'
      : '';
    res.status(502).json({ ok: false, error: err.message + hint });
  }
});

// GET /api/investments/bindings?broker=&ticker=&currency=
router.get('/bindings', (req, res) => {
  const { broker, ticker, currency = 'EUR' } = req.query;
  if (!broker || !ticker) return res.status(400).json({ error: 'broker and ticker required' });
  const db = getDb();
  res.json(getBinding(db, broker, ticker, currency) || null);
});

// PUT /api/investments/bindings — manual bind
router.put('/bindings', (req, res) => {
  try {
    const { broker, ticker, currency = 'EUR', isin, providerSymbol, name, exchange, quoteCurrency } = req.body;
    if (!broker || !ticker || !providerSymbol) {
      return res.status(400).json({ error: 'broker, ticker, providerSymbol required' });
    }
    const db = getDb();
    const result = bindFromSearchResult(db, {
      broker,
      ticker,
      currency,
      isin,
      providerSymbol,
      name,
      exchange,
      quoteCurrency,
    });
    setImmediate(() => {
      runPriceSync().catch((e) => logger.warn(`[investments/bindings] price sync: ${e.message}`));
    });
    res.json(result);
  } catch (err) {
    logger.error('[investments/bindings PUT]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/investments/bindings/clear-auto — remove all auto-created links (manual only going forward)
router.post('/bindings/clear-auto', (req, res) => {
  try {
    const db = getDb();
    const r = db.prepare(
      "DELETE FROM holding_security_bindings WHERE binding_source = 'auto'"
    ).run();
    res.json({ ok: true, removed: r.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/investments/bindings?broker=&ticker=&currency=
router.delete('/bindings', (req, res) => {
  try {
    const { broker, ticker, currency = 'EUR' } = req.query;
    if (!broker || !ticker) return res.status(400).json({ error: 'broker and ticker required' });
    const db = getDb();
    clearBinding(db, broker, ticker, currency);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Holdings (cross-broker) ───────────────────────────────────────────────────

router.get('/holdings', (req, res) => {
  const db = getDb();
  const { broker = '' } = req.query;
  res.json(computeHoldings(db, broker));
});

// ── Per-broker summary ────────────────────────────────────────────────────────

// GET /api/investments/broker-summary — one row per broker
router.get('/broker-summary', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      broker,
      SUM(CASE WHEN type='Deposit'    THEN net_amount ELSE 0 END) AS totalDeposited,
      SUM(CASE WHEN type='Withdrawal' THEN net_amount ELSE 0 END) AS totalWithdrawn,
      SUM(CASE WHEN type='Buy'        THEN net_amount ELSE 0 END) AS totalInvested,
      SUM(CASE WHEN type='Sell'       THEN net_amount ELSE 0 END) AS totalProceeds,
      SUM(CASE WHEN type='Dividend'   THEN net_amount ELSE 0 END) AS totalDividends,
      SUM(CASE WHEN type='Interest'   THEN net_amount ELSE 0 END) AS totalInterest,
      SUM(fee)                                                     AS totalFees,
      MIN(date) AS firstDate,
      MAX(date) AS lastDate,
      COUNT(*)  AS totalTransactions
    FROM investment_transactions
    GROUP BY broker
    ORDER BY totalInvested DESC
  `).all();

  const enriched = rows.map((r) => {
    const brokerHoldings = computeHoldings(db, r.broker);
    const openHoldings   = brokerHoldings.filter((h) => !h.fullyExited);
    const totalCostBasis = openHoldings.reduce((s, h) => s + h.totalCostBasis, 0);
    const realizedPnL    = (r.totalProceeds || 0) - (r.totalInvested || 0);
    const openPositions  = openHoldings.length;

    return { ...r, totalCostBasis, realizedPnL, openPositions };
  });

  res.json(enriched);
});

// ── Dividends ─────────────────────────────────────────────────────────────────

router.get('/dividends', (req, res) => {
  const db = getDb();
  const { broker = '' } = req.query;
  const where  = broker ? 'AND broker = ?' : '';
  const params = broker ? [broker] : [];

  const dividends = db.prepare(`SELECT * FROM investment_transactions WHERE type = 'Dividend' ${where} ORDER BY date DESC`).all(...params);
  const byTicker  = db.prepare(`
    SELECT broker, ticker, currency,
      COUNT(*) AS payments, SUM(net_amount) AS totalNet, SUM(tax_amount) AS totalTax,
      MIN(date) AS firstDate, MAX(date) AS lastDate
    FROM investment_transactions WHERE type = 'Dividend' AND ticker IS NOT NULL ${where}
    GROUP BY broker, ticker ORDER BY totalNet DESC
  `).all(...params);
  const byYear = db.prepare(`
    SELECT broker, strftime('%Y', date) AS year, SUM(net_amount) AS totalNet, COUNT(*) AS payments
    FROM investment_transactions WHERE type = 'Dividend' ${where}
    GROUP BY broker, year ORDER BY year DESC
  `).all(...params);

  res.json({ dividends, byTicker, byYear });
});

// GET /api/investments/analytics — portfolio overview, allocations, performance, insights
router.get('/analytics', async (req, res) => {
  try {
    const db = getDb();
    const { broker = '', period = '1Y' } = req.query;
    const data = await buildPortfolioAnalytics(db, { broker, period });
    res.json(data);
  } catch (err) {
    logger.error('[investments/analytics]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Portfolio summary (consolidated) ──────────────────────────────────────────

router.get('/summary', (req, res) => {
  const db = getDb();
  const { broker = '' } = req.query;
  const where  = broker ? 'WHERE broker = ?' : '';
  const params = broker ? [broker] : [];

  const totals = db.prepare(`
    SELECT
      SUM(CASE WHEN type='Deposit'    THEN net_amount ELSE 0 END) AS totalDeposited,
      SUM(CASE WHEN type='Withdrawal' THEN net_amount ELSE 0 END) AS totalWithdrawn,
      SUM(CASE WHEN type='Buy'        THEN net_amount ELSE 0 END) AS totalInvested,
      SUM(CASE WHEN type='Sell'       THEN net_amount ELSE 0 END) AS totalProceeds,
      SUM(CASE WHEN type='Dividend'   THEN net_amount ELSE 0 END) AS totalDividends,
      SUM(CASE WHEN type='Interest'   THEN net_amount ELSE 0 END) AS totalInterest,
      SUM(fee)                                                     AS totalFees,
      SUM(tax_amount)                                              AS totalTax,
      MIN(date) AS firstDate, MAX(date) AS lastDate, COUNT(*) AS totalTransactions
    FROM investment_transactions ${where}
  `).get(...params);

  // Use computeHoldings so open-position detection is consistent across all endpoints
  // (handles both qty-based LightYear and amount-based Swedbank fund positions)
  const allHoldings    = computeHoldings(db, broker);
  const openHoldings   = allHoldings.filter((h) => !h.fullyExited);
  const totalCostBasis = openHoldings.reduce((s, h) => s + h.totalCostBasis, 0);
  const realizedPnL    = (totals.totalProceeds || 0) - (totals.totalInvested || 0) + (totals.totalDividends || 0);

  res.json({ ...totals, totalCostBasis, realizedPnL, openPositions: openHoldings.length });
});

// GET /api/investments/activity
router.get('/activity', (req, res) => {
  const db = getDb();
  const { broker = '', months = 24 } = req.query;
  const where  = broker ? 'WHERE broker = ?' : '';
  const params = broker ? [broker] : [];

  const rows = db.prepare(`
    SELECT
      broker,
      strftime('%Y-%m', date) AS month,
      SUM(CASE WHEN type='Buy'      THEN net_amount ELSE 0 END) AS bought,
      SUM(CASE WHEN type='Sell'     THEN net_amount ELSE 0 END) AS sold,
      SUM(CASE WHEN type='Dividend' THEN net_amount ELSE 0 END) AS dividends,
      SUM(CASE WHEN type='Deposit'  THEN net_amount ELSE 0 END) AS deposited
    FROM investment_transactions ${where}
    GROUP BY broker, month
    ORDER BY month DESC
    LIMIT ?
  `).all(...params, Math.min(parseInt(months), 60) * (broker ? 1 : 2));

  res.json(rows.reverse());
});

// GET /api/investments/tickers
router.get('/tickers', (req, res) => {
  const db = getDb();
  const { broker = '' } = req.query;
  const where  = broker ? 'WHERE broker = ? AND' : 'WHERE';
  const params = broker ? [broker] : [];

  const rows = db.prepare(`
    SELECT DISTINCT broker, ticker, isin, fund_name, currency, COUNT(*) AS txCount
    FROM investment_transactions ${where} ticker IS NOT NULL AND ticker != ''
    GROUP BY broker, ticker ORDER BY broker, ticker
  `).all(...params);
  res.json(rows);
});

module.exports = router;
