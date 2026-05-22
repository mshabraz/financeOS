/**
 * Categorization engine.
 * Matches transactions against category_rules stored in the database.
 * Rules are prioritized and can match on merchant, beneficiary, or details fields.
 * Manual corrections are remembered and update rule hit counts.
 */

const { getDb } = require('../db/database');

let _rulesCache = null;
let _cacheTs = 0;
let _defaultCategory = null;
const CACHE_TTL_MS = 30_000; // Re-read rules every 30s

function getRules() {
  const now = Date.now();
  if (_rulesCache && now - _cacheTs < CACHE_TTL_MS) return _rulesCache;

  const db = getDb();
  _rulesCache = db
    .prepare(
      `SELECT r.*, c.name as category_name, c.type as category_type
       FROM category_rules r
       JOIN categories c ON c.id = r.category_id
       ORDER BY r.priority DESC, r.hit_count DESC`
    )
    .all();

  _cacheTs = now;
  return _rulesCache;
}

function getDefaultCategory() {
  if (_defaultCategory) return _defaultCategory;
  const db = getDb();
  _defaultCategory = db.prepare('SELECT id, name FROM categories WHERE is_default = 1 LIMIT 1').get();
  if (!_defaultCategory) {
    _defaultCategory = { id: null, name: 'Uncategorized' };
  }
  return _defaultCategory;
}

function invalidateCache() {
  _rulesCache = null;
  _defaultCategory = null;
}

/**
 * Categorize a single transaction object.
 * Returns { categoryId, categoryName, source: 'auto' | 'rule' }
 */
function categorizeTransaction(tx) {
  const rules = getRules();

  const fields = {
    merchant:    (tx.merchant    || '').toUpperCase(),
    beneficiary: (tx.beneficiary || '').toUpperCase(),
    details:     (tx.details     || '').toUpperCase(),
  };

  for (const rule of rules) {
    const haystack = fields[rule.match_field] ?? '';
    const needle   = rule.is_regex
      ? new RegExp(rule.pattern, 'i')
      : rule.pattern.toUpperCase();

    const matched = rule.is_regex
      ? needle.test(haystack)
      : haystack.includes(needle);

    if (matched) {
      return {
        categoryId:   rule.category_id,
        categoryName: rule.category_name,
        source:       'rule',
      };
    }
  }

  const def = getDefaultCategory();
  return {
    categoryId: def.id ?? null,
    categoryName: def.name ?? 'Uncategorized',
    source: 'auto',
  };
}

/**
 * Bump the hit_count for a matched rule so popular rules get higher priority.
 */
function recordRuleHit(ruleId) {
  const db = getDb();
  db.prepare('UPDATE category_rules SET hit_count = hit_count + 1 WHERE id = ?').run(ruleId);
  invalidateCache();
}

/**
 * Apply a single rule to existing transactions in the database.
 * Used right after a rule is manually created so the user immediately sees
 * the new categorization across historical data.
 *
 * Returns the number of transactions updated.
 *
 * Behavior:
 *   - Matches the rule's pattern against the configured field (case-insensitive
 *     substring match, or regex if is_regex=1).
 *   - Skips transactions already manually categorized (category_source='manual')
 *     unless overrideManual=true, so user corrections aren't clobbered.
 *   - Skips transactions whose current category matches the rule already.
 *   - Bumps the rule's hit_count and last_matched timestamp.
 */
function applyRuleToExisting(ruleId, { overrideManual = false } = {}) {
  const db   = getDb();
  const rule = db.prepare('SELECT * FROM category_rules WHERE id = ?').get(ruleId);
  if (!rule) return { matched: 0, updated: 0 };

  const allowedFields = new Set(['merchant', 'beneficiary', 'details']);
  if (!allowedFields.has(rule.match_field)) return { matched: 0, updated: 0 };

  const candidates = db.prepare(
    `SELECT id, merchant, beneficiary, details, category_id, category_source
       FROM transactions
      WHERE ${rule.match_field} IS NOT NULL AND ${rule.match_field} != ''`
  ).all();

  let needle, regex;
  if (rule.is_regex) {
    try { regex = new RegExp(rule.pattern, 'i'); }
    catch { return { matched: 0, updated: 0, error: 'Invalid regex' }; }
  } else {
    needle = rule.pattern.toUpperCase();
  }

  const update = db.prepare(
    `UPDATE transactions
        SET category_id = ?, category_source = 'rule', updated_at = datetime('now')
      WHERE id = ?`
  );

  let matched = 0;
  let updated = 0;

  const run = db.transaction(() => {
    for (const tx of candidates) {
      const haystack = (tx[rule.match_field] || '').toUpperCase();
      const hit = regex ? regex.test(tx[rule.match_field] || '') : haystack.includes(needle);
      if (!hit) continue;
      matched += 1;

      if (tx.category_id === rule.category_id) continue;
      if (tx.category_source === 'manual' && !overrideManual) continue;

      update.run(rule.category_id, tx.id);
      updated += 1;
    }

    if (matched > 0) {
      db.prepare(
        `UPDATE category_rules
            SET hit_count    = hit_count + ?,
                last_matched = datetime('now')
          WHERE id = ?`
      ).run(matched, ruleId);
    }
  });

  run();
  invalidateCache();
  return { matched, updated };
}

module.exports = { categorizeTransaction, applyRuleToExisting, recordRuleHit, invalidateCache };
