/** Stable row identity + API payload for shared expense settlements. */

export function transferToPayload(t) {
  return {
    fromParticipantId: Number(t.fromId ?? t.from_id),
    toParticipantId: Number(t.toId ?? t.to_id),
    amount: Number(t.amount),
  };
}

/** Unique per list row (index), not per amount — avoids duplicate-key selection bugs. */
export function transferRowId(index) {
  return `row-${index}`;
}

export function isValidTransfer(t) {
  const from = t.fromId ?? t.from_id;
  const to = t.toId ?? t.to_id;
  return from != null && to != null && Number(t.amount) > 0;
}
