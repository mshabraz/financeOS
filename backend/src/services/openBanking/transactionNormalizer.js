/**
 * Map Enable Banking transaction objects to FinanceOS bank import rows.
 */

const crypto = require('crypto');
const { normalizeMerchantName } = require('../csvParser');

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

function generateFingerprint({ transferRef, date, amount, direction, beneficiary }) {
  const key = transferRef
    ? `ref:${transferRef}`
    : `tx:${date}:${amount}:${direction}:${(beneficiary || '').toLowerCase()}`;
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 32);
}

/**
 * @param {object} tx Enable Banking transaction
 * @param {string} accountIban Owner account IBAN
 */
function normalizeTransaction(tx, accountIban) {
  const date = pickDate(tx);
  const absAmount = parseAmount(tx.transaction_amount?.amount);
  if (!date || !Number.isFinite(absAmount)) {
    return { valid: false, reason: 'Missing date or amount', raw: tx };
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

  const fingerprint = generateFingerprint({
    transferRef,
    date,
    amount: absAmount,
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

module.exports = { normalizeTransaction, normalizeTransactions, generateFingerprint };
