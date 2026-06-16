/**
 * Essential (fixed baseline) vs variable (discretionary) expense classification.
 * Users can override per category on the Categories page.
 */

const DEFAULT_ESSENTIAL_NAMES = new Set([
  'groceries',
  'utilities',
  'accommodation',
  'phone & internet',
  'subscriptions',
  'health & fitness',
  'transport',
]);

const DEFAULT_VARIABLE_NAMES = new Set([
  'restaurants',
  'coffee & cafes',
  'entertainment',
  'wellness & spa',
  'shopping',
  'other expenses',
  'uncategorized',
]);

function defaultTierForCategory({ name, type }) {
  if (type !== 'expense') return null;
  const key = String(name || '').trim().toLowerCase();
  if (DEFAULT_ESSENTIAL_NAMES.has(key)) return 'essential';
  if (DEFAULT_VARIABLE_NAMES.has(key)) return 'variable';
  return 'variable';
}

function applyDefaultExpenseTiers(db) {
  const rows = db.prepare('SELECT id, name, type, expense_tier FROM categories').all();
  const update = db.prepare(
    `UPDATE categories SET expense_tier = ? WHERE id = ? AND (expense_tier IS NULL OR expense_tier = '')`,
  );
  let updated = 0;
  for (const row of rows) {
    const tier = defaultTierForCategory(row);
    if (tier && !row.expense_tier) {
      update.run(tier, row.id);
      updated += 1;
    }
  }
  return updated;
}

module.exports = {
  DEFAULT_ESSENTIAL_NAMES,
  DEFAULT_VARIABLE_NAMES,
  defaultTierForCategory,
  applyDefaultExpenseTiers,
};
