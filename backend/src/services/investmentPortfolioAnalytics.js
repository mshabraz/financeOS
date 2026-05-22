/**
 * Portfolio analytics: allocations, performance history, diversification, insights.
 */

const { buildPortfolioValuation } = require('./investmentValuation');
const { getBinding } = require('./investmentSecurities');
const { convertToEur } = require('./fxRates');
const { enrichPortfolioMetadata } = require('./investmentMetadataEnrichment');
const lookthrough = require('./investmentLookthrough');
const { buildFundProfilesForComposition } = require('./etfFundProfiles');
const {
  inferAssetClassWithCommodity,
  isCommodityRow,
  isFundRow,
  isFundLikeRow,
  isGeographicAnalyticsRow,
  assetClassLabelForRow,
  sectorLabelForRow,
} = require('./investmentAssetClassification');
const logger = require('./logger');
const {
  ensurePriceHistories,
  buildPortfolioHistory,
  periodStartDate,
} = require('./investmentPortfolioHistory');

const PERIOD_KEYS = ['1M', '3M', '6M', 'YTD', '1Y', 'ALL'];

function groupAllocation(items, totalEur, minPct = 2.5) {
  if (!totalEur || totalEur <= 0) return [];
  const sorted = items
    .filter((i) => i.valueEur > 0)
    .map((i) => ({ ...i, pct: (i.valueEur / totalEur) * 100 }))
    .sort((a, b) => b.valueEur - a.valueEur);

  const out = [];
  let otherEur = 0;
  for (const item of sorted) {
    if (item.pct < minPct && sorted.length > 4) {
      otherEur += item.valueEur;
    } else {
      out.push(item);
    }
  }
  if (otherEur > 0) {
    out.push({
      key: '_other',
      label: 'Other',
      valueEur: otherEur,
      pct: (otherEur / totalEur) * 100,
    });
  }
  return out;
}

function applyAssetClassification(holding, security) {
  const inferred = inferAssetClassWithCommodity(holding, security);
  if (inferred.assetClass === 'Commodity') {
    return {
      assetClass: 'Commodity',
      commodityType: inferred.commodityType || 'Commodity',
      sector: 'Commodities',
      industry: null,
      country: null,
      region: null,
    };
  }

  if (holding.broker === 'swedbank_fund') {
    return {
      assetClass: 'Fund',
      commodityType: null,
      sector: security?.sector || 'Mutual Fund',
      industry: null,
      country: null,
      region: security?.region || 'Europe',
    };
  }

  const { matchFundProfile } = require('./etfFundProfiles');
  if (
    matchFundProfile({
      ticker: holding.ticker,
      isin: holding.isin,
      yahooSymbol: holding.binding?.yahooSymbol || security?.yahoo_symbol,
      securityName: holding.fundName || holding.binding?.securityName || security?.name,
    })
  ) {
    return {
      assetClass: inferred.assetClass === 'ETF' ? 'ETF' : 'Fund',
      commodityType: null,
      sector: security?.sector || null,
      industry: security?.industry || null,
      country: null,
      region: security?.region || null,
    };
  }

  return {
    assetClass: inferred.assetClass,
    commodityType: null,
    sector: security?.sector || null,
    industry: security?.industry || null,
    country: security?.country || null,
    region: security?.region || null,
  };
}

function getSecurityRow(db, securityId) {
  if (!securityId) return null;
  return db.prepare('SELECT * FROM market_securities WHERE id = ?').get(securityId);
}

function getPriceExtras(db, securityId) {
  if (!securityId) return null;
  return db.prepare(
    `SELECT previous_close, change_amount, change_percent, dividend_yield
     FROM market_prices WHERE security_id = ?`
  ).get(securityId);
}

function buildCompositionRows(db, openHoldings, totalPortfolioEur, perEur) {
  return openHoldings.map((h) => {
    const binding = getBinding(db, h.broker, h.ticker, h.currency);
    const security = binding?.security_id ? getSecurityRow(db, binding.security_id) : null;
    const priceExtras = binding?.security_id ? getPriceExtras(db, binding.security_id) : null;
    const mvEur = h.marketValueEur ?? 0;
    const portfolioPct = totalPortfolioEur > 0 ? (mvEur / totalPortfolioEur) * 100 : 0;

    let dailyChangeEur = null;
    if (
      h.priceStatus === 'ok' &&
      h.effectiveQuantity &&
      priceExtras?.change_amount != null
    ) {
      const native = h.effectiveQuantity * priceExtras.change_amount;
      dailyChangeEur = convertToEur(native, h.priceCurrency || h.currency, perEur);
    }

    return {
      broker: h.broker,
      ticker: h.ticker,
      isin: h.isin,
      fundName: h.fundName,
      currency: h.currency,
      securityName:
        h.binding?.securityName || security?.name || h.fundName || h.ticker,
      quantity: h.effectiveQuantity,
      avgCostPerShare: h.avgCostPerShare,
      latestPrice: h.latestPriceNative ?? h.latestPrice,
      latestPriceEur: h.latestPriceEur,
      priceCurrency: h.priceCurrency || h.currency,
      marketValue: h.marketValueNative,
      marketValueEur: mvEur,
      portfolioPct: Math.round(portfolioPct * 100) / 100,
      unrealizedPnL: h.unrealizedPnL,
      unrealizedPnLEur: h.unrealizedPnLEur,
      unrealizedPnLPct: h.unrealizedPnLPct,
      dailyChangeEur,
      ...(() => {
        const meta = applyAssetClassification(h, security);
        return {
          sector: meta.sector,
          industry: meta.industry,
          region: meta.region,
          country: meta.country,
          assetClass: meta.assetClass,
          commodityType: meta.commodityType,
        };
      })(),
      exchange: security?.exchange || null,
      dividendYield: priceExtras?.dividend_yield ?? null,
      priceStatus: h.priceStatus,
      binding: h.binding,
      costBasisIsManual: h.costBasisIsManual,
    };
  });
}

function sumByKey(rows, keyFn, valueFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    const v = valueFn(r);
    if (!k || v <= 0) continue;
    map.set(k, (map.get(k) || 0) + v);
  }
  return [...map.entries()].map(([key, valueEur]) => ({ key, label: key, valueEur }));
}

function buildAllocations(composition, totalPortfolioEur, cashEur, manualCash) {
  const priced = composition.filter((c) => c.marketValueEur > 0);

  const assetClass = groupAllocation(
    sumByKey(priced, (r) => assetClassLabelForRow(r), (r) => r.marketValueEur),
    totalPortfolioEur - cashEur
  );

  const broker = groupAllocation(
    sumByKey(priced, (r) => r.broker, (r) => r.marketValueEur),
    totalPortfolioEur
  );

  const sector = groupAllocation(
    sumByKey(
      priced.filter((r) => isGeographicAnalyticsRow(r)),
      (r) => sectorLabelForRow(r) || 'Unknown',
      (r) => r.marketValueEur
    ),
    totalPortfolioEur - cashEur
  );

  const region = groupAllocation(
    sumByKey(priced, (r) => r.region || 'Unknown', (r) => r.marketValueEur),
    totalPortfolioEur - cashEur
  );

  const currencyNative = {};
  for (const r of priced) {
    const ccy = (r.priceCurrency || r.currency || 'EUR').toUpperCase();
    if (!currencyNative[ccy]) currencyNative[ccy] = 0;
    currencyNative[ccy] += r.marketValue || 0;
  }
  const currencyExposure = Object.entries(currencyNative)
    .map(([currency, valueNative]) => ({
      key: currency,
      label: currency,
      valueNative,
      pctNative: 0,
    }))
    .sort((a, b) => b.valueNative - a.valueNative);
  const nativeTotal = currencyExposure.reduce((s, c) => s + c.valueNative, 0);
  for (const c of currencyExposure) {
    c.pctNative = nativeTotal > 0 ? (c.valueNative / nativeTotal) * 100 : 0;
  }

  const cashPct = totalPortfolioEur > 0 ? (cashEur / totalPortfolioEur) * 100 : 0;
  const assetWithCash = [
    ...assetClass,
    ...(cashEur > 0
      ? [{ key: 'cash', label: 'Cash', valueEur: cashEur, pct: cashPct }]
      : []),
  ];

  return {
    assetClass: assetWithCash,
    broker,
    sector,
    region,
    currency: currencyExposure,
    cash: { amountEur: cashEur, currency: manualCash.currency, pct: cashPct },
  };
}

async function buildDetailedAllocations(db, composition, totalPortfolioEur, cashEur, manualCash) {
  const base = buildAllocations(composition, totalPortfolioEur, cashEur, manualCash);
  const holdingsDenominator = Math.max(0, totalPortfolioEur - cashEur) || totalPortfolioEur;

  const topHoldings = lookthrough.buildTopHoldingsAllocation(
    composition,
    holdingsDenominator
  );

  let sector = base.sector;
  const geographicRows = composition.filter((c) => isGeographicAnalyticsRow(c));
  const geographicEur = geographicRows.reduce((s, c) => s + c.marketValueEur, 0);
  const geographicDenominator = geographicEur > 0 ? geographicEur : holdingsDenominator;

  const countryItems = sumByKey(
    geographicRows.filter((c) => !isFundLikeRow(c)),
    (r) => r.country || r.region || 'Unknown',
    (r) => r.marketValueEur
  );
  let country = lookthrough.groupAllocationDetailed(
    countryItems.map((i) => ({
      ...i,
      pct: holdingsDenominator > 0 ? (i.valueEur / holdingsDenominator) * 100 : 0,
    })),
    geographicDenominator,
    { maxItems: 10, minPct: 1.0 }
  );

  const commodityRows = composition.filter((c) => isCommodityRow(c) && c.marketValueEur > 0);
  const commodities = lookthrough.groupAllocationDetailed(
    sumByKey(
      commodityRows,
      (r) => (r.commodityType ? `${r.commodityType}` : 'Commodity'),
      (r) => r.marketValueEur
    ).map((i) => ({
      ...i,
      pct: holdingsDenominator > 0 ? (i.valueEur / holdingsDenominator) * 100 : 0,
    })),
    holdingsDenominator,
    { maxItems: 8, minPct: 0.5 }
  );

  try {
    const lt = await lookthrough.computeLookthroughAllocations(
      composition,
      geographicDenominator,
      db
    );
    if (lt.sector?.length) {
      sector = lookthrough.groupAllocationDetailed(lt.sector, geographicDenominator, {
        maxItems: 10,
        minPct: 1.2,
      });
    }
    if (lt.country?.length) {
      country = lookthrough.groupAllocationDetailed(lt.country, geographicDenominator, {
        maxItems: 10,
        minPct: 1.0,
      });
    }
  } catch (err) {
    logger.warn(`[analytics] lookthrough: ${err.message}`);
    const fundMap = new Map();
    for (const row of geographicRows) {
      if (!isFundLikeRow(row) || row.marketValueEur <= 0) continue;
      const template = lookthrough.inferFundCountryWeightsFromName(
        row.securityName || row.fundName || row.ticker,
        row.sector,
        row.region
      );
      if (template) {
        lookthrough.applyCountryTemplate(fundMap, template, row.marketValueEur);
      } else {
        const label = row.region && row.region !== 'Unknown' ? row.region : 'Unknown';
        const prev = fundMap.get(label) || 0;
        fundMap.set(label, prev + row.marketValueEur);
      }
    }
    for (const item of countryItems) {
      const prev = fundMap.get(item.label) || 0;
      fundMap.set(item.label, prev + item.valueEur);
    }
    country = lookthrough.groupAllocationDetailed(
      lookthrough.mapToAllocationItems(fundMap, geographicDenominator),
      geographicDenominator,
      { maxItems: 10, minPct: 1.0 }
    );
  }

  return {
    ...base,
    topHoldings,
    sector,
    country,
    commodities,
    breakdownMeta: {
      holdingsValueEur: holdingsDenominator,
      geographicValueEur: geographicEur,
      commoditiesValueEur: commodityRows.reduce((s, c) => s + c.marketValueEur, 0),
    },
  };
}

function computeDiversification(composition, totalPortfolioEur, cashEur) {
  const weights = composition
    .filter((c) => c.marketValueEur > 0)
    .map((c) => c.marketValueEur / totalPortfolioEur);
  if (cashEur > 0 && totalPortfolioEur > 0) {
    weights.push(cashEur / totalPortfolioEur);
  }
  const hhi = weights.reduce((s, w) => s + w * w, 0);
  const score = Math.round(Math.max(0, Math.min(100, (1 - hhi) * 120)));

  const warnings = [];
  for (const c of composition) {
    if (c.portfolioPct >= 25) {
      warnings.push({
        level: 'high',
        code: 'single_position',
        message: `${c.ticker} is ${c.portfolioPct.toFixed(1)}% of the portfolio`,
      });
    }
  }

  const sectorMap = new Map();
  for (const c of composition) {
    const s = c.sector || 'Unknown';
    sectorMap.set(s, (sectorMap.get(s) || 0) + (c.portfolioPct || 0));
  }
  for (const [sector, pct] of sectorMap) {
    if (pct >= 40 && sector !== 'Unknown') {
      warnings.push({
        level: 'medium',
        code: 'sector_concentration',
        message: `${pct.toFixed(0)}% in ${sector}`,
      });
    }
  }

  const regionMap = new Map();
  for (const c of composition) {
    const r = c.region || 'Unknown';
    regionMap.set(r, (regionMap.get(r) || 0) + (c.portfolioPct || 0));
  }
  for (const [region, pct] of regionMap) {
    if (pct >= 55 && region !== 'Unknown') {
      warnings.push({
        level: 'medium',
        code: 'region_concentration',
        message: `${pct.toFixed(0)}% in ${region}`,
      });
    }
  }

  const cashPct = totalPortfolioEur > 0 ? (cashEur / totalPortfolioEur) * 100 : 0;
  if (cashPct >= 20) {
    warnings.push({
      level: 'low',
      code: 'high_cash',
      message: `Cash is ${cashPct.toFixed(0)}% of portfolio`,
    });
  }

  return { score, hhi: Math.round(hhi * 1000) / 1000, warnings };
}

function buildInsights(valuation, composition, summary) {
  const insights = [];
  const { unboundCount, needsQuantityCount, staleCount, sync } = valuation;

  if (unboundCount > 0) {
    insights.push({
      type: 'action',
      severity: 'warning',
      title: `${unboundCount} holding${unboundCount > 1 ? 's' : ''} need price linking`,
      detail: 'Link Yahoo symbols to unlock market value and P/L',
    });
  }
  if (needsQuantityCount > 0) {
    insights.push({
      type: 'action',
      severity: 'warning',
      title: `${needsQuantityCount} fund${needsQuantityCount > 1 ? 's' : ''} need quantity or avg cost`,
      detail: 'Set units and average cost on the Holdings tab',
    });
  }
  if (staleCount > 0) {
    insights.push({
      type: 'data',
      severity: 'warning',
      title: `${staleCount} price${staleCount > 1 ? 's' : ''} older than 24h`,
      detail: 'Run price sync for fresher quotes',
    });
  }
  if (sync?.last_error) {
    insights.push({
      type: 'data',
      severity: 'error',
      title: 'Last price sync failed',
      detail: sync.last_error,
    });
  }

  const priced = composition.filter((c) => c.priceStatus === 'ok' && c.unrealizedPnLPct != null);
  const gainers = [...priced].sort((a, b) => (b.unrealizedPnLPct || 0) - (a.unrealizedPnLPct || 0));
  const losers = [...priced].sort((a, b) => (a.unrealizedPnLPct || 0) - (b.unrealizedPnLPct || 0));

  if (gainers[0]?.unrealizedPnLPct > 0) {
    insights.push({
      type: 'performance',
      severity: 'positive',
      title: `Top gainer: ${gainers[0].ticker}`,
      detail: `${gainers[0].unrealizedPnLPct?.toFixed(1)}% unrealized`,
    });
  }
  if (losers[0]?.unrealizedPnLPct < 0) {
    insights.push({
      type: 'performance',
      severity: 'negative',
      title: `Top loser: ${losers[0].ticker}`,
      detail: `${losers[0].unrealizedPnLPct?.toFixed(1)}% unrealized`,
    });
  }

  const cashPct =
    valuation.primary?.totalPortfolio > 0
      ? ((valuation.manualCash?.amountEur || 0) / valuation.primary.totalPortfolio) * 100
      : 0;
  if (cashPct >= 15) {
    insights.push({
      type: 'balance',
      severity: 'info',
      title: 'Elevated cash allocation',
      detail: `${cashPct.toFixed(0)}% of portfolio is uninvested cash`,
    });
  }

  if (summary?.realizedPnL != null && summary.realizedPnL !== 0) {
    insights.push({
      type: 'performance',
      severity: summary.realizedPnL >= 0 ? 'positive' : 'negative',
      title: `Realized P/L: €${summary.realizedPnL.toFixed(2)}`,
      detail: 'From closed trades and dividends in import data',
    });
  }

  return {
    items: insights.slice(0, 8),
    bestPerformers: gainers.slice(0, 5).map((c) => ({
      ticker: c.ticker,
      name: c.securityName,
      pct: c.unrealizedPnLPct,
      eur: c.unrealizedPnLEur,
    })),
    worstPerformers: losers.slice(0, 5).map((c) => ({
      ticker: c.ticker,
      name: c.securityName,
      pct: c.unrealizedPnLPct,
      eur: c.unrealizedPnLEur,
    })),
  };
}

function buildDividendAnalytics(db, broker) {
  const brokerClause = broker ? 'AND broker = ?' : '';
  const params = broker ? [broker] : [];

  const byYear = db
    .prepare(
      `SELECT strftime('%Y', date) AS year, SUM(net_amount) AS totalNet
       FROM investment_transactions WHERE type = 'Dividend' ${brokerClause}
       GROUP BY year ORDER BY year`
    )
    .all(...params);

  const byTicker = db
    .prepare(
      `SELECT broker, ticker, currency, SUM(net_amount) AS totalNet, COUNT(*) AS payments,
              MIN(date) AS firstDate, MAX(date) AS lastDate
       FROM investment_transactions
       WHERE type = 'Dividend' AND ticker IS NOT NULL ${brokerClause}
       GROUP BY broker, ticker ORDER BY totalNet DESC LIMIT 15`
    )
    .all(...params);

  const last12 = db
    .prepare(
      `SELECT SUM(net_amount) AS total
       FROM investment_transactions
       WHERE type = 'Dividend' AND date >= date('now', '-12 months') ${brokerClause}`
    )
    .get(...params);

  const projectedAnnual = last12?.total ?? 0;

  return {
    byYear,
    topContributors: byTicker,
    projectedAnnualIncome: Math.round(projectedAnnual * 100) / 100,
    trailing12Months: Math.round((last12?.total || 0) * 100) / 100,
  };
}

async function buildPortfolioAnalytics(db, { broker = '', period = '1Y' } = {}) {
  const valuation = await buildPortfolioValuation(db, broker);
  const openHoldings = valuation.openHoldings || [];

  await enrichPortfolioMetadata(db, openHoldings);
  const periodKey = PERIOD_KEYS.includes(period) ? period : '1Y';
  await ensurePriceHistories(db, openHoldings, periodKey);

  const perEur = valuation.fx?.ratesPerEur || { EUR: 1 };

  const summaryRow = db
    .prepare(
      `SELECT
         SUM(CASE WHEN type='Buy' THEN net_amount ELSE 0 END) AS totalInvested,
         SUM(CASE WHEN type='Sell' THEN net_amount ELSE 0 END) AS totalProceeds,
         SUM(CASE WHEN type='Dividend' THEN net_amount ELSE 0 END) AS totalDividends,
         MIN(date) AS firstDate, MAX(date) AS lastDate
       FROM investment_transactions ${broker ? 'WHERE broker = ?' : ''}`
    )
    .get(...(broker ? [broker] : []));

  const primary = valuation.primary || {};
  const cashEur = primary.cashBalance ?? valuation.manualCash?.amountEur ?? 0;
  const totalPortfolioEur = primary.totalPortfolio ?? 0;
  const holdingsValueEur = primary.holdingsValue ?? 0;

  let totalCostBasisEur = 0;
  let totalUnrealizedEur = 0;
  let dailyChangeEur = 0;
  let dailyChangeAvailable = false;

  for (const h of openHoldings) {
    if (h.costBasisEur != null) totalCostBasisEur += h.costBasisEur;
    if (h.unrealizedPnLEur != null) totalUnrealizedEur += h.unrealizedPnLEur;
    const binding = getBinding(db, h.broker, h.ticker, h.currency);
    const extras = binding?.security_id ? getPriceExtras(db, binding.security_id) : null;
    if (h.priceStatus === 'ok' && h.effectiveQuantity && extras?.change_amount != null) {
      const native = h.effectiveQuantity * extras.change_amount;
      const eur = convertToEur(native, h.priceCurrency || h.currency, perEur);
      if (eur != null) {
        dailyChangeEur += eur;
        dailyChangeAvailable = true;
      }
    }
  }

  const unrealizedPct =
    totalCostBasisEur > 0 ? (totalUnrealizedEur / totalCostBasisEur) * 100 : null;

  const dailyChangePct =
    dailyChangeAvailable && holdingsValueEur > dailyChangeEur && holdingsValueEur > 0
      ? (dailyChangeEur / (holdingsValueEur - dailyChangeEur)) * 100
      : null;

  const composition = buildCompositionRows(db, openHoldings, totalPortfolioEur, perEur);
  let allocations = await buildDetailedAllocations(
    db,
    composition,
    totalPortfolioEur,
    cashEur,
    valuation.manualCash
  );
  if (!broker && valuation.brokerCash?.rows?.length) {
    const map = new Map(allocations.broker.map((b) => [b.key, { ...b }]));
    for (const row of valuation.brokerCash.rows) {
      if (row.amountEur <= 0) continue;
      const prev = map.get(row.broker);
      if (prev) prev.valueEur += row.amountEur;
      else {
        map.set(row.broker, {
          key: row.broker,
          label: row.label || row.broker,
          valueEur: row.amountEur,
          pct: 0,
        });
      }
    }
    allocations = {
      ...allocations,
      broker: [...map.values()]
        .map((b) => ({
          ...b,
          pct: totalPortfolioEur > 0 ? Math.round((b.valueEur / totalPortfolioEur) * 10000) / 100 : 0,
        }))
        .sort((a, b) => b.valueEur - a.valueEur),
    };
  }
  const diversification = computeDiversification(composition, totalPortfolioEur, cashEur);

  const totalInvested = summaryRow?.totalInvested || 0;
  const totalProceeds = summaryRow?.totalProceeds || 0;
  const totalDividends = summaryRow?.totalDividends || 0;
  const summary = {
    totalInvested,
    totalProceeds,
    totalDividends,
    realizedPnL: totalProceeds - totalInvested + totalDividends,
    firstDate: summaryRow?.firstDate,
    lastDate: summaryRow?.lastDate,
  };

  const performanceHistory = buildPortfolioHistory(
    db,
    openHoldings,
    periodKey,
    cashEur,
    perEur
  );

  const sparkline = performanceHistory.slice(-30).map((p) => ({
    date: p.date,
    value: p.portfolioValue,
  }));

  return {
    period: periodKey,
    hero: {
      totalPortfolioEur: Math.round(totalPortfolioEur * 100) / 100,
      holdingsValueEur: Math.round(holdingsValueEur * 100) / 100,
      cashBalanceEur: Math.round(cashEur * 100) / 100,
      investedCapitalEur: Math.round(totalCostBasisEur * 100) / 100,
      unrealizedPnLEur: Math.round(totalUnrealizedEur * 100) / 100,
      unrealizedPnLPct: unrealizedPct != null ? Math.round(unrealizedPct * 100) / 100 : null,
      dailyChangeEur: dailyChangeAvailable ? Math.round(dailyChangeEur * 100) / 100 : null,
      dailyChangePct:
        dailyChangePct != null ? Math.round(dailyChangePct * 100) / 100 : null,
      dailyChangeAvailable,
      realizedPnLEur: Math.round(summary.realizedPnL * 100) / 100,
      lastUpdated: valuation.sync?.last_success_at || null,
      pricedPositions: openHoldings.filter((h) => h.priceStatus === 'ok').length,
      openPositions: openHoldings.length,
      brokerCashBreakdown: valuation.brokerCash?.rows ?? [],
    },
    allocations,
    fundProfiles: await buildFundProfilesForComposition(db, composition),
    composition,
    diversification,
    performance: {
      history: performanceHistory,
      period: periodKey,
    },
    dividends: buildDividendAnalytics(db, broker),
    insights: buildInsights(valuation, composition, summary),
    valuation,
    summary,
    sparkline,
  };
}

module.exports = {
  buildPortfolioAnalytics,
  PERIOD_KEYS,
  periodStartDate,
};
