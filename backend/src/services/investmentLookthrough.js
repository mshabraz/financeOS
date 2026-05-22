/**
 * ETF/fund look-through for sector & country allocation (Yahoo topHoldings).
 */

const yahoo = require('./marketData/yahooProvider');
const fundProfiles = require('./etfFundProfiles');
const {
  isCommodityRow,
  isFundLikeRow,
  isGeographicAnalyticsRow,
  sectorLabelForRow,
} = require('./investmentAssetClassification');
const logger = require('./logger');

/** FTSE Developed (VGVE and peers) — justETF Mar 2026. */
const FTSE_DEVELOPED_COUNTRIES = [
  { label: 'United States', pct: 63.62 },
  { label: 'Japan', pct: 6.37 },
  { label: 'United Kingdom', pct: 3.33 },
  { label: 'Canada', pct: 3.06 },
  { label: 'Other', pct: 23.62 },
];

/** Typical MSCI World / global equity ETF country mix (when Yahoo look-through unavailable). */
const GLOBAL_EQUITY_COUNTRIES = FTSE_DEVELOPED_COUNTRIES;

const EMERGING_EQUITY_COUNTRIES = [
  { label: 'China', pct: 28 },
  { label: 'India', pct: 18 },
  { label: 'Taiwan', pct: 14 },
  { label: 'South Korea', pct: 12 },
  { label: 'Brazil', pct: 5 },
  { label: 'South Africa', pct: 4 },
  { label: 'Other', pct: 19 },
];

/** MSCI Europe Net (Access Edge Europe benchmark). */
const EUROPE_EQUITY_COUNTRIES = [
  { label: 'United Kingdom', pct: 22.3 },
  { label: 'France', pct: 17.8 },
  { label: 'Switzerland', pct: 15.4 },
  { label: 'Germany', pct: 14.4 },
  { label: 'Netherlands', pct: 6.9 },
  { label: 'Other', pct: 23.2 },
];

/** MSCI ACWI-style mix (Global High Dividend benchmark; fund is actively managed). */
const MSCI_ACWI_COUNTRIES = [
  { label: 'United States', pct: 37.03 },
  { label: 'Switzerland', pct: 9.78 },
  { label: 'Sweden', pct: 8.58 },
  { label: 'Taiwan', pct: 7.28 },
  { label: 'France', pct: 6.41 },
  { label: 'Japan', pct: 5.85 },
  { label: 'Finland', pct: 5.72 },
  { label: 'United Kingdom', pct: 5.55 },
  { label: 'South Korea', pct: 4.41 },
  { label: 'Netherlands', pct: 2.66 },
  { label: 'Other', pct: 6.73 },
];

const US_HEAVY_COUNTRIES = [
  { label: 'United States', pct: 98 },
  { label: 'Other', pct: 2 },
];

function inferFundCountryWeightsFromName(name, sector, region) {
  const nm = String(name || '').toLowerCase();
  const sec = String(sector || '').toLowerCase();
  const reg = String(region || '').toLowerCase();

  if (
    nm.match(/\b(ftse developed|developed world)\b/) ||
    sec.includes('developed')
  ) {
    return FTSE_DEVELOPED_COUNTRIES;
  }
  if (
    reg.includes('global') ||
    nm.match(/\b(world|global|all[- ]?world|acwi|developed markets|total market|ftse all)\b/) ||
    sec.includes('global')
  ) {
    return GLOBAL_EQUITY_COUNTRIES;
  }
  if (reg.includes('emerging') || nm.match(/\b(emerging|emim|eimi|eem|msci em)\b/) || sec.includes('emerging')) {
    return EMERGING_EQUITY_COUNTRIES;
  }
  if (
    nm.match(/\b(access edge europe|access edge europa|msci europe)\b/) ||
    ((reg.includes('europe') || nm.match(/\b(europe|euro stoxx|stoxx|ezu|eurozone)\b/) || sec.includes('european')) &&
      !nm.match(/\b(world|global)\b/))
  ) {
    return EUROPE_EQUITY_COUNTRIES;
  }
  if (nm.match(/\b(global high dividend|msci acwi|msci all country)\b/)) {
    return MSCI_ACWI_COUNTRIES;
  }
  if (
    reg.includes('north america') ||
    nm.match(/\b(s&p|sp500|nasdaq|usa|us equity|united states)\b/)
  ) {
    return US_HEAVY_COUNTRIES;
  }
  if (nm.match(/\b(japan|nikkei|topix)\b/)) {
    return [
      { label: 'Japan', pct: 95 },
      { label: 'Other', pct: 5 },
    ];
  }
  return null;
}

function applyCountryTemplate(countryMap, template, valueEur) {
  for (const c of template) {
    addToMap(countryMap, c.label, valueEur * (c.pct / 100));
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

function toPercent(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n <= 1 ? n * 100 : n;
}

/** Heuristic country from Yahoo holding symbol (US-listed, LSE, etc.). */
function guessCountryFromSymbol(symbol) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) return 'Other';
  if (sym.endsWith('.L')) return 'United Kingdom';
  if (sym.endsWith('.DE') || sym.endsWith('.XETRA')) return 'Germany';
  if (sym.endsWith('.PA')) return 'France';
  if (sym.endsWith('.AS')) return 'Netherlands';
  if (sym.endsWith('.SW') || sym.endsWith('.SWX')) return 'Switzerland';
  if (sym.endsWith('.ST')) return 'Sweden';
  if (sym.endsWith('.HE')) return 'Finland';
  if (sym.endsWith('.TO')) return 'Canada';
  if (sym.endsWith('.HK')) return 'Hong Kong';
  if (sym.endsWith('.T')) return 'Japan';
  if (sym.endsWith('.KS')) return 'South Korea';
  if (sym.endsWith('.AX')) return 'Australia';
  if (!sym.includes('.')) return 'United States';
  return 'Other';
}

function addToMap(map, label, valueEur) {
  if (!label || valueEur <= 0) return;
  map.set(label, (map.get(label) || 0) + valueEur);
}

function mapToAllocationItems(map, totalEur) {
  return [...map.entries()]
    .map(([label, valueEur]) => ({
      key: label,
      label,
      valueEur,
      pct: totalEur > 0 ? (valueEur / totalEur) * 100 : 0,
    }))
    .sort((a, b) => b.valueEur - a.valueEur);
}

function consolidateAllocationItems(items) {
  const map = new Map();
  for (const item of items) {
    const isOther =
      item.label === 'Other' || item.key === '_other' || item.label === 'Unknown';
    const key = isOther ? '_other' : item.label || item.key;
    const prev = map.get(key);
    if (prev) {
      prev.valueEur += item.valueEur;
    } else {
      map.set(key, {
        key,
        label: isOther ? 'Other' : item.label,
        valueEur: item.valueEur,
      });
    }
  }
  return [...map.values()];
}

function groupAllocationDetailed(items, totalEur, { maxItems = 10, minPct = 1.2 } = {}) {
  if (!totalEur || totalEur <= 0) return [];
  const merged = consolidateAllocationItems(items);
  const sorted = merged.sort((a, b) => b.valueEur - a.valueEur);
  const out = [];
  let otherEur = 0;

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const pct = (item.valueEur / totalEur) * 100;
    if (i >= maxItems || (pct < minPct && sorted.length > maxItems)) {
      otherEur += item.valueEur;
    } else {
      out.push({ ...item, pct: Math.round(pct * 100) / 100 });
    }
  }

  if (otherEur > 0) {
    const existingOther = out.find((x) => x.label === 'Other');
    if (existingOther) {
      existingOther.valueEur += otherEur;
      existingOther.pct = Math.round((existingOther.valueEur / totalEur) * 10000) / 100;
    } else {
      out.push({
        key: '_other',
        label: 'Other',
        valueEur: otherEur,
        pct: Math.round((otherEur / totalEur) * 10000) / 100,
      });
    }
  }
  return out;
}

function buildTopHoldingsAllocation(composition, totalPortfolioEur) {
  const map = new Map();
  for (const c of composition) {
    if (c.marketValueEur <= 0) continue;
    const label = c.securityName || c.ticker;
    addToMap(map, label, c.marketValueEur);
  }
  return groupAllocationDetailed(
    mapToAllocationItems(map, totalPortfolioEur),
    totalPortfolioEur,
    { maxItems: 10, minPct: 1.0 }
  );
}

/**
 * Blend ETF look-through + direct stock metadata into sector/country weights.
 */
async function computeLookthroughAllocations(composition, totalHoldingsEur, db = null) {
  const sectorMap = new Map();
  const countryMap = new Map();
  const fundPositions = [];

  for (const row of composition) {
    if (!isGeographicAnalyticsRow(row)) continue;
    const yahooSymbol = row.binding?.yahooSymbol || row.binding?.yahoo_symbol;

    if (isFundLikeRow(row)) {
      fundPositions.push(row);
      continue;
    }

    const sectorLabel = sectorLabelForRow(row);
    if (sectorLabel) addToMap(sectorMap, sectorLabel, row.marketValueEur);
    const countryLabel = row.country || row.region;
    if (countryLabel && countryLabel !== 'Unknown') {
      addToMap(countryMap, countryLabel, row.marketValueEur);
    }
  }

  for (const row of fundPositions) {
    const yahooSymbol = row.binding?.yahooSymbol || row.binding?.yahoo_symbol;
    const hints = {
      ticker: row.ticker,
      isin: row.isin,
      securityName: row.securityName || row.fundName,
    };
    let breakdown = fundProfiles.profileToBreakdown(fundProfiles.matchFundProfile(hints));
    try {
      const needsLive =
        !breakdown ||
        ((!breakdown.countries || breakdown.countries.length === 0) &&
          (!breakdown.sectors || breakdown.sectors.length === 0));
      if (needsLive && yahooSymbol) {
        const live = await yahoo.fetchFundBreakdown(yahooSymbol, db, hints);
        if (live) {
          breakdown = {
            ...breakdown,
            ...live,
            benchmark: breakdown?.benchmark || live.benchmark,
            fundName: breakdown?.fundName || live.fundName || hints.securityName,
          };
        }
        await new Promise((r) => setTimeout(r, 220));
      }

      if (breakdown?.sectors?.length) {
        for (const s of breakdown.sectors) {
          const slice = row.marketValueEur * (s.pct / 100);
          addToMap(sectorMap, s.label, slice);
        }
      } else {
        addToMap(sectorMap, row.sector || row.industry || 'Diversified ETF', row.marketValueEur);
      }

      if (breakdown?.countries?.length) {
        for (const c of breakdown.countries) {
          const slice = row.marketValueEur * (c.pct / 100);
          addToMap(countryMap, c.label, slice);
        }
      } else {
        const template = inferFundCountryWeightsFromName(
          row.securityName || row.fundName || row.ticker,
          row.sector,
          row.region
        );
        if (template) {
          applyCountryTemplate(countryMap, template, row.marketValueEur);
        } else {
          addToMap(countryMap, 'Unknown', row.marketValueEur);
        }
      }
    } catch (err) {
      logger.warn(`[lookthrough] ${yahooSymbol}: ${err.message}`);
      addToMap(sectorMap, row.sector || 'Diversified ETF', row.marketValueEur);
      const template = inferFundCountryWeightsFromName(
        row.securityName || row.fundName || row.ticker,
        row.sector,
        row.region
      );
      if (template) {
        applyCountryTemplate(countryMap, template, row.marketValueEur);
      } else {
        addToMap(countryMap, 'Unknown', row.marketValueEur);
      }
    }
  }

  return {
    sector: mapToAllocationItems(sectorMap, totalHoldingsEur),
    country: mapToAllocationItems(countryMap, totalHoldingsEur),
  };
}

module.exports = {
  buildTopHoldingsAllocation,
  computeLookthroughAllocations,
  groupAllocationDetailed,
  mapToAllocationItems,
  formatSectorKey,
  guessCountryFromSymbol,
  inferFundCountryWeightsFromName,
  applyCountryTemplate,
  toPercent,
};
