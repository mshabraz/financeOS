/**
 * Bank CSV debit/credit indicators.
 * LHV uses K (kreedit) / D. SEB uses C (credit) / D. Amounts are always positive in the file.
 */

function normalizeBankDirection(raw) {
  const d = String(raw || '').trim().toUpperCase();
  if (d === 'K' || d === 'C') return 'K';
  if (d === 'D') return 'D';
  return null;
}

/** @returns {number|null} signed amount for storage (credit positive, debit negative) */
function signedAmountFromIndicator(absAmount, rawDirection) {
  const dir = normalizeBankDirection(rawDirection);
  if (!dir || !Number.isFinite(absAmount)) return null;
  return dir === 'K' ? absAmount : -absAmount;
}

module.exports = { normalizeBankDirection, signedAmountFromIndicator };
