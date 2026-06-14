/**
 * Remove bank ledger rows that duplicate Revolut card charges already in revolut_transactions.
 * Banks (SEB/Swedbank) often record the same Revolut card payment on the current account.
 */

function normalizeMerchantToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function merchantsLikelyMatch(revolutDescription, bankRow) {
  const a = normalizeMerchantToken(revolutDescription);
  const b = normalizeMerchantToken(
    bankRow.merchant || bankRow.beneficiary || bankRow.details || '',
  );
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
  return false;
}

function shiftIsoDate(dateStr, dayDelta) {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + dayDelta);
  return d.toISOString().slice(0, 10);
}

/**
 * When Revolut OB sync imports card spend, drop matching bank rows (±3 days, same amount).
 * @returns {number} rows deleted from transactions
 */
function removeBankRowsMatchingRevolutCharges(db, revolutRows) {
  if (!revolutRows?.length) return 0;

  const selectCandidates = db.prepare(`
    SELECT id, date, amount, beneficiary, merchant, details
    FROM transactions
    WHERE date BETWEEN ? AND ?
      AND amount < 0
      AND ABS(amount) BETWEEN ? AND ?
  `);
  const deleteStmt = db.prepare('DELETE FROM transactions WHERE id = ?');

  let removed = 0;

  const run = db.transaction(() => {
    for (const rev of revolutRows) {
      const amount = Number(rev.amount);
      if (!Number.isFinite(amount) || amount >= 0) continue;

      const absAmt = Math.abs(amount);
      if (absAmt < 0.01) continue;

      const date = rev.date;
      if (!date) continue;

      const candidates = selectCandidates.all(
        shiftIsoDate(date, -3),
        shiftIsoDate(date, 3),
        absAmt - 0.01,
        absAmt + 0.01,
      );

      for (const bank of candidates) {
        if (!merchantsLikelyMatch(rev.description, bank)) continue;
        deleteStmt.run(bank.id);
        removed++;
      }
    }
  });

  run();
  return removed;
}

/**
 * Delete zero-amount noise rows (card pre-auths, placeholders).
 * @returns {number}
 */
function removeZeroAmountBankRows(db) {
  return db.prepare(
    `DELETE FROM transactions WHERE amount = 0 OR ABS(amount) < 0.01`,
  ).run().changes;
}

function removeZeroAmountRevolutRows(db) {
  return db.prepare(
    `DELETE FROM revolut_transactions WHERE amount = 0 OR ABS(amount) < 0.01`,
  ).run().changes;
}

module.exports = {
  removeBankRowsMatchingRevolutCharges,
  removeZeroAmountBankRows,
  removeZeroAmountRevolutRows,
  merchantsLikelyMatch,
};
