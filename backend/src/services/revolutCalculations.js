/**
 * Revolut amount rules for unified finance analytics.
 * - Original `amount` is always preserved in storage.
 * - `effective_amount` is used for dashboards, tags, budgets, trends.
 * - Shared household expenses: debits count at split_ratio (default 50%).
 * - Income/refunds: full amount (100%).
 * - Funding/top-ups: excluded from analytics to avoid double-counting with bank transfers.
 */

const DEFAULT_EXPENSE_SPLIT_RATIO = 0.5;

/** Revolut CSV "Type" values that fund the wallet — not spending or income for analytics */
const FUNDING_TYPES = new Set([
  'topup',
  'top-up',
  'top up',
]);

function normalizeType(revolutType) {
  return (revolutType || '').trim().toLowerCase();
}

function isRevolutFundingType(revolutType) {
  const t = normalizeType(revolutType);
  if (FUNDING_TYPES.has(t)) return true;
  if (t.includes('topup') || t.includes('top-up') || t.includes('top up')) return true;
  // Portuguese Revolut export: "Carregamento"
  if (t === 'carregamento' || t.includes('carregamento')) return true;
  return false;
}

function isRevolutFundingDescription(description) {
  const d = (description || '').trim().toLowerCase();
  if (!d) return false;
  if (d.includes('top-up') || d.includes('topup')) return true;
  if (d.startsWith('carregamento de ') || d.startsWith('carregamento ')) return true;
  // Inbound transfers that load the Revolut balance (not card spend)
  if (/^payment from /.test(d) && !d.includes('refund')) return true;
  return false;
}

/**
 * @returns {{
 *   effective_amount: number,
 *   split_ratio: number|null,
 *   exclude_from_analytics: number,
 *   applies_shared_split: number,
 *   direction: 'D'|'K',
 * }}
 */
function computeRevolutAmountFields({ amount, revolut_type, description, splitRatioOverride }) {
  const amt = Number(amount);
  if (!Number.isFinite(amt)) {
    return {
      effective_amount: 0,
      split_ratio: null,
      exclude_from_analytics: 1,
      applies_shared_split: 0,
      direction: 'D',
    };
  }

  if (isRevolutFundingType(revolut_type) || isRevolutFundingDescription(description)) {
    return {
      effective_amount: amt,
      split_ratio: null,
      exclude_from_analytics: 1,
      applies_shared_split: 0,
      direction: amt >= 0 ? 'K' : 'D',
    };
  }

  const direction = amt >= 0 ? 'K' : 'D';

  // Expenses (outflows): shared 50% by default
  if (amt < 0) {
    const ratio =
      splitRatioOverride != null && Number.isFinite(Number(splitRatioOverride))
        ? Number(splitRatioOverride)
        : DEFAULT_EXPENSE_SPLIT_RATIO;
    const effective = amt * ratio;
    return {
      effective_amount: effective,
      split_ratio: ratio,
      exclude_from_analytics: 0,
      applies_shared_split: ratio < 1 ? 1 : 0,
      direction: 'D',
    };
  }

  // Income / refunds: 100%
  return {
    effective_amount: amt,
    split_ratio: null,
    exclude_from_analytics: 0,
    applies_shared_split: 0,
    direction: 'K',
  };
}

/** Recompute stored fields for one row (after import or settings change). */
function fieldsFromRow(row, splitRatioOverride) {
  return computeRevolutAmountFields({
    amount: row.amount,
    revolut_type: row.revolut_type,
    description: row.description,
    splitRatioOverride: splitRatioOverride ?? row.split_ratio,
  });
}

function backfillRevolutAmounts(db) {
  const rows = db.prepare('SELECT id, amount, revolut_type, description, split_ratio FROM revolut_transactions').all();
  const update = db.prepare(`
    UPDATE revolut_transactions
    SET effective_amount = @effective_amount,
        split_ratio = @split_ratio,
        exclude_from_analytics = @exclude_from_analytics,
        applies_shared_split = @applies_shared_split
    WHERE id = @id
  `);
  const run = db.transaction(() => {
    for (const row of rows) {
      const f = fieldsFromRow(row);
      update.run({
        id: row.id,
        effective_amount: f.effective_amount,
        split_ratio: f.split_ratio,
        exclude_from_analytics: f.exclude_from_analytics,
        applies_shared_split: f.applies_shared_split,
      });
    }
  });
  run();
  return rows.length;
}

function getRevolutExpenseSplitRatio(db) {
  try {
    const row = db.prepare(
      "SELECT value FROM app_settings WHERE key = 'revolut_expense_split_ratio'"
    ).get();
    const n = parseFloat(row?.value);
    if (Number.isFinite(n) && n > 0 && n <= 1) return n;
  } catch {
    /* app_settings may not exist on old DBs */
  }
  return DEFAULT_EXPENSE_SPLIT_RATIO;
}

module.exports = {
  DEFAULT_EXPENSE_SPLIT_RATIO,
  getRevolutExpenseSplitRatio,
  isRevolutFundingType,
  isRevolutFundingDescription,
  computeRevolutAmountFields,
  fieldsFromRow,
  backfillRevolutAmounts,
};
