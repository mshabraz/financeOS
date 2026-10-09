#!/usr/bin/env node
/**
 * Unit tests for assetAllocationEngine (no DB).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const {
  calculateAssetAllocation,
} = require(path.join(ROOT, 'backend', 'src', 'services', 'assetAllocationEngine.js'));

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${msg}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${msg}`);
  }
}

function almost(a, b, eps = 0.02) {
  return Math.abs(a - b) <= eps;
}

const categories = [
  { id: 1, name: 'Equities', color: '#0ea5e9', sortOrder: 0 },
  { id: 2, name: 'Bonds', color: '#10b981', sortOrder: 1 },
  { id: 3, name: 'Cash', color: '#f59e0b', sortOrder: 2 },
];

console.log('targets sum 100% + underweight buy plan');
{
  const r = calculateAssetAllocation({
    holdings: [
      { broker: 'ly', ticker: 'VUSA', currency: 'EUR', marketValueEur: 700 },
      { broker: 'ly', ticker: 'BOND', currency: 'EUR', marketValueEur: 200 },
    ],
    strategy: { includeBrokerCash: false },
    categories,
    targets: [
      { categoryId: 1, targetPct: 60 },
      { categoryId: 2, targetPct: 30 },
      { categoryId: 3, targetPct: 10 },
    ],
    maps: [
      { holdingKey: 'ly|VUSA|EUR', categoryId: 1 },
      { holdingKey: 'ly|BOND|EUR', categoryId: 2 },
    ],
    monthlyContribution: 100,
    brokerCashEur: 0,
  });
  assert(r.targetsValid, 'targetsValid');
  assert(almost(r.targetSumPct, 100), `targetSumPct=${r.targetSumPct}`);
  assert(almost(r.totalPortfolioEur, 900), `total=${r.totalPortfolioEur}`);
  const eq = r.categories.find((c) => c.id === 1);
  const bonds = r.categories.find((c) => c.id === 2);
  const cash = r.categories.find((c) => c.id === 3);
  assert(almost(eq.actualPct, 77.7778, 0.1), `equities actual ${eq.actualPct}`);
  assert(almost(bonds.actualPct, 22.2222, 0.1), `bonds actual ${bonds.actualPct}`);
  assert(almost(cash.actualPct, 0), 'cash actual 0');
  assert(eq.driftPct > 0, 'equities overweight');
  assert(bonds.driftPct < 0, 'bonds underweight');
  assert(cash.driftPct < 0, 'cash underweight');
  const planSum = r.depositPlan.reduce((s, p) => s + p.depositEur, 0);
  assert(almost(planSum, 100), `deposit plan sums to 100 (got ${planSum})`);
  assert(!r.depositPlan.some((p) => p.categoryId === 1), 'overweight equities get €0 deposit');
  assert(r.depositPlan.some((p) => p.categoryId === 2), 'bonds get deposit');
  assert(r.depositPlan.some((p) => p.categoryId === 3), 'cash gets deposit');
}

console.log('unmapped holdings');
{
  const r = calculateAssetAllocation({
    holdings: [
      { broker: 'ly', ticker: 'AAA', currency: 'EUR', marketValueEur: 500 },
      { broker: 'ly', ticker: 'BBB', currency: 'EUR', marketValueEur: 500 },
    ],
    strategy: {},
    categories: [{ id: 1, name: 'Equities', color: '#0ea5e9', sortOrder: 0 }],
    targets: [{ categoryId: 1, targetPct: 100 }],
    maps: [{ holdingKey: 'ly|AAA|EUR', categoryId: 1 }],
    monthlyContribution: 0,
  });
  assert(almost(r.unmapped.valueEur, 500), `unmapped=${r.unmapped.valueEur}`);
  assert(almost(r.categories[0].valueEur, 500), 'mapped value 500');
}

console.log('zero contribution');
{
  const r = calculateAssetAllocation({
    holdings: [{ broker: 'ly', ticker: 'A', currency: 'EUR', marketValueEur: 100 }],
    strategy: {},
    categories: [{ id: 1, name: 'X', color: '#000', sortOrder: 0 }],
    targets: [{ categoryId: 1, targetPct: 100 }],
    maps: [{ holdingKey: 'ly|A|EUR', categoryId: 1 }],
    monthlyContribution: 0,
  });
  assert(r.depositPlan.length === 0, 'empty deposit plan');
  assert(!!r.depositNote, 'has deposit note');
}

console.log('include broker cash');
{
  const r = calculateAssetAllocation({
    holdings: [{ broker: 'ly', ticker: 'A', currency: 'EUR', marketValueEur: 900 }],
    strategy: { includeBrokerCash: true, cashCategoryId: 2 },
    categories: [
      { id: 1, name: 'Equities', color: '#0ea5e9', sortOrder: 0 },
      { id: 2, name: 'Cash', color: '#f59e0b', sortOrder: 1 },
    ],
    targets: [
      { categoryId: 1, targetPct: 90 },
      { categoryId: 2, targetPct: 10 },
    ],
    maps: [{ holdingKey: 'ly|A|EUR', categoryId: 1 }],
    monthlyContribution: 50,
    brokerCashEur: 100,
  });
  assert(almost(r.totalPortfolioEur, 1000), `total with cash=${r.totalPortfolioEur}`);
  assert(almost(r.categories.find((c) => c.id === 2).valueEur, 100), 'cash category 100');
  assert(almost(r.categories.find((c) => c.id === 2).actualPct, 10), 'cash at target');
}

console.log('invalid targets flagged');
{
  const r = calculateAssetAllocation({
    holdings: [],
    strategy: {},
    categories: [
      { id: 1, name: 'A', color: '#000', sortOrder: 0 },
      { id: 2, name: 'B', color: '#111', sortOrder: 1 },
    ],
    targets: [
      { categoryId: 1, targetPct: 40 },
      { categoryId: 2, targetPct: 40 },
    ],
    maps: [],
  });
  assert(!r.targetsValid, 'targetsValid false when sum != 100');
  assert(almost(r.targetSumPct, 80), 'sum 80');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
