const { roundMoney } = require('./settlement');

/**
 * Build per-person share rows from split config.
 * @param {number} total
 * @param {'equal_all'|'equal_subset'|'single'|'custom'} splitType
 * @param {number[]} allParticipantIds
 * @param {number[]} subsetIds - for equal_subset
 * @param {number|null} assigneeId - for single
 * @param {{ participantId: number, amount: number }[]} customShares
 */
function computeShares(total, splitType, allParticipantIds, subsetIds, assigneeId, customShares) {
  const t = roundMoney(total);
  if (t <= 0) return [];

  if (splitType === 'custom') {
    return customShares.map((s) => ({
      participantId: s.participantId,
      amount: roundMoney(s.amount),
    }));
  }

  if (splitType === 'single') {
    if (!assigneeId) throw new Error('assignee required for single split');
    return [{ participantId: assigneeId, amount: t }];
  }

  const ids = splitType === 'equal_all' ? allParticipantIds : subsetIds;
  if (!ids?.length) throw new Error('no participants for split');
  const each = roundMoney(t / ids.length);
  const rows = ids.map((id) => ({ participantId: id, amount: each }));
  const sum = roundMoney(rows.reduce((s, r) => s + r.amount, 0));
  const drift = roundMoney(t - sum);
  if (drift !== 0 && rows.length) rows[0].amount = roundMoney(rows[0].amount + drift);
  return rows;
}

function validateExpense(total, payers, shares) {
  const paySum = roundMoney(payers.reduce((s, p) => s + p.amount, 0));
  const shareSum = roundMoney(shares.reduce((s, sh) => s + sh.amount, 0));
  const t = roundMoney(total);
  if (Math.abs(paySum - t) > 0.02) {
    throw new Error(`Payments (${paySum}) must equal expense total (${t})`);
  }
  if (Math.abs(shareSum - t) > 0.02) {
    throw new Error(`Shares (${shareSum}) must equal expense total (${t})`);
  }
}

module.exports = { computeShares, validateExpense };
