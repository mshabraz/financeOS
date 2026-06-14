/**
 * Map Enable Banking transactions into revolut_transactions rows
 * (same 50% household split rules as Revolut CSV import).
 */

const { computeRevolutAmountFields, getRevolutExpenseSplitRatio } = require('../revolutCalculations');
const { canonicalRevolutFingerprint } = require('../revolutDedup');
const { shouldImportObTransaction } = require('./obTransactionFilter');

function parseAmount(raw) {
  if (raw == null || raw === '') return NaN;
  const n = parseFloat(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function pickDate(tx) {
  return tx.booking_date || tx.value_date || tx.transaction_date || null;
}

function remittanceText(tx) {
  const ri = tx.remittance_information;
  if (Array.isArray(ri)) return ri.filter(Boolean).join(' | ');
  if (typeof ri === 'string') return ri;
  return '';
}

function counterpartyName(tx, isCredit) {
  const party = isCredit ? tx.debtor : tx.creditor;
  return party?.name || '';
}

function mapRevolutType(tx) {
  const code = (tx.bank_transaction_code?.code || '').toUpperCase();
  const desc = (tx.bank_transaction_code?.description || '').trim();
  if (code.includes('CARD') || /card payment/i.test(desc)) return 'Card Payment';
  if (code.includes('TOP') || /top-?up/i.test(desc)) return 'Topup';
  if (code.includes('FEE') || /fee/i.test(desc)) return 'Fee';
  if (code.includes('TRANSFER') || /transfer/i.test(desc)) return 'Transfer';
  if (desc) return desc;
  if (code) return code.replace(/_/g, ' ');
  return 'Open Banking';
}

function isoDatetimeFromDate(date) {
  if (!date) return null;
  const m = String(date).match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  return `${m[1]} 00:00:00`;
}

function pickCompletedDatetime(tx, date) {
  const raw =
    tx.booking_date_time ||
    tx.value_date_time ||
    tx.creation_time ||
    tx.transaction_date_time ||
    null;
  if (raw) {
    const normalized = String(raw).replace('T', ' ').slice(0, 19);
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)) return normalized;
  }
  return isoDatetimeFromDate(date);
}

function normalizeObToRevolut(tx, accountIban, splitRatio) {
  if (!shouldImportObTransaction(tx)) {
    return { valid: false, reason: 'Skipped pending transaction', raw: tx };
  }

  const date = pickDate(tx);
  const absAmount = parseAmount(tx.transaction_amount?.amount);
  if (!date || !Number.isFinite(absAmount)) {
    return { valid: false, reason: 'Missing date or amount', raw: tx };
  }

  const indicator = (tx.credit_debit_indicator || '').toUpperCase();
  const isCredit = indicator === 'CRDT' || indicator === 'C';
  const amount = isCredit ? absAmount : -absAmount;
  const beneficiary = counterpartyName(tx, isCredit);
  const reference = remittanceText(tx);
  const description =
    beneficiary ||
    reference ||
    tx.bank_transaction_code?.description ||
    tx.note ||
    'Open banking transaction';
  const revolutType = mapRevolutType(tx);
  const transferRef = tx.entry_reference || tx.transaction_id || null;
  const currency = tx.transaction_amount?.currency || 'EUR';
  const completedDatetime = pickCompletedDatetime(tx, date);

  const amountFields = computeRevolutAmountFields({
    amount,
    revolut_type: revolutType,
    description,
    splitRatioOverride: splitRatio,
  });

  const fingerprint = canonicalRevolutFingerprint({
    product: accountIban || 'Revolut',
    transfer_ref: transferRef,
    revolut_type: revolutType,
    completed_datetime: completedDatetime,
    description,
    amount,
    fee: 0,
    currency,
    state: 'COMPLETED',
  });

  return {
    valid: true,
    fingerprint,
    revolut_type: revolutType,
    product: accountIban || 'Revolut',
    started_datetime: completedDatetime,
    completed_datetime: completedDatetime,
    date,
    description,
    amount,
    fee: 0,
    currency,
    state: 'COMPLETED',
    balance_after: null,
    raw_balance: null,
    import_source: 'open_banking',
    transfer_ref: transferRef,
    effective_amount: amountFields.effective_amount,
    split_ratio: amountFields.split_ratio,
    exclude_from_analytics: amountFields.exclude_from_analytics,
    applies_shared_split: amountFields.applies_shared_split,
  };
}

function normalizeObToRevolutBatch(rawTransactions, accountIban, db) {
  const splitRatio = getRevolutExpenseSplitRatio(db);
  const transactions = [];
  const errors = [];
  for (const tx of rawTransactions || []) {
    const row = normalizeObToRevolut(tx, accountIban, splitRatio);
    if (row.valid) transactions.push(row);
    else errors.push({ reason: row.reason, raw: row.raw });
  }
  return { transactions, errors };
}

module.exports = {
  normalizeObToRevolut,
  normalizeObToRevolutBatch,
  mapRevolutType,
};
