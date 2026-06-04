/**
 * Enrich open holdings with cached market prices and portfolio totals in EUR.
 */

const { computeHoldings } = require('./investmentHoldings');
const { getBinding } = require('./investmentSecurities');
const { attachSecurityDisplay } = require('./securityDisplayNames');
const { getPerEurRates, convertToEur, TARGET } = require('./fxRates');
const { resolveBrokerCash, getAllBrokerCash, getBrokerCash } = require('./investmentBrokerCash');

function getLatestPrice(db, securityId) {
  return db.prepare(
    `SELECT price, currency, fetched_at, source, error
     FROM market_prices WHERE security_id = ?`
  ).get(securityId);
}

function effectiveQuantity(holding, binding) {
  if (holding.quantityBased && holding.quantity != null && holding.quantity > 0) {
    return holding.quantity;
  }
  const manual = binding?.manual_quantity;
  if (manual != null && manual > 0) return manual;
  return null;
}

function effectiveAvgCostPerShare(holding, binding) {
  const manual = binding?.manual_avg_cost_per_share;
  if (manual != null && manual > 0) return manual;
  return holding.avgCostPerShare ?? null;
}

/** Cost basis used for P/L — respects manual avg cost × qty when set. */
function effectiveCostBasis(holding, binding, qty) {
  const manualAvg = binding?.manual_avg_cost_per_share;
  if (manualAvg != null && manualAvg > 0 && qty != null && qty > 0) {
    return qty * manualAvg;
  }
  return holding.totalCostBasis || 0;
}

function enrichHolding(db, holding) {
  const binding = getBinding(db, holding.broker, holding.ticker, holding.currency);
  const base = {
    ...holding,
    binding: binding
      ? {
          source: binding.binding_source,
          securityId: binding.security_id,
          yahooSymbol: binding.yahoo_symbol,
          securityName: binding.security_name || binding.yahoo_symbol,
          customDisplayName: binding.custom_display_name ?? null,
          nickname: binding.nickname ?? null,
          displayNotes: binding.display_notes ?? null,
          manualQuantity: binding.manual_quantity ?? null,
          manualAvgCostPerShare: binding.manual_avg_cost_per_share ?? null,
        }
      : null,
    avgCostPerShare: effectiveAvgCostPerShare(holding, binding),
    totalCostBasis: effectiveCostBasis(holding, binding, effectiveQuantity(holding, binding)),
    costBasisIsManual: (binding?.manual_avg_cost_per_share ?? 0) > 0,
    priceStatus: 'unbound',
    latestPrice: null,
    latestPriceNative: null,
    priceCurrency: null,
    priceFetchedAt: null,
    marketValue: null,
    marketValueNative: null,
    marketValueEur: null,
    costBasisEur: null,
    unrealizedPnL: null,
    unrealizedPnLEur: null,
    unrealizedPnLPct: null,
    effectiveQuantity: null,
  };

  if (!binding?.security_id) {
    base.priceStatus = 'needs_binding';
    return base;
  }

  const quote = getLatestPrice(db, binding.security_id);
  if (!quote) {
    base.priceStatus = 'no_price';
    return base;
  }
  if (quote.error) {
    base.priceStatus = 'error';
    base.priceError = quote.error;
    if (binding.yahoo_symbol) {
      base.priceErrorDetail = `${quote.error} (Yahoo: ${binding.yahoo_symbol})`;
    }
    return base;
  }

  base.latestPriceNative = quote.price;
  base.latestPrice = quote.price;
  base.priceCurrency = quote.currency;
  base.priceFetchedAt = quote.fetched_at;

  const qty = effectiveQuantity(holding, binding);
  base.effectiveQuantity = qty;

  const costBasis = effectiveCostBasis(holding, binding, qty);
  base.totalCostBasis = costBasis;
  base.avgCostPerShare = effectiveAvgCostPerShare(holding, binding);

  if (qty != null && qty > 0) {
    base.marketValueNative = qty * quote.price;
    base.marketValue = base.marketValueNative;
    base.unrealizedPnL = base.marketValue - costBasis;
    if (costBasis > 0.0001) {
      base.unrealizedPnLPct = (base.unrealizedPnL / costBasis) * 100;
    }
    base.priceStatus = 'ok';
    return base;
  }

  base.priceStatus = 'needs_quantity';
  return base;
}

function applyEurConversion(h, holding, binding, perEur) {
  h.displayCurrency = TARGET;
  const qty = h.effectiveQuantity;
  const costBasis = effectiveCostBasis(holding, binding, qty);
  h.totalCostBasis = costBasis;
  h.costBasisEur = convertToEur(costBasis, holding.currency, perEur);

  if (h.latestPriceNative != null) {
    h.latestPriceEur = convertToEur(h.latestPriceNative, h.priceCurrency, perEur);
    h.latestPrice = h.latestPriceEur ?? h.latestPriceNative;
  }

  if (h.marketValueNative != null) {
    h.marketValueEur = convertToEur(h.marketValueNative, h.priceCurrency, perEur);
    h.marketValue = h.marketValueEur ?? h.marketValueNative;
  }

  if (h.marketValueEur != null && h.costBasisEur != null) {
    h.unrealizedPnLEur = Math.round((h.marketValueEur - h.costBasisEur) * 100) / 100;
    h.unrealizedPnL = h.unrealizedPnLEur;
    if (h.costBasisEur > 0.0001) {
      h.unrealizedPnLPct = (h.unrealizedPnLEur / h.costBasisEur) * 100;
    }
  }
}

function getSyncState(db) {
  return (
    db.prepare('SELECT * FROM investment_price_sync WHERE id = 1').get() || {
      id: 1,
      status: 'idle',
      last_success_at: null,
      last_error: null,
    }
  );
}

async function buildPortfolioValuation(db, broker = '') {
  const allHoldings = computeHoldings(db, broker || '');
  const openHoldings = allHoldings.filter((h) => !h.fullyExited);
  const enriched = openHoldings.map((h) => enrichHolding(db, h));

  const currencies = new Set([TARGET]);
  for (const h of enriched) {
    if (h.priceCurrency) currencies.add(h.priceCurrency);
    if (h.currency) currencies.add(h.currency);
  }
  const preCashRows = broker
    ? [getBrokerCash(db, broker)].filter(Boolean)
    : getAllBrokerCash(db);
  for (const r of preCashRows) currencies.add((r.currency || TARGET).toUpperCase());

  const {
    perEur,
    date: fxDate,
    stale: fxStale,
    error: fxError,
  } = await getPerEurRates([...currencies]);

  const brokerCash = resolveBrokerCash(db, broker || '', perEur);

  for (let i = 0; i < enriched.length; i += 1) {
    const binding = getBinding(db, openHoldings[i].broker, openHoldings[i].ticker, openHoldings[i].currency);
    applyEurConversion(enriched[i], openHoldings[i], binding, perEur);
    enriched[i] = attachSecurityDisplay(enriched[i], binding);
  }

  const holdingsByCurrency = {};
  let holdingsValueEur = 0;

  for (const h of enriched) {
    if (h.priceStatus !== 'ok' || h.marketValueEur == null) continue;
    holdingsValueEur += h.marketValueEur;
    const ccy = (h.priceCurrency || h.currency || TARGET).toUpperCase();
    if (!holdingsByCurrency[ccy]) holdingsByCurrency[ccy] = 0;
    if (h.marketValueNative != null) holdingsByCurrency[ccy] += h.marketValueNative;
  }

  const cashBalanceEur = brokerCash.totalEur;
  const totalPortfolioEur = holdingsValueEur + cashBalanceEur;

  const cashByCurrency = {};
  for (const row of brokerCash.rows) {
    const ccy = row.currency;
    if (!cashByCurrency[ccy]) cashByCurrency[ccy] = 0;
    cashByCurrency[ccy] += row.amount;
  }

  const byCurrency = Object.entries(holdingsByCurrency)
    .sort((a, b) => b[1] - a[1])
    .map(([currency, hv]) => ({
      currency,
      holdingsValue: hv,
      holdingsValueEur: convertToEur(hv, currency, perEur),
      cashBalance: cashByCurrency[currency] ?? 0,
      totalPortfolio: hv + (cashByCurrency[currency] ?? 0),
    }));

  for (const [currency, cashAmt] of Object.entries(cashByCurrency)) {
    if (!byCurrency.find((b) => b.currency === currency)) {
      byCurrency.push({
        currency,
        holdingsValue: 0,
        holdingsValueEur: 0,
        cashBalance: cashAmt,
        totalPortfolio: cashAmt,
      });
    }
  }

  const sync = getSyncState(db);
  const unboundCount = enriched.filter((h) => h.priceStatus === 'needs_binding').length;
  const needsQuantityCount = enriched.filter((h) => h.priceStatus === 'needs_quantity').length;
  const staleCount = enriched.filter((h) => {
    if (!h.priceFetchedAt) return h.priceStatus === 'ok' || h.priceStatus === 'no_price';
    const age = Date.now() - new Date(h.priceFetchedAt).getTime();
    return age > 24 * 60 * 60 * 1000;
  }).length;

  const primary = {
    currency: TARGET,
    holdingsValue: Math.round(holdingsValueEur * 100) / 100,
    cashBalance: cashBalanceEur,
    totalPortfolio: Math.round(totalPortfolioEur * 100) / 100,
  };

  return {
    openHoldings: enriched,
    closedHoldings: allHoldings.filter((h) => h.fullyExited),
    brokerCash,
    manualCash: {
      amountEur: cashBalanceEur,
      currency: TARGET,
      broker: broker || null,
      byBroker: brokerCash.rows,
    },
    byCurrency,
    unboundCount,
    needsQuantityCount,
    staleCount,
    sync,
    primary,
    fx: {
      base: TARGET,
      date: fxDate,
      stale: fxStale,
      error: fxError || null,
      ratesPerEur: perEur,
    },
  };
}

module.exports = {
  enrichHolding,
  buildPortfolioValuation,
  getSyncState,
  getLatestPrice,
  effectiveQuantity,
  effectiveAvgCostPerShare,
  effectiveCostBasis,
  applyEurConversion,
  resolveBrokerCash,
};
