/**
 * Pick the balance type that best matches internet banking "account balance".
 * @see https://enablebanking.com/docs/faq/ — CLBD, ITAV, XPCD are common.
 */

const PREFERRED_TYPES = ['ITAV', 'CLBD', 'XPCD', 'OPBD', 'OTHR'];

function parseAmount(raw) {
  if (raw == null || raw === '') return NaN;
  const n = parseFloat(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function balanceRowToFields(row) {
  if (!row?.balance_amount) return null;
  const amount = parseAmount(row.balance_amount.amount);
  if (!Number.isFinite(amount)) return null;
  return {
    amount,
    currency: row.balance_amount.currency || 'EUR',
    asOf: row.reference_date || row.last_change_date_time || null,
    balanceType: row.balance_type || null,
  };
}

function pickPrimaryBalance(balancesResponse) {
  const list = balancesResponse?.balances || [];
  if (!list.length) return null;

  for (const type of PREFERRED_TYPES) {
    const row = list.find((b) => String(b.balance_type || '').toUpperCase() === type);
    const fields = balanceRowToFields(row);
    if (fields) return fields;
  }

  for (const row of list) {
    const fields = balanceRowToFields(row);
    if (fields) return fields;
  }

  return null;
}

module.exports = { pickPrimaryBalance, parseAmount };
