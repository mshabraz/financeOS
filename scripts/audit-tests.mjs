#!/usr/bin/env node
/**
 * Domain logic tests (no framework) — run via npm test
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error(`  ✗ ${msg}`);
    failed += 1;
    return;
  }
  console.log(`  ✓ ${msg}`);
}

console.log('FinanceOS audit tests\n');

const { sanitizeDateParam, sanitizeDateRange } = require(path.join(ROOT, 'backend/src/utils/dateParams.js'));
assert(sanitizeDateParam('2024-06-15') === '2024-06-15', 'valid date accepted');
try {
  sanitizeDateParam("2024-06-15'; DROP TABLE--");
  assert(false, 'invalid date rejected');
} catch {
  assert(true, 'invalid date rejected');
}
assert(sanitizeDateRange({ dateFrom: '2024-01-01', dateTo: '2024-12-31' }).dateFrom === '2024-01-01', 'date range ok');

const {
  computeRevolutAmountFields,
  isRevolutFundingDescription,
} = require(path.join(ROOT, 'backend/src/services/revolutCalculations.js'));

const expense = computeRevolutAmountFields({ amount: -100, revolut_type: 'Card Payment', description: 'Shop' });
assert(expense.effective_amount === -50, 'default 50% split on expense');
assert(expense.exclude_from_analytics === 0, 'expense included in analytics');

const funding = computeRevolutAmountFields({ amount: 200, revolut_type: 'Topup', description: 'Top-up' });
assert(funding.exclude_from_analytics === 1, 'topup excluded from analytics');
assert(isRevolutFundingDescription('Payment from John'), 'funding description detected');

const { applyRuleToExisting } = require(path.join(ROOT, 'backend/src/services/categorizer.js'));
assert(typeof applyRuleToExisting === 'function', 'applyRuleToExisting exported');

console.log(`\nAudit tests: ${failed} failed`);
process.exit(failed ? 1 : 0);
