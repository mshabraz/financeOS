/**
 * Fetch and cache sector / region / country from Yahoo + exchange heuristics.
 */

const yahoo = require('./marketData/yahooProvider');
const { getBinding } = require('./investmentSecurities');
const { detectCommodity } = require('./investmentAssetClassification');
const logger = require('./logger');

function inferFromExchangeAndSymbol(yahooSymbol, exchange, name, securityType) {
  const sym = String(yahooSymbol || '').toUpperCase();
  const ex = String(exchange || '').toUpperCase();
  const nm = String(name || '').toLowerCase();
  const type = String(securityType || '').toUpperCase();

  let country = null;
  let region = null;
  let sector = null;

  const isFundLike =
    type.includes('ETF') ||
    type.includes('MUTUAL') ||
    nm.includes('etf') ||
    nm.includes('ucits') ||
    nm.includes('fund');

  if (!isFundLike && (sym.endsWith('.L') || ex.includes('LSE') || ex.includes('LON'))) {
    country = 'United Kingdom';
    region = 'Europe';
  } else if (!isFundLike && (
    sym.endsWith('.DE') ||
    sym.endsWith('.AS') ||
    sym.endsWith('.PA') ||
    sym.endsWith('.IR') ||
    sym.endsWith('.SW') ||
    ex.includes('XETRA') ||
    ex.includes('GER') ||
    ex.includes('AMS')
  )) {
    country = 'Germany';
    region = 'Europe';
  } else if (!isFundLike && (sym.endsWith('.HE') || ex.includes('HEL'))) {
    country = 'Finland';
    region = 'Europe';
  } else if (!isFundLike && (sym.endsWith('.ST') || ex.includes('STO'))) {
    country = 'Sweden';
    region = 'Europe';
  } else if (!isFundLike && !sym.includes('.') && /^[A-Z]{1,5}$/.test(sym)) {
    country = 'United States';
    region = 'North America';
  }

  if (type.includes('ETF') || nm.includes('etf') || nm.includes('ucits')) {
    sector = sector || 'Diversified ETF';
    country = null;
    if (nm.includes('world') || nm.includes('global') || nm.includes('all-world') || nm.includes('all world')) {
      region = 'Global';
    } else if (nm.includes('emerging')) {
      region = 'Emerging Markets';
    } else if (nm.includes('europe') || nm.includes('euro stoxx') || nm.includes('stoxx')) {
      region = 'Europe';
    } else if (nm.includes('usa') || nm.includes('s&p') || nm.includes('nasdaq') || nm.includes(' us ')) {
      region = 'North America';
    } else if (nm.includes('asia') || nm.includes('pacific')) {
      region = 'Asia Pacific';
    }
    if (nm.includes('technology') || nm.includes('tech') || nm.includes('nasdaq')) {
      sector = 'Technology';
    } else if (nm.includes('bond') || nm.includes('fixed')) {
      sector = 'Fixed Income';
    } else if (nm.includes('emerging')) {
      sector = 'Emerging Markets';
    } else if (nm.includes('europe') || nm.includes('euro') || nm.includes('stoxx')) {
      sector = 'European Equity';
    } else if (nm.includes('world') || nm.includes('global') || nm.includes('all-world')) {
      sector = 'Global Equity';
    }
  }

  if (type.includes('MUTUAL') || nm.includes('fund')) {
    sector = sector || 'Mutual Fund';
    region = region || 'Europe';
  }

  if (nm.includes('swedbank') || sym.startsWith('SW')) {
    sector = sector || 'Mutual Fund';
    country = country || 'Sweden';
    region = region || 'Europe';
  }

  return { sector, industry: null, country, region, assetClass: null };
}

function persistMetadata(db, securityId, meta) {
  if (!meta || !securityId) return;
  db.prepare(
    `UPDATE market_securities SET
       sector = COALESCE(?, sector),
       industry = COALESCE(?, industry),
       country = COALESCE(?, country),
       region = COALESCE(?, region),
       asset_class = COALESCE(?, asset_class),
       metadata_updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    meta.sector,
    meta.industry,
    meta.country,
    meta.region,
    meta.assetClass,
    securityId
  );
}

async function enrichSecurityMetadata(
  db,
  securityId,
  yahooSymbol,
  exchange,
  name,
  securityType,
  localTicker = null
) {
  const commodity = detectCommodity(
    { ticker: localTicker || yahooSymbol?.split('.')[0], fundName: name },
    { name, security_type: securityType }
  );
  if (commodity) {
    const merged = {
      sector: 'Commodities',
      industry: null,
      country: null,
      region: null,
      assetClass: 'Commodity',
      dividendYield: null,
    };
    persistMetadata(db, securityId, merged);
    return merged;
  }

  let meta = null;
  try {
    meta = await yahoo.fetchSecurityMetadata(yahooSymbol);
  } catch (err) {
    logger.warn(`[metadata] Yahoo ${yahooSymbol}: ${err.message}`);
  }

  const inferred = inferFromExchangeAndSymbol(yahooSymbol, exchange, name, securityType);
  const merged = {
    sector: meta?.sector || inferred.sector,
    industry: meta?.industry || inferred.industry,
    country: meta?.country || inferred.country,
    region: meta?.region || inferred.region || yahoo.mapCountryToRegion(meta?.country || inferred.country),
    assetClass: meta?.assetClass || inferred.assetClass || yahoo.mapQuoteTypeToAssetClass(securityType),
    dividendYield: meta?.dividendYield,
  };

  if (!merged.region && merged.country) {
    merged.region = yahoo.mapCountryToRegion(merged.country);
  }
  if (!merged.sector && merged.assetClass === 'ETF') {
    merged.sector = 'Diversified ETF';
  }
  if (!merged.sector && merged.assetClass === 'Fund') {
    merged.sector = 'Mutual Fund';
  }
  if (!merged.region && merged.sector?.includes('European')) {
    merged.region = 'Europe';
  }
  if (!merged.region && merged.sector?.includes('Global')) {
    merged.region = 'Global';
  }

  persistMetadata(db, securityId, merged);

  if (merged.dividendYield != null) {
    db.prepare('UPDATE market_prices SET dividend_yield = ? WHERE security_id = ?').run(
      merged.dividendYield,
      securityId
    );
  }

  return merged;
}

/**
 * Refresh metadata for all bound open holdings missing sector or region.
 */
async function enrichPortfolioMetadata(db, openHoldings) {
  const seen = new Set();
  let updated = 0;

  for (const h of openHoldings) {
    const binding = getBinding(db, h.broker, h.ticker, h.currency);
    if (!binding?.security_id || !binding.yahoo_symbol) continue;
    if (seen.has(binding.security_id)) continue;
    seen.add(binding.security_id);

    const sec = db.prepare('SELECT * FROM market_securities WHERE id = ?').get(binding.security_id);
    const isFund =
      (sec?.asset_class || '').match(/ETF|Fund|Mutual/i) ||
      (sec?.security_type || '').includes('ETF') ||
      (sec?.name || '').toLowerCase().includes('etf');
    if (isFund && sec?.sector && sec?.region) continue;
    if (!isFund && sec?.sector && sec?.region && sec?.country && sec?.industry) continue;

    await enrichSecurityMetadata(
      db,
      binding.security_id,
      binding.yahoo_symbol,
      sec?.exchange || binding.exchange,
      sec?.name || binding.security_name,
      sec?.security_type,
      binding.ticker || h.ticker
    );
    updated += 1;
    await new Promise((r) => setTimeout(r, 180));
  }

  return updated;
}

module.exports = {
  enrichSecurityMetadata,
  enrichPortfolioMetadata,
  inferFromExchangeAndSymbol,
};
