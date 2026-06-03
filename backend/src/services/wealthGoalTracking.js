/**
 * Wealth goal persistence and progress tracking (savings vs target).
 */
const { getDb } = require('../db/database');
const { computeAssetTotals } = require('./assetTotals');
const { buildPortfolioValuation } = require('./investmentValuation');
const { runProjection, solveForContribution } = require('./compoundInterestEngine');

function round2(n) {
  return Math.round(n * 100) / 100;
}

function monthKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function parseMonthKey(key) {
  const [y, m] = String(key).split('-').map(Number);
  return new Date(y, m - 1, 1);
}

function monthsBetween(startKey, endKey) {
  const a = parseMonthKey(startKey);
  const b = parseMonthKey(endKey);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function listMonthKeys(fromKey, toKey) {
  const keys = [];
  let cur = parseMonthKey(fromKey);
  const end = parseMonthKey(toKey);
  while (cur <= end) {
    keys.push(monthKey(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return keys;
}

async function resolveCurrentValue(db, basis = 'portfolio', broker = '') {
  const assets = await computeAssetTotals(db);
  let valuation = null;
  try {
    valuation = await buildPortfolioValuation(db, broker || '');
  } catch {
    valuation = { primary: {} };
  }
  const p = valuation.primary || {};
  switch (basis) {
    case 'net_worth':
      return assets.totalAssets;
    case 'portfolio_no_cash':
      return p.holdingsValue ?? 0;
    case 'manual':
      return null;
    case 'broker':
    case 'portfolio':
    default:
      return p.totalPortfolio ?? (p.holdingsValue ?? 0) + (p.cashBalance ?? 0);
  }
}

function getMonthlyContributions(db, fromMonth, toMonth, broker = '') {
  const params = [`${fromMonth}-01`, `${toMonth}-31`];
  let sql = `
    SELECT strftime('%Y-%m', date) AS month,
           SUM(CASE WHEN type IN ('Buy','Deposit') THEN ABS(net_amount) ELSE 0 END) AS contributed
    FROM investment_transactions
  `;
  if (broker) {
    sql += ' WHERE broker = ? AND date >= ? AND date <= ?';
    params.unshift(broker);
  } else {
    sql += ' WHERE date >= ? AND date <= ?';
  }
  sql += ' GROUP BY month ORDER BY month ASC';
  const rows = db.prepare(sql).all(...params);

  const map = new Map(rows.map((r) => [r.month, r.contributed || 0]));
  return map;
}

function plannerInputFromGoal(goal, currentValue, years) {
  return {
    principal: currentValue,
    monthlyContribution: 0,
    annualReturn: goal.annual_return ?? 7,
    contributionGrowthRate: goal.contribution_growth ?? 0,
    inflationRate: 0,
    taxDrag: 0,
    feeDrag: 0,
    years,
    compounding: 'monthly',
  };
}

function computeRequiredMonthly(goal, currentValue) {
  if (currentValue >= goal.target_amount) {
    return { monthly: 0, yearly: 0, monthsLeft: 0, weeks: 0 };
  }

  let monthsLeft = 120;
  if (goal.target_date) {
    monthsLeft = Math.max(1, monthsBetween(monthKey(), monthKey(goal.target_date)));
  }

  const years = monthsLeft / 12;
  const monthly = solveForContribution(
    plannerInputFromGoal(goal, currentValue, years),
    goal.target_amount
  );
  return {
    monthly,
    yearly: round2(monthly * 12),
    monthsLeft,
    weeks: round2((monthly * 12) / 52),
  };
}

function yearsToReachAtPace(goal, currentValue, monthlyContribution) {
  if (currentValue >= goal.target_amount) {
    return { years: 0, months: 0, alreadyReached: true };
  }
  const base = plannerInputFromGoal(goal, currentValue, 1);
  let lo = 1;
  let hi = 12 * 80;
  for (let i = 0; i < 48; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const val = runProjection({ ...base, monthlyContribution, years: 0, months: mid }).finalValue;
    if (val >= goal.target_amount) hi = mid;
    else lo = mid + 1;
  }
  const months = hi;
  return { years: round2(months / 12), months, alreadyReached: false };
}

function buildMonthlyProgress(goal, contribMap, requiredMonthly, fromMonth, toMonth) {
  const keys = listMonthKeys(fromMonth, toMonth);
  const threshold = requiredMonthly * 0.85;

  let streak = 0;
  let maxStreak = 0;
  let hitCount = 0;
  let missCount = 0;
  let totalActual = 0;
  let bestMonth = { month: null, amount: 0 };

  const rows = keys.map((m) => {
    const actual = contribMap.get(m) || 0;
    totalActual += actual;
    const hit = requiredMonthly > 0 ? actual >= threshold : actual > 0;
    if (hit) {
      hitCount += 1;
      streak += 1;
      maxStreak = Math.max(maxStreak, streak);
    } else {
      missCount += 1;
      streak = 0;
    }
    if (actual > bestMonth.amount) bestMonth = { month: m, amount: actual };
    return {
      month: m,
      actual: round2(actual),
      required: round2(requiredMonthly),
      hit,
      shortfall: round2(Math.max(0, requiredMonthly - actual)),
      surplus: round2(Math.max(0, actual - requiredMonthly)),
    };
  });

  return {
    rows,
    hitCount,
    missCount,
    totalMonths: keys.length,
    hitRate: keys.length ? round2((hitCount / keys.length) * 100) : 0,
    maxStreak,
    currentStreak: streak,
    totalActual: round2(totalActual),
    avgActual: keys.length ? round2(totalActual / keys.length) : 0,
    bestMonth,
  };
}

async function buildGoalProgress(db, goal) {
  const currentValue =
    goal.basis === 'manual'
      ? goal.starting_amount
      : (await resolveCurrentValue(db, goal.basis, goal.broker || '')) ?? goal.starting_amount;

  const achieved = Math.max(0, currentValue - (goal.starting_amount || 0));
  const remaining = Math.max(0, goal.target_amount - currentValue);
  const progressPct =
    goal.target_amount > 0
      ? Math.min(100, round2((currentValue / goal.target_amount) * 100))
      : 0;

  const req = computeRequiredMonthly(goal, currentValue);
  const pace = yearsToReachAtPace(goal, currentValue, req.monthly);

  const startMonth = goal.tracking_start_month || monthKey(new Date(goal.created_at || Date.now()));
  const thisMonth = monthKey();
  const contribMap = getMonthlyContributions(db, startMonth, thisMonth, goal.broker || '');
  const monthly = buildMonthlyProgress(goal, contribMap, req.monthly, startMonth, thisMonth);

  const thisMonthActual = contribMap.get(thisMonth) || 0;
  const expectedLinear =
    goal.target_date && goal.target_amount > goal.starting_amount
      ? (() => {
          const totalMonths = Math.max(1, monthsBetween(startMonth, monthKey(goal.target_date)));
          const elapsed = Math.max(0, monthsBetween(startMonth, thisMonth));
          const expected = goal.starting_amount +
            ((goal.target_amount - goal.starting_amount) * elapsed) / totalMonths;
          return round2(expected);
        })()
      : null;

  const onTrack =
    expectedLinear != null
      ? currentValue >= expectedLinear * 0.95
        ? 'ahead'
        : currentValue >= expectedLinear * 0.85
          ? 'on_track'
          : 'behind'
      : monthly.hitRate >= 50
        ? 'on_track'
        : 'behind';

  const completed = currentValue >= goal.target_amount;

  return {
    goal: serializeGoal(goal),
    currentValue: round2(currentValue),
    startingAmount: round2(goal.starting_amount),
    targetAmount: round2(goal.target_amount),
    achieved: round2(achieved),
    remaining: round2(remaining),
    progressPct,
    requiredMonthly: req.monthly,
    requiredYearly: req.yearly,
    requiredWeekly: req.weeks,
    monthsLeft: req.monthsLeft,
    projectedYearsAtRequiredPace: pace.years,
    projectedCompletionHint: formatYearsToGoal(pace),
    thisMonth: {
      month: thisMonth,
      actual: round2(thisMonthActual),
      required: req.monthly,
      hit: req.monthly > 0 ? thisMonthActual >= req.monthly * 0.85 : thisMonthActual > 0,
    },
    monthly,
    onTrack,
    completed,
    expectedValueToday: expectedLinear,
    ytdActual: round2(
      [...contribMap.entries()]
        .filter(([m]) => m.startsWith(String(new Date().getFullYear())))
        .reduce((s, [, v]) => s + v, 0)
    ),
  };
}

function formatYearsToGoal(pace) {
  if (pace.alreadyReached) return 'already reached';
  if (pace.months != null && pace.months < 12) return `about ${pace.months} months`;
  return `about ${pace.years} years`;
}

function serializeGoal(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    targetAmount: row.target_amount,
    targetDate: row.target_date,
    startingAmount: row.starting_amount,
    basis: row.basis,
    broker: row.broker,
    annualReturn: row.annual_return,
    contributionGrowth: row.contribution_growth,
    status: row.status,
    notes: row.notes,
    trackingStartMonth: row.tracking_start_month,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getActiveGoal(db) {
  return db.prepare(
    "SELECT * FROM wealth_goals WHERE status = 'active' ORDER BY updated_at DESC LIMIT 1"
  ).get();
}

function listGoals(db) {
  return db.prepare('SELECT * FROM wealth_goals ORDER BY updated_at DESC').all();
}

function deactivateOthers(db, exceptId = null) {
  if (exceptId) {
    db.prepare("UPDATE wealth_goals SET status = 'archived', updated_at = datetime('now') WHERE status = 'active' AND id != ?").run(exceptId);
  } else {
    db.prepare("UPDATE wealth_goals SET status = 'archived', updated_at = datetime('now') WHERE status = 'active'").run();
  }
}

async function createGoal(db, body) {
  const {
    name,
    targetAmount,
    targetDate = null,
    startingAmount: startingIn,
    basis = 'portfolio',
    broker = '',
    annualReturn = 7,
    contributionGrowth = 0,
    notes = null,
    setActive = true,
  } = body;

  if (!name || !targetAmount) throw new Error('name and targetAmount required');

  let startingAmount = startingIn;
  if (startingAmount == null || startingAmount === '') {
    const cur = await resolveCurrentValue(db, basis, broker || '');
    startingAmount = cur ?? 0;
  }

  if (setActive) deactivateOthers(db);

  const trackingStart = monthKey();
  const result = db.prepare(`
    INSERT INTO wealth_goals (
      name, target_amount, target_date, starting_amount, basis, broker,
      annual_return, contribution_growth, status, notes, tracking_start_month, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    name,
    targetAmount,
    targetDate,
    startingAmount,
    basis,
    broker || null,
    annualReturn,
    contributionGrowth,
    setActive ? 'active' : 'paused',
    notes,
    trackingStart
  );

  return db.prepare('SELECT * FROM wealth_goals WHERE id = ?').get(result.lastInsertRowid);
}

async function createGoalAndProgress(db, body) {
  const row = await createGoal(db, body);
  const progress = await buildGoalProgress(db, row);
  return progress;
}

function updateGoal(db, id, body) {
  const existing = db.prepare('SELECT * FROM wealth_goals WHERE id = ?').get(id);
  if (!existing) return null;

  if (body.status === 'active') deactivateOthers(db, id);

  db.prepare(`
    UPDATE wealth_goals SET
      name = COALESCE(?, name),
      target_amount = COALESCE(?, target_amount),
      target_date = COALESCE(?, target_date),
      starting_amount = COALESCE(?, starting_amount),
      basis = COALESCE(?, basis),
      broker = COALESCE(?, broker),
      annual_return = COALESCE(?, annual_return),
      contribution_growth = COALESCE(?, contribution_growth),
      status = COALESCE(?, status),
      notes = COALESCE(?, notes),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    body.name ?? null,
    body.targetAmount ?? null,
    body.targetDate ?? null,
    body.startingAmount ?? null,
    body.basis ?? null,
    body.broker ?? null,
    body.annualReturn ?? null,
    body.contributionGrowth ?? null,
    body.status ?? null,
    body.notes ?? null,
    id
  );

  return db.prepare('SELECT * FROM wealth_goals WHERE id = ?').get(id);
}

function deleteGoal(db, id) {
  db.prepare('DELETE FROM wealth_goals WHERE id = ?').run(id);
}

module.exports = {
  buildGoalProgress,
  getActiveGoal,
  listGoals,
  createGoal,
  createGoalAndProgress,
  updateGoal,
  deleteGoal,
  serializeGoal,
  resolveCurrentValue,
  monthKey,
};
