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

const {
  sanitizeDateParam,
  sanitizeDateRange,
  monthKeyToDateTo,
} = require(path.join(ROOT, 'backend/src/utils/dateParams.js'));
assert(sanitizeDateParam('2024-06-15') === '2024-06-15', 'valid date accepted');
try {
  sanitizeDateParam("2024-06-15'; DROP TABLE--");
  assert(false, 'invalid date rejected');
} catch {
  assert(true, 'invalid date rejected');
}
assert(sanitizeDateRange({ dateFrom: '2024-01-01', dateTo: '2024-12-31' }).dateFrom === '2024-01-01', 'date range ok');
assert(monthKeyToDateTo('2026-06') === '2026-06-30', 'June last day not -31');
assert(monthKeyToDateTo('2024-02') === '2024-02-29', 'Feb leap year last day');

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

const { normalizeObToRevolut } = require(path.join(
  ROOT,
  'backend/src/services/openBanking/revolutObNormalizer.js',
));
const obCard = normalizeObToRevolut(
  {
    booking_date: '2026-06-11',
    credit_debit_indicator: 'DBIT',
    transaction_amount: { amount: '65.20', currency: 'EUR' },
    bank_transaction_code: { code: 'CARD_PAYMENT', description: 'Card payment' },
    creditor: { name: 'Circle K' },
    entry_reference: '6a2ad5c6-0e08-a3db-ab3d-15a585ca8b3d',
  },
  'LT703250048821607547',
  0.5,
);
assert(obCard.valid, 'OB Revolut card payment normalizes');
assert(obCard.effective_amount === -32.6, 'OB Revolut expense uses 50% split');
assert(obCard.import_source === 'open_banking', 'OB Revolut import source tag');

const { applyRuleToExisting } = require(path.join(ROOT, 'backend/src/services/categorizer.js'));
assert(typeof applyRuleToExisting === 'function', 'applyRuleToExisting exported');

const {
  recordManualCategoryLocks,
  resolveImportCategory,
  keysForImport,
} = require(path.join(ROOT, 'backend/src/services/manualCategoryLocks.js'));
assert(typeof recordManualCategoryLocks === 'function', 'manual category locks exported');

// In-memory lock resolution (no DB): keysForImport shape
const { pickPrimaryBalance } = require(path.join(
  ROOT,
  'backend/src/services/openBanking/balanceUtils.js',
));
const clbd = pickPrimaryBalance({
  balances: [
    { balance_type: 'CLBD', balance_amount: { amount: '169.83', currency: 'EUR' }, reference_date: '2026-06-09' },
    { balance_type: 'ITAV', balance_amount: { amount: '103.20', currency: 'EUR' }, reference_date: '2026-06-14' },
  ],
});
assert(clbd?.amount === 103.2, 'prefers ITAV available balance over CLBD booked');

console.log(`\nAudit tests: ${failed} failed`);
process.exit(failed ? 1 : 0);
