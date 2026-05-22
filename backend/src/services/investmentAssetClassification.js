/**
 * Asset class & commodity detection (ETCs, precious metals, etc.).
 * Commodities are excluded from geographic (country/region) analytics.
 */

const COMMODITY_TICKERS = {
  PPFB: { commodityType: 'Gold', label: 'Gold (PPFB)' },
  PPFD: { commodityType: 'Silver', label: 'Silver (PPFD)' },
};

const ASSET_CLASS_AS_SECTOR = new Set([
  'Stock',
  'ETF',
  'Fund',
  'Mutual Fund',
  'Commodity',
  'Other',
  'Index',
  'Cash',
]);

function normalizeTicker(ticker) {
  return String(ticker || '')
    .replace(/^€/, '')
    .trim()
    .toUpperCase();
}

function detectCommodity(holding, security) {
  const ticker = normalizeTicker(holding?.ticker);
  const known = COMMODITY_TICKERS[ticker];
  if (known) {
    return {
      assetClass: 'Commodity',
      commodityType: known.commodityType,
      sector: 'Commodities',
      country: null,
      region: null,
    };
  }

  const name = String(
    security?.name || holding?.fundName || holding?.binding?.securityName || ''
  ).toLowerCase();
  const type = String(security?.security_type || '').toUpperCase();
  const isEtc = type.includes('ETC') || name.includes('etc');

  if (
    /physical gold|gold bullion|wisdomtree physical gold|xetra-gold/i.test(name) ||
    (isEtc && /\bgold\b/.test(name)) ||
    ticker.includes('GOLD')
  ) {
    return {
      assetClass: 'Commodity',
      commodityType: 'Gold',
      sector: 'Commodities',
      country: null,
      region: null,
    };
  }

  if (
    /physical silver|silver bullion|wisdomtree physical silver/i.test(name) ||
    (isEtc && /\bsilver\b/.test(name)) ||
    ticker.includes('SILVER')
  ) {
    return {
      assetClass: 'Commodity',
      commodityType: 'Silver',
      sector: 'Commodities',
      country: null,
      region: null,
    };
  }

  if (isEtc && /platinum|palladium|copper|oil|brent|wti|commodity/i.test(name)) {
    const metal = name.match(/platinum|palladium|copper|oil|brent|wti/)?.[0];
    const commodityType = metal
      ? metal.charAt(0).toUpperCase() + metal.slice(1)
      : 'Commodity';
    return {
      assetClass: 'Commodity',
      commodityType,
      sector: 'Commodities',
      country: null,
      region: null,
    };
  }

  return null;
}

function isCommodityRow(row) {
  return row?.assetClass === 'Commodity' || Boolean(row?.commodityType);
}

function isFundRow(row) {
  return (
    row?.assetClass === 'ETF' ||
    row?.assetClass === 'Fund' ||
    row?.assetClass === 'Mutual Fund'
  );
}

/** ETF, UCITS, Swedbank funds, and curated benchmark matches. */
function isFundLikeRow(row) {
  if (!row || isCommodityRow(row)) return false;
  if (isFundRow(row)) return true;
  if (row.broker === 'swedbank_fund') return true;
  const name = String(row.securityName || row.fundName || '').toLowerCase();
  if (/etf|ucits|mutual fund|robur|index fund|ucits/i.test(name)) return true;
  try {
    const { matchFundProfile } = require('./etfFundProfiles');
    if (
      matchFundProfile({
        ticker: row.ticker,
        isin: row.isin,
        yahooSymbol: row.binding?.yahooSymbol || row.binding?.yahoo_symbol,
        securityName: row.securityName || row.fundName,
      })
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Positions included in country/sector look-through (equity exposure only). */
function isGeographicAnalyticsRow(row) {
  if (!row || row.marketValueEur <= 0) return false;
  return !isCommodityRow(row);
}

function sectorLabelForRow(row) {
  if (isCommodityRow(row)) return null;
  const raw = row.industry || row.sector;
  if (!raw || ASSET_CLASS_AS_SECTOR.has(raw)) return 'Unknown';
  return raw;
}

function assetClassLabelForRow(row) {
  if (row.commodityType) return `Commodity (${row.commodityType})`;
  return row.assetClass || 'Other';
}

function inferAssetClassWithCommodity(holding, security) {
  const commodity = detectCommodity(holding, security);
  if (commodity) return commodity;

  if (security?.asset_class) {
    const ac = security.asset_class;
    if (ac === 'Commodity' || ac.startsWith('Commodity')) {
      return {
        assetClass: 'Commodity',
        commodityType: security.sector === 'Commodities' ? null : null,
        sector: 'Commodities',
        country: null,
        region: null,
      };
    }
    return { assetClass: ac, commodityType: null, sector: null, country: null, region: null };
  }

  if (holding.broker === 'swedbank_fund') {
    return {
      assetClass: 'Fund',
      commodityType: null,
      sector: null,
      country: null,
      region: null,
    };
  }

  const t = String(security?.security_type || '').toUpperCase();
  if (t.includes('ETF')) {
    return { assetClass: 'ETF', commodityType: null, sector: null, country: null, region: null };
  }
  if (t.includes('MUTUAL')) {
    return { assetClass: 'Fund', commodityType: null, sector: null, country: null, region: null };
  }
  if (t.includes('EQUITY')) {
    return { assetClass: 'Stock', commodityType: null, sector: null, country: null, region: null };
  }
  return {
    assetClass: holding.quantityBased ? 'Stock' : 'Fund',
    commodityType: null,
    sector: null,
    country: null,
    region: null,
  };
}

module.exports = {
  COMMODITY_TICKERS,
  detectCommodity,
  isCommodityRow,
  isFundRow,
  isFundLikeRow,
  isGeographicAnalyticsRow,
  sectorLabelForRow,
  assetClassLabelForRow,
  inferAssetClassWithCommodity,
  normalizeTicker,
};
