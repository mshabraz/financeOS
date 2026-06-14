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

const {
  canonicalBankFingerprint,
  isDuplicateBankTx,
  loadBankDedupSets,
} = require(path.join(ROOT, 'backend/src/services/bankDedup.js'));
const sebFp = canonicalBankFingerprint({
  account: 'EE702200221072319566',
  archiveId: 'ARCH123',
  documentNo: 'DOC1',
  date: '2026-06-05',
  amount: 2323.37,
  direction: 'K',
  beneficiary: 'GENIUS SPORTS SERVICES EESTI OÜ',
});
const obFp = canonicalBankFingerprint({
  account: 'EE702200221072319566',
  transferRef: 'OB-ENTRY-999',
  date: '2026-06-05',
  amount: 2323.37,
  direction: 'K',
  beneficiary: 'GENIUS SPORTS SERVICES EESTI OÜ',
});
const sets = {
  fingerprints: new Set(),
  refKeys: new Set(),
  contentKeys: new Set(['2026-06-05|2323.37|K|genius sports services eesti oü']),
};
assert(isDuplicateBankTx({ fingerprint: obFp, account: 'EE702200221072319566', transferRef: 'OB-ENTRY-999', date: '2026-06-05', amount: 2323.37, direction: 'K', beneficiary: 'GENIUS SPORTS SERVICES EESTI OÜ' }, sets), 'OB salary matches existing content key');
assert(sebFp !== obFp, 'SEB and OB fingerprints differ but content dedup catches dupes');

const {
  canonicalRevolutFingerprint,
  isDuplicateRevolutTx,
} = require(path.join(ROOT, 'backend/src/services/revolutDedup.js'));
const csvRevFp = canonicalRevolutFingerprint({
  product: 'Revolut',
  revolut_type: 'Topup',
  completed_datetime: '2026-06-04 12:00:00',
  description: 'Payment from MUHAMMAD SHABRAZ',
  amount: 200,
  fee: 0,
  currency: 'EUR',
  state: 'COMPLETED',
});
const obRevFp = canonicalRevolutFingerprint({
  product: 'LT703250048821607547',
  transfer_ref: 'REV-REF-1',
  revolut_type: 'Topup',
  completed_datetime: '2026-06-04 00:00:00',
  description: 'Payment from MUHAMMAD SHABRAZ',
  amount: 200,
  fee: 0,
  currency: 'EUR',
  state: 'COMPLETED',
});
const revSets = {
  fingerprints: new Set(),
  refKeys: new Set(),
  contentKeys: new Set(['2026-06-04|200.00|payment from muhammad shabraz']),
};
assert(isDuplicateRevolutTx({ fingerprint: obRevFp, product: 'LT703250048821607547', transfer_ref: 'REV-REF-1', date: '2026-06-04', amount: 200, description: 'Payment from MUHAMMAD SHABRAZ' }, revSets), 'OB Revolut topup matches content key');
assert(csvRevFp !== obRevFp, 'CSV and OB Revolut fingerprints differ');

console.log(`\nAudit tests: ${failed} failed`);
process.exit(failed ? 1 : 0);
