/**
 * Yahoo Finance via yahoo-finance2 (handles cookies, crumb, and API changes).
 * Set YAHOO_TLS_RELAXED=true if a corporate proxy uses a custom TLS certificate.
 */

const YahooFinance = require('yahoo-finance2').default;

const PROVIDER_ID = 'yahoo';

const YAHOO_QUOTE_TYPES = new Set([
  'EQUITY',
  'ETF',
  'MUTUALFUND',
  'INDEX',
  'CURRENCY',
  'FUTURE',
  'MONEY_MARKET',
  'OPTION',
  'CRYPTOCURRENCY',
]);

let client = null;
let tlsRelaxedActive = false;

/** Walk error.cause chain (Node fetch wraps cert errors as "fetch failed"). */
function formatFetchError(err) {
  const parts = [];
  let e = err;
  let depth = 0;
  while (e && depth < 5) {
    if (e.message && !parts.includes(e.message)) parts.push(e.message);
    if (e.code) parts.push(`[${e.code}]`);
    e = e.cause;
    depth += 1;
  }
  return parts.join(' → ') || 'Unknown error';
}

function isTlsCertError(err) {
  let e = err;
  let depth = 0;
  while (e && depth < 6) {
    const code = e.code;
    const msg = String(e.message || '').toLowerCase();
    if (
      code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
      code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
      code === 'CERT_HAS_EXPIRED' ||
      msg.includes('certificate') ||
      msg.includes('self-signed') ||
      msg.includes('unable to verify')
    ) {
      return true;
    }
    e = e.cause;
    depth += 1;
  }
  return false;
}

function shouldUseRelaxedTls() {
  return process.env.YAHOO_TLS_RELAXED === 'true' || tlsRelaxedActive;
}

function createRelaxedFetch() {
  const { Agent, fetch: undiciFetch } = require('undici');
  const dispatcher = new Agent({
    connect: { rejectUnauthorized: false },
  });
  return (url, init) => undiciFetch(url, { ...init, dispatcher });
}

function getClient() {
  if (client) return client;

  const opts = {
    suppressNotices: ['yahooSurvey', 'ripHistorical'],
  };

  if (shouldUseRelaxedTls()) {
    opts.fetch = createRelaxedFetch();
  }

  client = new YahooFinance(opts);
  return client;
}

function resetClient() {
  client = null;
}

function enableRelaxedTls() {
  if (tlsRelaxedActive) return;
  tlsRelaxedActive = true;
  resetClient();
  try {
    const logger = require('../logger'); // services/logger.js
    logger.warn(
      '[market] Corporate TLS detected — using relaxed Yahoo API TLS (set YAHOO_TLS_RELAXED=true to skip auto-detect)'
    );
  } catch {
    /* ignore */
  }
}

async function withYahooRetry(fn) {
  try {
    return await fn(getClient());
  } catch (err) {
    if (!shouldUseRelaxedTls() && isTlsCertError(err)) {
      enableRelaxedTls();
      try {
        return await fn(getClient());
      } catch (retryErr) {
        const detail = formatFetchError(retryErr);
        const wrapped = new Error(detail);
        wrapped.code = retryErr.code || retryErr.cause?.code;
        throw wrapped;
      }
    }
    const detail = formatFetchError(err);
    const wrapped = new Error(
      isTlsCertError(err)
        ? `${detail} — try setting YAHOO_TLS_RELAXED=true on the backend`
        : detail
    );
    wrapped.code = err.code || err.cause?.code;
    throw wrapped;
  }
}

function normalizeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

function mapSearchQuote(x) {
  if (!x?.symbol) return null;
  if (x.isYahooFinance === false) return null;

  const quoteType = x.quoteType || (x.typeDisp ? String(x.typeDisp).toUpperCase() : null) || 'UNKNOWN';
  if (x.quoteType && !YAHOO_QUOTE_TYPES.has(x.quoteType)) return null;

  return {
    provider: PROVIDER_ID,
    providerSymbol: x.symbol,
    symbol: normalizeSymbol(String(x.symbol).split('.')[0] || x.symbol),
    name: x.shortname || x.longname || x.symbol,
    exchange: x.exchange || x.exchDisp || null,
    currency: (x.currency || 'USD').toUpperCase(),
    quoteType,
    isin: null,
    score: quoteType === 'ETF' ? 0.9 : 0.7,
  };
}

async function searchSecurities(query, limit = 15) {
  const q = String(query || '').trim();
  if (!q) return [];

  const searchOpts = {
    quotesCount: limit,
    newsCount: 0,
    enableFuzzyQuery: true,
    region: 'US',
  };

  let data;
  try {
    data = await withYahooRetry((yf) => yf.search(q, searchOpts));
  } catch (err) {
    // Yahoo frequently changes search payload shape; retry without strict schema validation.
    if (!/schema validation/i.test(String(err.message || ''))) throw err;
    data = await withYahooRetry((yf) => yf.search(q, searchOpts, { validateResult: false }));
  }

  const quotes = data?.quotes || [];
  const mapped = quotes.map(mapSearchQuote).filter(Boolean);

  const seen = new Set();
  return mapped.filter((m) => {
    if (seen.has(m.providerSymbol)) return false;
    seen.add(m.providerSymbol);
    return true;
  });
}

/** LSE quotes are often in pence (GBp) — store major units, no FX conversion. */
function normalizePriceCurrency(price, currencyRaw) {
  const p = Number(price);
  if (price == null || Number.isNaN(p)) return null;

  const raw = currencyRaw || 'USD';
  if (raw === 'GBp' || raw === 'GBX') {
    return { price: p / 100, currency: 'GBP' };
  }
  return { price: p, currency: String(raw).toUpperCase() };
}

async function fetchQuoteFromChart(sym) {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  const chart = await withYahooRetry((yf) =>
    yf.chart(sym, {
      period1: start,
      period2: end,
      interval: '1d',
    })
  );

  const meta = chart?.meta;
  if (!meta) return null;

  const rawPrice =
    meta.regularMarketPrice ??
    meta.previousClose ??
    meta.chartPreviousClose;
  const normalized = normalizePriceCurrency(rawPrice, meta.currency);
  if (!normalized) return null;

  const prev = meta.chartPreviousClose ?? meta.previousClose;
  const price = normalized.price;
  let changeAmount = null;
  let changePercent = null;
  if (prev != null && price != null) {
    const prevNorm = normalizePriceCurrency(prev, meta.currency);
    const prevPrice = prevNorm?.price ?? prev;
    changeAmount = price - prevPrice;
    if (prevPrice > 0) changePercent = (changeAmount / prevPrice) * 100;
  }

  return {
    price,
    currency: normalized.currency,
    providerSymbol: meta.symbol || sym,
    marketTime: meta.regularMarketTime
      ? new Date(meta.regularMarketTime).toISOString()
      : new Date().toISOString(),
    previousClose: prev != null ? (normalizePriceCurrency(prev, meta.currency)?.price ?? prev) : null,
    changeAmount,
    changePercent,
    dividendYield: null,
    quoteType: meta.instrumentType || null,
  };
}

async function fetchQuoteFromQuoteApi(sym) {
  const q = await withYahooRetry((yf) => yf.quote(sym, {}, { validateResult: false }));
  const row = Array.isArray(q) ? q[0] : q;
  if (!row) return null;

  const rawPrice =
    row.regularMarketPrice ?? row.postMarketPrice ?? row.preMarketPrice;
  const normalized = normalizePriceCurrency(rawPrice, row.currency);
  if (!normalized) return null;

  const prev = row.regularMarketPreviousClose ?? row.previousClose;
  const change = row.regularMarketChange;
  const changePct = row.regularMarketChangePercent;
  const divYield = row.trailingAnnualDividendYield ?? row.dividendYield;

  return {
    price: normalized.price,
    currency: normalized.currency,
    providerSymbol: row.symbol || sym,
    marketTime: new Date().toISOString(),
    previousClose: prev != null ? normalizePriceCurrency(prev, row.currency)?.price ?? prev : null,
    changeAmount: change != null ? normalizePriceCurrency(change, row.currency)?.price ?? change : null,
    changePercent: changePct != null ? Number(changePct) : null,
    dividendYield: divYield != null ? Number(divYield) : null,
    quoteType: row.quoteType || null,
  };
}

/**
 * @returns {Promise<{ price, currency, providerSymbol } | null>}
 */
async function fetchQuote(providerSymbol) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return null;

  try {
    const fromChart = await fetchQuoteFromChart(sym);
    if (fromChart) return fromChart;
  } catch (err) {
    const msg = formatFetchError(err);
    if (!/no data found|delisted/i.test(msg)) {
      try {
        return await fetchQuoteFromQuoteApi(sym);
      } catch {
        throw err;
      }
    }
  }

  try {
    return await fetchQuoteFromQuoteApi(sym);
  } catch {
    return null;
  }
}

function symbolCandidates(ticker, isin, currency) {
  const t = normalizeSymbol(ticker);
  const ccy = (currency || 'EUR').toUpperCase();
  const candidates = new Set();
  if (t) candidates.add(t);
  if (isin) candidates.add(String(isin).trim().toUpperCase());

  if (t && !t.includes('.')) {
    if (ccy === 'EUR' || ccy === 'GBP') candidates.add(`${t}.L`);
    if (ccy === 'EUR') {
      candidates.add(`${t}.DE`);
      candidates.add(`${t}.AS`);
      candidates.add(`${t}.PA`);
      candidates.add(`${t}.IR`);
    }
    if (ccy === 'USD') candidates.add(t);
    if (ccy === 'GBP') candidates.add(`${t}.L`);
  }
  return [...candidates];
}

async function resolveAndQuote({ ticker, isin, currency }) {
  const candidates = symbolCandidates(ticker, isin, currency);

  for (const sym of candidates) {
    try {
      const quote = await fetchQuote(sym);
      if (quote) return { ...quote, matchedVia: sym };
    } catch {
      /* try next */
    }
  }

  const searchQuery = isin || ticker;
  if (searchQuery) {
    try {
      const hits = await searchSecurities(searchQuery, 10);
      const tUp = normalizeSymbol(ticker);
      const exact = hits.find(
        (h) =>
          normalizeSymbol(h.symbol) === tUp ||
          normalizeSymbol(h.providerSymbol?.split('.')[0]) === tUp
      );
      const pick = exact || hits[0];
      if (pick?.providerSymbol) {
        const quote = await fetchQuote(pick.providerSymbol);
        if (quote) {
          return {
            ...quote,
            name: pick.name,
            exchange: pick.exchange,
            matchedVia: pick.providerSymbol,
          };
        }
      }
    } catch {
      /* ignore */
    }
  }

  return null;
}

const COUNTRY_REGION = {
  US: 'North America',
  USA: 'North America',
  CA: 'North America',
  GB: 'Europe',
  UK: 'Europe',
  DE: 'Europe',
  FR: 'Europe',
  IE: 'Europe',
  NL: 'Europe',
  ES: 'Europe',
  IT: 'Europe',
  EE: 'Europe',
  FI: 'Europe',
  SE: 'Europe',
  NO: 'Europe',
  DK: 'Europe',
  CH: 'Europe',
  JP: 'Asia Pacific',
  CN: 'Asia Pacific',
  HK: 'Asia Pacific',
  AU: 'Asia Pacific',
  SG: 'Asia Pacific',
  IN: 'Asia Pacific',
};

function mapCountryToRegion(country) {
  if (!country) return null;
  const key = String(country).trim().toUpperCase();
  if (COUNTRY_REGION[key]) return COUNTRY_REGION[key];
  if (key.includes('UNITED STATES')) return 'North America';
  if (key.includes('UNITED KINGDOM')) return 'Europe';
  return null;
}

function mapQuoteTypeToAssetClass(quoteType) {
  const t = String(quoteType || '').toUpperCase();
  if (t === 'ETF') return 'ETF';
  if (t === 'MUTUALFUND' || t === 'MONEY_MARKET') return 'Fund';
  if (t === 'EQUITY') return 'Stock';
  if (t === 'INDEX') return 'Index';
  return 'Other';
}

/**
 * Sector, industry, country — cached on market_securities during price sync.
 */
async function fetchSecurityMetadata(providerSymbol) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return null;

  try {
    const data = await withYahooRetry((yf) =>
      yf.quoteSummary(
        sym,
        {
          modules: [
            'assetProfile',
            'summaryProfile',
            'price',
            'fundProfile',
            'defaultKeyStatistics',
            'summaryDetail',
          ],
        },
        { validateResult: false }
      )
    );
    const asset = data?.assetProfile || {};
    const summary = data?.summaryProfile || {};
    const fund = data?.fundProfile || {};
    const price = data?.price || {};
    const stats = data?.defaultKeyStatistics || {};
    const detail = data?.summaryDetail || {};

    const profile = { ...summary, ...asset };
    const country =
      asset.country ||
      summary.country ||
      fund.domicile ||
      null;

    const sector =
      asset.sector ||
      asset.sectorDisp ||
      fund.category ||
      fund.categoryName ||
      summary.sector ||
      summary.sectorDisp ||
      (fund.fundName || detail.category ? 'Diversified ETF' : null);

    const industry =
      asset.industry ||
      asset.industryDisp ||
      summary.industry ||
      summary.industryDisp ||
      null;

    const quoteType =
      price.quoteType ||
      profile.quoteType ||
      fund.quoteType ||
      stats.quoteType;

    return {
      sector: sector || null,
      industry: industry || null,
      country,
      region: mapCountryToRegion(country),
      assetClass: mapQuoteTypeToAssetClass(quoteType),
      dividendYield:
        price.trailingAnnualDividendYield != null
          ? Number(price.trailingAnnualDividendYield)
          : stats.yield != null
            ? Number(stats.yield)
            : null,
    };
  } catch {
    return null;
  }
}

const SECTOR_KEY_LABELS = {
  realestate: 'Real Estate',
  consumer_cyclical: 'Consumer Discretionary',
  consumer_defensive: 'Consumer Essentials',
  basic_materials: 'Basic Materials',
  technology: 'Software & Cloud Services',
  communication_services: 'Communication Services',
  financial_services: 'Finance',
  utilities: 'Utilities',
  industrials: 'Industrials',
  energy: 'Energy',
  healthcare: 'Health',
};

function formatSectorKey(key) {
  return (
    SECTOR_KEY_LABELS[key] ||
    String(key)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function holdingPercentToPct(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n <= 1 ? n * 100 : n;
}

function guessCountryFromHoldingSymbol(symbol) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) return null;
  if (sym.endsWith('.L')) return 'United Kingdom';
  if (sym.endsWith('.DE') || sym.endsWith('.XETRA')) return 'Germany';
  if (sym.endsWith('.PA')) return 'France';
  if (sym.endsWith('.AS')) return 'Netherlands';
  if (sym.endsWith('.SW') || sym.endsWith('.SWX')) return 'Switzerland';
  if (sym.endsWith('.ST')) return 'Sweden';
  if (sym.endsWith('.HE')) return 'Finland';
  if (sym.endsWith('.TO')) return 'Canada';
  if (sym.endsWith('.HK')) return 'Hong Kong';
  if (sym.endsWith('.T') && sym.length <= 5) return 'Japan';
  if (sym.endsWith('.KS')) return 'South Korea';
  if (sym.endsWith('.AX')) return 'Australia';
  if (sym.endsWith('.MI')) return 'Italy';
  if (sym.endsWith('.MC')) return 'Spain';
  if (sym.endsWith('.SI')) return 'Singapore';
  if (!sym.includes('.')) return 'United States';
  return null;
}

function normalizeCountryLabel(country) {
  if (!country) return null;
  const c = String(country).trim();
  const lower = c.toLowerCase();
  const map = {
    'united states': 'United States',
    usa: 'United States',
    us: 'United States',
    'united kingdom': 'United Kingdom',
    uk: 'United Kingdom',
    'great britain': 'United Kingdom',
    'south korea': 'South Korea',
    korea: 'South Korea',
    'republic of korea': 'South Korea',
    china: 'China',
    'hong kong': 'Hong Kong',
    taiwan: 'Taiwan',
    india: 'India',
    brazil: 'Brazil',
    japan: 'Japan',
    ireland: 'Ireland',
    luxembourg: 'Luxembourg',
  };
  return map[lower] || c.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function fundSymbolVariants(sym) {
  const s = String(sym || '').trim();
  if (!s) return [];
  const out = new Set([s]);
  const base = s.includes('.') ? s.split('.')[0] : s;
  if (base) {
    out.add(base);
    out.add(`${base}.DE`);
    out.add(`${base}.L`);
    out.add(`${base}.AS`);
    out.add(`${base}.PA`);
    out.add(`${base}.IR`);
  }
  return [...out];
}

async function fetchTopHoldingsRaw(sym) {
  const data = await withYahooRetry((yf) =>
    yf.quoteSummary(sym, { modules: ['topHoldings'] }, { validateResult: false })
  );
  const th = data?.topHoldings;
  if (!th || (!(th.holdings?.length) && !(th.sectorWeightings?.length))) return null;
  return th;
}

async function resolveCountriesFromHoldings(holdings, db) {
  const top = (holdings || []).filter((h) => h.pct > 0).slice(0, 15);
  if (!top.length) return [];

  const symbols = top.map((h) => h.symbol).filter(Boolean);
  const cached = new Map();
  if (db && symbols.length) {
    const placeholders = symbols.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT yahoo_symbol, country FROM market_securities
         WHERE yahoo_symbol IN (${placeholders}) AND country IS NOT NULL AND TRIM(country) != ''`
      )
      .all(...symbols);
    for (const r of rows) {
      cached.set(r.yahoo_symbol, normalizeCountryLabel(r.country));
    }
  }

  const countryPct = new Map();
  let unresolvedPct = 0;

  for (const h of top) {
    let country = cached.get(h.symbol) || null;
    if (!country) {
      try {
        const meta = await fetchSecurityMetadata(h.symbol);
        country = normalizeCountryLabel(meta?.country);
        await new Promise((r) => setTimeout(r, 120));
      } catch {
        /* try symbol heuristic */
      }
    }
    if (!country) country = guessCountryFromHoldingSymbol(h.symbol);
    if (!country) {
      unresolvedPct += h.pct;
      continue;
    }
    countryPct.set(country, (countryPct.get(country) || 0) + h.pct);
  }

  if (unresolvedPct > 0) {
    countryPct.set('Other', (countryPct.get('Other') || 0) + unresolvedPct);
  }

  const holdingsSum = top.reduce((s, h) => s + h.pct, 0);
  const entries = [...countryPct.entries()].map(([label, pct]) => ({ label, pct }));
  if (holdingsSum > 0 && holdingsSum < 98) {
    const scale = 100 / holdingsSum;
    for (const e of entries) e.pct = Math.round(e.pct * scale * 100) / 100;
  }
  return entries.sort((a, b) => b.pct - a.pct);
}

function parseTopHoldingsModule(th) {
  const sectors = [];
  for (const row of th.sectorWeightings || []) {
    for (const [k, v] of Object.entries(row)) {
      if (k === 'maxAge' || typeof v !== 'number' || v <= 0) continue;
      sectors.push({ label: formatSectorKey(k), pct: holdingPercentToPct(v) });
    }
  }
  sectors.sort((a, b) => b.pct - a.pct);

  const holdings = [];
  for (const h of th.holdings || []) {
    const pct = holdingPercentToPct(h.holdingPercent);
    if (pct <= 0 || !h.symbol) continue;
    holdings.push({
      name: h.holdingName || h.symbol,
      symbol: h.symbol,
      pct,
    });
  }
  holdings.sort((a, b) => b.pct - a.pct);
  return { sectors, holdings };
}

/**
 * ETF/fund sector weightings and top holdings (Yahoo topHoldings module).
 */
async function fetchFundBreakdown(providerSymbol, db = null, hints = {}) {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return null;

  const cache = require('../fundAllocationCache');
  const fundProfiles = require('../etfFundProfiles');

  const profile = fundProfiles.matchFundProfile({
    yahooSymbol: sym,
    ticker: hints.ticker,
    isin: hints.isin,
    securityName: hints.securityName,
    benchmark: hints.benchmark,
  });
  if (profile) {
    const payload = fundProfiles.profileToBreakdown(profile);
    if (db && payload) cache.setCachedBreakdown(db, sym, payload);
    return payload;
  }

  const cached = db ? cache.getCachedBreakdown(db, sym) : null;
  if (cached?.sectors?.length || cached?.countries?.length) return cached;

  let th = null;
  let matchedSym = sym;
  for (const candidate of fundSymbolVariants(sym)) {
    try {
      th = await fetchTopHoldingsRaw(candidate);
      if (th) {
        matchedSym = candidate;
        break;
      }
    } catch {
      /* try next listing */
    }
  }
  if (!th) return null;

  const { sectors, holdings } = parseTopHoldingsModule(th);
  let countries = [];
  if (holdings.length) {
    countries = await resolveCountriesFromHoldings(holdings, db);
  }

  const payload = { sectors, countries, holdings, matchedSym };
  if (db && (sectors.length || countries.length)) {
    cache.setCachedBreakdown(db, sym, payload);
  }
  return payload;
}

function periodToChartDays(period) {
  if (period === 'YTD') {
    const start = new Date(`${new Date().getFullYear()}-01-01`);
    return Math.max(30, Math.ceil((Date.now() - start.getTime()) / 86400000) + 7);
  }
  return { '1M': 40, '3M': 100, '6M': 200, '1Y': 400, ALL: 900 }[period] || 400;
}

/**
 * Daily OHLC history for portfolio charts (backfills market_price_history).
 */
async function fetchHistoricalPrices(providerSymbol, period = '1Y') {
  const sym = String(providerSymbol || '').trim();
  if (!sym) return [];

  const days = periodToChartDays(period);
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  try {
    const chart = await withYahooRetry((yf) =>
      yf.chart(sym, {
        period1: start,
        period2: end,
        interval: '1d',
      })
    );

    const quotes = chart?.quotes || [];
    const currency = chart?.meta?.currency || 'USD';
    const out = [];

    for (const q of quotes) {
      const close = q.close ?? q.adjclose;
      if (close == null || q.date == null) continue;
      const normalized = normalizePriceCurrency(close, currency);
      if (!normalized) continue;
      const d =
        q.date instanceof Date
          ? q.date.toISOString().slice(0, 10)
          : String(q.date).slice(0, 10);
      out.push({
        priceDate: d,
        price: normalized.price,
        currency: normalized.currency,
      });
    }
    return out;
  } catch {
    return [];
  }
}

module.exports = {
  PROVIDER_ID,
  searchSecurities,
  fetchQuote,
  resolveAndQuote,
  fetchSecurityMetadata,
  fetchFundBreakdown,
  normalizeCountryLabel,
  guessCountryFromHoldingSymbol,
  fetchHistoricalPrices,
  mapCountryToRegion,
  mapQuoteTypeToAssetClass,
  symbolCandidates,
  getClient,
  formatFetchError,
};
