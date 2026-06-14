/**
 * Map Enable Banking transaction objects to FinanceOS bank import rows.
 */

const { normalizeMerchantName } = require('../csvParser');
const { canonicalBankFingerprint } = require('../bankDedup');
const { shouldImportObTransaction } = require('./obTransactionFilter');

function pickDate(tx) {
  return tx.booking_date || tx.value_date || tx.transaction_date || null;
}

function parseAmount(raw) {
  if (raw == null || raw === '') return NaN;
  const n = parseFloat(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
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

/**
 * @param {object} tx Enable Banking transaction
 * @param {string} accountIban Owner account IBAN
 */
function normalizeTransaction(tx, accountIban) {
  if (!shouldImportObTransaction(tx)) {
    return { valid: false, reason: 'Skipped pending transaction', raw: tx };
  }

  const date = pickDate(tx);
  const absAmount = parseAmount(tx.transaction_amount?.amount);
  if (!date || !Number.isFinite(absAmount)) {
    return { valid: false, reason: 'Missing date or amount', raw: tx };
  }
  if (absAmount < 0.01) {
    return { valid: false, reason: 'Skipped zero-amount transaction', raw: tx };
  }

  const indicator = (tx.credit_debit_indicator || '').toUpperCase();
  const isCredit = indicator === 'CRDT' || indicator === 'C';
  const direction = isCredit ? 'K' : 'D';
  const amount = isCredit ? absAmount : -absAmount;
  const beneficiary = counterpartyName(tx, isCredit);
  const reference = remittanceText(tx);
  const detailsParts = [
    reference,
    tx.bank_transaction_code?.description,
    tx.note,
  ].filter(Boolean);
  const details = detailsParts.join(' — ') || reference || beneficiary || 'Open banking transaction';
  const merchant = normalizeMerchantName(beneficiary || details);
  const transferRef =
    tx.entry_reference ||
    tx.transaction_id ||
    null;
  const currency = tx.transaction_amount?.currency || 'EUR';

  const fingerprint = canonicalBankFingerprint({
    account: accountIban || 'UNKNOWN',
    transferRef,
    reference_number: tx.reference_number || null,
    date,
    amount,
    direction,
    beneficiary,
  });

  return {
    valid: true,
    fingerprint,
    account: accountIban || 'UNKNOWN',
    date,
    beneficiary: beneficiary || null,
    merchant: merchant || null,
    details,
    amount,
    currency,
    direction,
    transferRef,
    transactionType: tx.bank_transaction_code?.code || 'OB',
    referenceNumber: tx.reference_number || null,
    documentNumber: null,
  };
}

function normalizeTransactions(rawTransactions, accountIban) {
  const transactions = [];
  const errors = [];
  for (const tx of rawTransactions || []) {
    const row = normalizeTransaction(tx, accountIban);
    if (row.valid) transactions.push(row);
    else errors.push({ reason: row.reason, raw: row.raw });
  }
  return { transactions, errors };
}

module.exports = { normalizeTransaction, normalizeTransactions };
