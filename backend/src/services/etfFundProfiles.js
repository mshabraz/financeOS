/**
 * Match holdings to curated benchmark profiles and convert to allocation breakdowns.
 */

const { ETF_FUND_PROFILES } = require('../data/etfFundProfiles');

/**
 * @typedef {{ label: string, pct: number }} WeightRow
 * @typedef {{ name: string, symbol?: string, pct: number }} HoldingRow
 * @typedef {Object} FundProfile
 * @property {string} id
 * @property {string} name
 * @property {string} benchmark
 * @property {string} [isin]
 * @property {string[]} [tickers]
 * @property {string[]} [yahooSymbols]
 * @property {string[]} [nameKeywords]
 * @property {WeightRow[]} countries
 * @property {WeightRow[]} sectors
 * @property {HoldingRow[]} topHoldings
 * @property {string} [source]
 * @property {string} [sourceUrl]
 * @property {string} [asOf]
 */

function normalizeTicker(ticker) {
  return String(ticker || '')
    .replace(/^€/, '')
    .replace(/^US\$/, '')
    .trim()
    .toUpperCase();
}

function symbolBase(sym) {
  const s = String(sym || '').trim().toUpperCase();
  if (!s) return '';
  return s.includes('.') ? s.split('.')[0] : s;
}

/**
 * @param {Object} hints
 * @param {string} [hints.ticker]
 * @param {string} [hints.isin]
 * @param {string} [hints.yahooSymbol]
 * @param {string} [hints.securityName]
 * @param {string} [hints.benchmark]
 */
function matchFundProfile(hints = {}) {
  const ticker = normalizeTicker(hints.ticker);
  const isin = String(hints.isin || '').trim().toUpperCase();
  const yahoo = String(hints.yahooSymbol || '').trim().toUpperCase();
  const yahooBase = symbolBase(yahoo);
  const name = String(hints.securityName || '').toLowerCase();
  const bench = String(hints.benchmark || '').toLowerCase();

  for (const profile of ETF_FUND_PROFILES) {
    if (isin && profile.isin && isin === profile.isin.toUpperCase()) return profile;

    if (ticker && profile.tickers?.some((t) => normalizeTicker(t) === ticker)) return profile;
    if (yahooBase && profile.tickers?.some((t) => normalizeTicker(t) === yahooBase)) return profile;

    if (yahoo && profile.yahooSymbols?.some((s) => s.toUpperCase() === yahoo)) return profile;
    if (yahooBase && profile.yahooSymbols?.some((s) => symbolBase(s) === yahooBase)) return profile;

    if (bench && profile.benchmark.toLowerCase() === bench) return profile;

    if (name && profile.benchmark && name.includes(profile.benchmark.toLowerCase())) return profile;
    if (name && profile.nameKeywords?.some((kw) => name.includes(kw.toLowerCase()))) return profile;
    if (name && profile.name && name.includes('ftse developed')) {
      if (profile.id === 'vgve-ftse-developed') return profile;
    }
    if (name && (name.includes('msci em') || name.includes('emerging markets imi'))) {
      if (profile.id === 'emim-msci-em') return profile;
    }
    if (name && name.includes('ftse all-world')) {
      if (profile.id === 'vwce-ftse-all-world') return profile;
    }
    if (name && (name.includes('msci europe') || name.includes('access edge europ'))) {
      if (profile.id === 'swedbank-access-edge-europe') return profile;
    }
    if (name && (name.includes('global high dividend') || name.includes('msci acwi'))) {
      if (profile.id === 'swedbank-global-high-dividend') return profile;
    }
  }
  return null;
}

function profileToBreakdown(profile) {
  if (!profile) return null;
  return {
    sectors: (profile.sectors || []).map((s) => ({ label: s.label, pct: s.pct })),
    countries: (profile.countries || []).map((c) => ({ label: c.label, pct: c.pct })),
    holdings: (profile.topHoldings || []).map((h) => ({
      name: h.name,
      symbol: h.symbol,
      pct: h.pct,
    })),
    benchmark: profile.benchmark,
    fundName: profile.name,
    isin: profile.isin,
    ter: profile.ter,
    holdingsCount: profile.holdingsCount,
    source: profile.source,
    sourceUrl: profile.sourceUrl,
    asOf: profile.asOf,
    profileId: profile.id,
    dataSource: 'benchmark_profile',
  };
}

function profileToApiPayload(profile, position = {}) {
  const breakdown = profileToBreakdown(profile);
  if (!breakdown) return null;
  return {
    ticker: position.ticker,
    broker: position.broker,
    portfolioPct: position.portfolioPct,
    marketValueEur: position.marketValueEur,
    ...breakdown,
  };
}

function isCompositionFundRow(row) {
  const { isFundLikeRow } = require('./investmentAssetClassification');
  return isFundLikeRow(row) && row.marketValueEur > 0;
}

function breakdownToApiPayload(row, breakdown = {}) {
  const holdings = breakdown.holdings || breakdown.topHoldings || [];
  return {
    ticker: row.ticker,
    broker: row.broker,
    portfolioPct: row.portfolioPct,
    marketValueEur: row.marketValueEur,
    fundName: breakdown.fundName || row.securityName || row.fundName || row.ticker,
    benchmark: breakdown.benchmark || '—',
    isin: breakdown.isin || row.isin || null,
    ter: breakdown.ter ?? null,
    holdingsCount: breakdown.holdingsCount ?? null,
    source: breakdown.source || null,
    sourceUrl: breakdown.sourceUrl || null,
    asOf: breakdown.asOf || null,
    profileId: breakdown.profileId || null,
    dataSource: breakdown.dataSource || (breakdown.profileId ? 'benchmark_profile' : 'yahoo'),
    countries: breakdown.countries || [],
    sectors: breakdown.sectors || [],
    holdings,
  };
}

/**
 * One benchmark card per ETF/fund in the portfolio (curated profile or Yahoo look-through).
 */
async function buildFundProfilesForComposition(db, composition) {
  const yahoo = require('./marketData/yahooProvider');
  const fundRows = (composition || []).filter(isCompositionFundRow);
  const out = [];

  for (const row of fundRows) {
    const hints = {
      ticker: row.ticker,
      isin: row.isin,
      yahooSymbol: row.binding?.yahooSymbol || row.binding?.yahoo_symbol,
      securityName: row.securityName || row.fundName,
    };
    const yahooSymbol = hints.yahooSymbol;

    let breakdown = profileToBreakdown(matchFundProfile(hints));
    const missingData =
      !breakdown ||
      ((!breakdown.countries || breakdown.countries.length === 0) &&
        (!breakdown.sectors || breakdown.sectors.length === 0) &&
        (!breakdown.holdings || breakdown.holdings.length === 0));

    if (missingData && yahooSymbol) {
      try {
        const live = await yahoo.fetchFundBreakdown(yahooSymbol, db, hints);
        if (live) {
          breakdown = {
            ...live,
            benchmark: breakdown?.benchmark || live.benchmark || row.sector || 'Fund',
            fundName: breakdown?.fundName || live.fundName || hints.securityName,
            dataSource: live.dataSource || 'yahoo',
          };
        }
        await new Promise((r) => setTimeout(r, 180));
      } catch {
        /* keep curated partial data if any */
      }
    }

    out.push(breakdownToApiPayload(row, breakdown || {}));
  }

  return out.sort((a, b) => (b.marketValueEur || 0) - (a.marketValueEur || 0));
}

function getProfileByBenchmark(benchmarkName) {
  const bench = String(benchmarkName || '').toLowerCase();
  return ETF_FUND_PROFILES.find((p) => p.benchmark.toLowerCase() === bench) || null;
}

module.exports = {
  ETF_FUND_PROFILES,
  matchFundProfile,
  profileToBreakdown,
  profileToApiPayload,
  buildFundProfilesForComposition,
  getProfileByBenchmark,
  normalizeTicker,
};
