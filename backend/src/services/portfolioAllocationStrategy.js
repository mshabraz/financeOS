/**
 * CRUD + orchestration for user-defined allocation strategies.
 */

const { buildPortfolioValuation } = require('./investmentValuation');
const { calculateAssetAllocation, holdingKeyOf } = require('./assetAllocationEngine');
const { inferAssetClassWithCommodity } = require('./investmentAssetClassification');
const { holdingKey } = require('./investmentSecurities');
const { computeAssetTotals } = require('./assetTotals');

/** Portfolio cash only — brokerage uninvested cash (not bank/Revolut emergency cash). */
const BROKER_UNINVESTED_CASH_KEY = 'cash|BROKER_UNINVESTED|EUR';
/** @deprecated Previous synthetic key that lumped bank+Revolut+brokerage; remapped at runtime. */
const LEGACY_AVAILABLE_CASH_KEY = 'cash|AVAILABLE|EUR';
const AVAILABLE_CASH_KEY = BROKER_UNINVESTED_CASH_KEY;

const DEFAULT_COLORS = [
  '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444',
  '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#ec4899',
];

function serializeStrategy(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    isActive: !!row.is_active,
    monthlyContribution: row.monthly_contribution != null ? Number(row.monthly_contribution) : null,
    includeBrokerCash: !!row.include_broker_cash,
    cashCategoryId: row.cash_category_id != null ? Number(row.cash_category_id) : null,
    notes: row.notes || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listStrategies(db) {
  return db
    .prepare('SELECT * FROM allocation_strategies ORDER BY is_active DESC, updated_at DESC, id DESC')
    .all()
    .map(serializeStrategy);
}

function getStrategy(db, id) {
  const row = db.prepare('SELECT * FROM allocation_strategies WHERE id = ?').get(id);
  return serializeStrategy(row);
}

function getActiveStrategy(db) {
  const row = db
    .prepare('SELECT * FROM allocation_strategies WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1')
    .get();
  return serializeStrategy(row);
}

function getCategories(db, strategyId) {
  return db
    .prepare(
      `SELECT id, strategy_id AS strategyId, name, color, sort_order AS sortOrder
         FROM allocation_categories
        WHERE strategy_id = ?
        ORDER BY sort_order ASC, id ASC`
    )
    .all(strategyId);
}

function getTargets(db, strategyId) {
  return db
    .prepare(
      `SELECT id, strategy_id AS strategyId, category_id AS categoryId, target_pct AS targetPct
         FROM allocation_targets
        WHERE strategy_id = ?`
    )
    .all(strategyId);
}

function getMaps(db, strategyId) {
  return db
    .prepare(
      `SELECT id, strategy_id AS strategyId, holding_key AS holdingKey, broker, ticker, currency,
              category_id AS categoryId
         FROM allocation_holding_maps
        WHERE strategy_id = ?`
    )
    .all(strategyId)
    .map((m) => ({
      ...m,
      holdingKey: normalizeCashHoldingKey(m.holdingKey),
      ticker: m.holdingKey === LEGACY_AVAILABLE_CASH_KEY || m.ticker === 'AVAILABLE'
        ? 'BROKER_UNINVESTED'
        : m.ticker,
    }));
}

function normalizeCashHoldingKey(key) {
  if (key === LEGACY_AVAILABLE_CASH_KEY) return BROKER_UNINVESTED_CASH_KEY;
  return key;
}

function loadStrategyBundle(db, strategyId) {
  const strategy = getStrategy(db, strategyId);
  if (!strategy) return null;
  return {
    strategy,
    categories: getCategories(db, strategyId),
    targets: getTargets(db, strategyId),
    maps: getMaps(db, strategyId),
  };
}

function deactivateAll(db) {
  db.prepare('UPDATE allocation_strategies SET is_active = 0, updated_at = datetime(\'now\')').run();
}

function createStrategy(db, body = {}) {
  const name = String(body.name || '').trim() || 'My allocation';
  const monthly = body.monthlyContribution != null && body.monthlyContribution !== ''
    ? Number(body.monthlyContribution)
    : null;
  const includeCash = body.includeBrokerCash ? 1 : 0;
  const notes = body.notes != null ? String(body.notes) : null;
  const makeActive = body.isActive !== false;

  const run = db.transaction(() => {
    if (makeActive) deactivateAll(db);
    const r = db
      .prepare(
        `INSERT INTO allocation_strategies
           (name, is_active, monthly_contribution, include_broker_cash, notes)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(name, makeActive ? 1 : 0, monthly, includeCash, notes);
    return r.lastInsertRowid;
  });

  const id = run();
  return loadStrategyBundle(db, id);
}

function updateStrategy(db, id, body = {}) {
  const existing = db.prepare('SELECT * FROM allocation_strategies WHERE id = ?').get(id);
  if (!existing) return null;

  const name = body.name != null ? String(body.name).trim() || existing.name : existing.name;
  const monthly = Object.prototype.hasOwnProperty.call(body, 'monthlyContribution')
    ? (body.monthlyContribution == null || body.monthlyContribution === ''
      ? null
      : Number(body.monthlyContribution))
    : existing.monthly_contribution;
  const includeCash = Object.prototype.hasOwnProperty.call(body, 'includeBrokerCash')
    ? (body.includeBrokerCash ? 1 : 0)
    : existing.include_broker_cash;
  const cashCat = Object.prototype.hasOwnProperty.call(body, 'cashCategoryId')
    ? (body.cashCategoryId == null || body.cashCategoryId === '' ? null : Number(body.cashCategoryId))
    : existing.cash_category_id;
  const notes = Object.prototype.hasOwnProperty.call(body, 'notes')
    ? (body.notes == null ? null : String(body.notes))
    : existing.notes;
  const activate = body.isActive === true;
  const deactivate = body.isActive === false;

  const run = db.transaction(() => {
    if (activate) deactivateAll(db);
    db.prepare(
      `UPDATE allocation_strategies SET
         name = ?,
         monthly_contribution = ?,
         include_broker_cash = ?,
         cash_category_id = ?,
         notes = ?,
         is_active = CASE
           WHEN ? = 1 THEN 1
           WHEN ? = 1 THEN 0
           ELSE is_active
         END,
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      name,
      monthly,
      includeCash,
      cashCat,
      notes,
      activate ? 1 : 0,
      deactivate ? 1 : 0,
      id
    );
  });
  run();
  return loadStrategyBundle(db, id);
}

function deleteStrategy(db, id) {
  const run = db.transaction(() => {
    db.prepare('DELETE FROM allocation_holding_maps WHERE strategy_id = ?').run(id);
    db.prepare('DELETE FROM allocation_targets WHERE strategy_id = ?').run(id);
    db.prepare('DELETE FROM allocation_categories WHERE strategy_id = ?').run(id);
    return db.prepare('DELETE FROM allocation_strategies WHERE id = ?').run(id);
  });
  const r = run();
  return (r.changes || 0) > 0;
}

/**
 * Replace categories. Body: [{ id?, name, color, sortOrder }]
 * Returns new category list. Cascades delete of removed categories' targets/maps.
 */
function replaceCategories(db, strategyId, categories = []) {
  const strategy = getStrategy(db, strategyId);
  if (!strategy) throw new Error('Strategy not found');

  const incoming = (categories || []).map((c, i) => ({
    id: c.id != null ? Number(c.id) : null,
    name: String(c.name || '').trim(),
    color: String(c.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]).trim() || DEFAULT_COLORS[0],
    sortOrder: c.sortOrder != null ? Number(c.sortOrder) : i,
  })).filter((c) => c.name);

  if (!incoming.length) throw new Error('At least one category is required');

  const run = db.transaction(() => {
    const existing = getCategories(db, strategyId);
    const keepIds = new Set(incoming.filter((c) => c.id != null).map((c) => c.id));

    for (const old of existing) {
      if (!keepIds.has(old.id)) {
        db.prepare('DELETE FROM allocation_targets WHERE category_id = ?').run(old.id);
        db.prepare('DELETE FROM allocation_holding_maps WHERE category_id = ?').run(old.id);
        db.prepare('DELETE FROM allocation_categories WHERE id = ?').run(old.id);
        if (strategy.cashCategoryId === old.id) {
          db.prepare(
            `UPDATE allocation_strategies SET cash_category_id = NULL, updated_at = datetime('now') WHERE id = ?`
          ).run(strategyId);
        }
      }
    }

    const insert = db.prepare(
      `INSERT INTO allocation_categories (strategy_id, name, color, sort_order)
       VALUES (?, ?, ?, ?)`
    );
    const update = db.prepare(
      `UPDATE allocation_categories
          SET name = ?, color = ?, sort_order = ?, updated_at = datetime('now')
        WHERE id = ? AND strategy_id = ?`
    );

    for (const c of incoming) {
      if (c.id != null && existing.some((e) => e.id === c.id)) {
        update.run(c.name, c.color, c.sortOrder, c.id, strategyId);
      } else {
        insert.run(strategyId, c.name, c.color, c.sortOrder);
      }
    }

    db.prepare(
      `UPDATE allocation_strategies SET updated_at = datetime('now') WHERE id = ?`
    ).run(strategyId);
  });
  run();
  return loadStrategyBundle(db, strategyId);
}

function replaceTargets(db, strategyId, targets = []) {
  const strategy = getStrategy(db, strategyId);
  if (!strategy) throw new Error('Strategy not found');

  const cats = new Set(getCategories(db, strategyId).map((c) => c.id));
  const rows = (targets || []).map((t) => ({
    categoryId: Number(t.categoryId),
    targetPct: Number(t.targetPct) || 0,
  })).filter((t) => cats.has(t.categoryId));

  const sum = rows.reduce((s, t) => s + t.targetPct, 0);
  if (rows.length > 0 && Math.abs(sum - 100) > 0.01) {
    throw new Error(`Target percentages must sum to 100% (currently ${sum.toFixed(2)}%)`);
  }

  const run = db.transaction(() => {
    db.prepare('DELETE FROM allocation_targets WHERE strategy_id = ?').run(strategyId);
    const ins = db.prepare(
      `INSERT INTO allocation_targets (strategy_id, category_id, target_pct) VALUES (?, ?, ?)`
    );
    for (const t of rows) {
      if (t.targetPct <= 0) continue;
      ins.run(strategyId, t.categoryId, t.targetPct);
    }
    db.prepare(
      `UPDATE allocation_strategies SET updated_at = datetime('now') WHERE id = ?`
    ).run(strategyId);
  });
  run();
  return loadStrategyBundle(db, strategyId);
}

function replaceMappings(db, strategyId, mappings = []) {
  const strategy = getStrategy(db, strategyId);
  if (!strategy) throw new Error('Strategy not found');

  const cats = new Set(getCategories(db, strategyId).map((c) => c.id));
  const rows = (mappings || []).map((m) => {
    const broker = String(m.broker || '').trim();
    const ticker = String(m.ticker || '').trim().toUpperCase();
    const currency = String(m.currency || 'EUR').trim().toUpperCase();
    let key = normalizeCashHoldingKey(m.holdingKey || holdingKey(broker, ticker, currency));
    let nextTicker = ticker === 'AVAILABLE' ? 'BROKER_UNINVESTED' : ticker;
    if (key === BROKER_UNINVESTED_CASH_KEY) {
      nextTicker = 'BROKER_UNINVESTED';
    }
    return {
      holdingKey: key,
      broker: key === BROKER_UNINVESTED_CASH_KEY ? 'cash' : broker,
      ticker: nextTicker,
      currency,
      categoryId: Number(m.categoryId),
    };
  }).filter((m) => m.holdingKey && m.broker && m.ticker && cats.has(m.categoryId));

  const run = db.transaction(() => {
    db.prepare('DELETE FROM allocation_holding_maps WHERE strategy_id = ?').run(strategyId);
    const ins = db.prepare(
      `INSERT INTO allocation_holding_maps
         (strategy_id, holding_key, broker, ticker, currency, category_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const m of rows) {
      ins.run(strategyId, m.holdingKey, m.broker, m.ticker, m.currency, m.categoryId);
    }
    db.prepare(
      `UPDATE allocation_strategies SET updated_at = datetime('now') WHERE id = ?`
    ).run(strategyId);
  });
  run();
  return loadStrategyBundle(db, strategyId);
}

async function getLiquidCashBreakdown(db, broker = '') {
  const totals = await computeAssetTotals(db);
  const valuation = await buildPortfolioValuation(db, broker || '');
  const brokerCashEur = Number(
    valuation.primary?.cashBalance
      ?? valuation.brokerCash?.totalEur
      ?? 0
  ) || 0;
  const bankEur = Number(totals.bankBalance ?? 0) || 0;
  const revolutEur = Number(
    totals.revolutClosingBalance ?? totals.revolutSharedAsset ?? 0
  ) || 0;
  const emergencyReserveEur = Math.round((bankEur + revolutEur) * 100) / 100;
  const totalLiquidEur = Math.round((emergencyReserveEur + brokerCashEur) * 100) / 100;
  return {
    bankEur: Math.round(bankEur * 100) / 100,
    revolutEur: Math.round(revolutEur * 100) / 100,
    brokerCashEur: Math.round(brokerCashEur * 100) / 100,
    emergencyReserveEur,
    /** Dashboard Total Cash (bank+Revolut+brokerage) — liquidity view only, not portfolio allocation. */
    totalLiquidEur,
    /** @deprecated use totalLiquidEur / emergencyReserveEur / brokerCashEur */
    totalEur: totalLiquidEur,
    valuation,
  };
}

function buildBrokerUninvestedCashHolding(cash) {
  return {
    holdingKey: BROKER_UNINVESTED_CASH_KEY,
    broker: 'cash',
    ticker: 'BROKER_UNINVESTED',
    currency: 'EUR',
    displayName: 'Brokerage cash (uninvested)',
    marketValueEur: cash.brokerCashEur,
    suggestedAssetClass: 'Cash',
    isCashBucket: true,
    isBrokerCash: true,
    cashBreakdown: {
      brokerCashEur: cash.brokerCashEur,
    },
  };
}

async function listHoldingsForMapping(db, broker = '') {
  const cash = await getLiquidCashBreakdown(db, broker);
  const open = cash.valuation.openHoldings || [];
  const rows = open.map((h) => {
    const inferred = inferAssetClassWithCommodity(h, {
      asset_class: h.assetClass,
      sector: h.sector,
      country: h.country,
      region: h.region,
      security_type: h.binding?.securityType,
      name: h.displayName || h.fundName,
    });
    return {
      holdingKey: holdingKeyOf(h),
      broker: h.broker,
      ticker: h.ticker,
      currency: h.currency || 'EUR',
      displayName: h.displayName || h.fundName || h.ticker,
      marketValueEur: h.marketValueEur ?? h.totalCostBasis ?? 0,
      suggestedAssetClass: inferred?.assetClass || h.assetClass || null,
      isCashBucket: false,
    };
  });

  // Only brokerage uninvested cash is a portfolio allocation holding.
  // Bank + Revolut emergency cash is returned separately (not in this list).
  if (cash.brokerCashEur > 0.0001) {
    rows.unshift(buildBrokerUninvestedCashHolding(cash));
  }

  return {
    holdings: rows,
    emergencyReserve: {
      bankEur: cash.bankEur,
      revolutEur: cash.revolutEur,
      totalEur: cash.emergencyReserveEur,
    },
    brokerCashEur: cash.brokerCashEur,
  };
}

async function computeActiveAllocation(db, { contribution, broker = '' } = {}) {
  const active = getActiveStrategy(db);
  if (!active) {
    return {
      strategy: null,
      compute: null,
      holdings: [],
      message: 'No active allocation strategy. Create one in Investments → Strategy.',
    };
  }

  const bundle = loadStrategyBundle(db, active.id);
  const cash = await getLiquidCashBreakdown(db, broker);
  const holdings = (cash.valuation.openHoldings || []).map((h) => ({
    ...h,
    holdingKey: holdingKeyOf(h),
  }));

  const brokerCashHoldingActive = cash.brokerCashEur > 0.0001;
  if (brokerCashHoldingActive) {
    holdings.unshift(buildBrokerUninvestedCashHolding(cash));
  }

  // Auto-map brokerage cash → Cash category when enabled and not already mapped.
  // Never inject bank/Revolut into the engine.
  let maps = [...(bundle.maps || [])].map((m) => ({
    ...m,
    holdingKey: normalizeCashHoldingKey(m.holdingKey),
  }));
  const hasBrokerCashMap = maps.some((m) => m.holdingKey === BROKER_UNINVESTED_CASH_KEY);
  if (
    active.includeBrokerCash
    && active.cashCategoryId
    && brokerCashHoldingActive
    && !hasBrokerCashMap
  ) {
    maps.push({
      holdingKey: BROKER_UNINVESTED_CASH_KEY,
      broker: 'cash',
      ticker: 'BROKER_UNINVESTED',
      currency: 'EUR',
      categoryId: active.cashCategoryId,
    });
  }

  const monthly = contribution != null && contribution !== ''
    ? Number(contribution)
    : active.monthlyContribution;

  const compute = calculateAssetAllocation({
    holdings,
    strategy: {
      // Broker cash is the synthetic holding above — do not also inject brokerCashEur.
      includeBrokerCash: false,
      cashCategoryId: null,
      monthlyContribution: active.monthlyContribution,
    },
    categories: bundle.categories,
    targets: bundle.targets,
    maps,
    monthlyContribution: monthly,
    brokerCashEur: 0,
  });

  return {
    strategy: active,
    categories: bundle.categories,
    targets: bundle.targets,
    maps: bundle.maps,
    compute: {
      ...compute,
      /** Bank + Revolut only — excluded from portfolio valuation / rebalancing. */
      emergencyReserve: {
        bankEur: cash.bankEur,
        revolutEur: cash.revolutEur,
        totalEur: cash.emergencyReserveEur,
      },
      /** Brokerage uninvested cash included in portfolio when mapped / auto-mapped. */
      brokerCashEur: cash.brokerCashEur,
      availableCash: {
        bankEur: cash.bankEur,
        revolutEur: cash.revolutEur,
        brokerCashEur: cash.brokerCashEur,
        emergencyReserveEur: cash.emergencyReserveEur,
        totalLiquidEur: cash.totalLiquidEur,
        totalEur: cash.totalLiquidEur,
      },
    },
    holdingsCount: holdings.length,
  };
}

/**
 * Suggest categories + maps from inferred asset classes (user must save).
 */
async function suggestFromAssetClasses(db, strategyId, broker = '') {
  const listed = await listHoldingsForMapping(db, broker);
  const holdings = listed.holdings || listed;
  const byClass = new Map();
  for (const h of holdings) {
    const label = String(h.suggestedAssetClass || 'Other').trim() || 'Other';
    if (!byClass.has(label)) byClass.set(label, []);
    byClass.get(label).push(h);
  }

  const categories = [...byClass.keys()].map((name, i) => ({
    name,
    color: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    sortOrder: i,
  }));

  // Equal split suggestion across categories (user can edit)
  const n = categories.length || 1;
  const base = Math.floor((100 / n) * 100) / 100;
  let remaining = 100;
  const targetHints = categories.map((c, i) => {
    const pct = i === n - 1 ? round2(remaining) : base;
    remaining = round2(remaining - pct);
    return { name: c.name, targetPct: pct };
  });

  return {
    categories,
    targetHints,
    holdings,
    emergencyReserve: listed.emergencyReserve || null,
    byClass: Object.fromEntries(byClass),
  };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

module.exports = {
  DEFAULT_COLORS,
  AVAILABLE_CASH_KEY,
  BROKER_UNINVESTED_CASH_KEY,
  LEGACY_AVAILABLE_CASH_KEY,
  listStrategies,
  getStrategy,
  getActiveStrategy,
  loadStrategyBundle,
  createStrategy,
  updateStrategy,
  deleteStrategy,
  replaceCategories,
  replaceTargets,
  replaceMappings,
  listHoldingsForMapping,
  computeActiveAllocation,
  suggestFromAssetClasses,
  serializeStrategy,
  getLiquidCashBreakdown,
};
