/**
 * Skip pending / non-booked Open Banking transactions until they are final.
 */

function shouldImportObTransaction(tx) {
  if (!tx || typeof tx !== 'object') return false;

  const status = String(tx.status || tx.booking_status || '').trim().toUpperCase();
  if (status === 'PENDING' || status === 'PDNG') return false;

  if (tx.booked === false) return false;

  return true;
}

function filterBookedObTransactions(rawTransactions) {
  return (rawTransactions || []).filter(shouldImportObTransaction);
}

module.exports = { shouldImportObTransaction, filterBookedObTransactions };
