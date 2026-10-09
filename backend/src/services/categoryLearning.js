/**
 * Learn category rules from already-categorized transactions and apply them
 * only to uncategorized (category_source = 'auto') rows.
 *
 * Conservative: unanimous category per merchant/description key required.
 */

const { invalidateCache, getDefaultCategory } = require('./categorizer');
const { hasManualCategoryLock, keysFromBankRow, keysFromRevolutRow } = require('./manualCategoryLocks');

const GENERIC_PATTERNS = new Set([
  'CARD', 'PAYMENT', 'TRANSFER', 'UNKNOWN', 'N/A', 'NA', 'NULL',
  'SEPA', 'INSTANT', 'PURCHASE', 'POS', 'ATM', 'CASH', 'FEE',
]);

function normalizeKey(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function isUsableKey(key) {
  if (!key || key.length < 4) return false;
  if (GENERIC_PATTERNS.has(key)) return false;
  if (/^[\d\s*]+$/.test(key)) return false;
  if (key.includes('******')) return false;
  if (key.length <= 5 && !/^[A-ZÄÖÜÕ]+$/.test(key)) return false;
  return true;
}

/** Full key plus stable short cores (e.g. LIDL, CIRCLE K). */
function expandKeys(raw) {
  const full = normalizeKey(raw);
  const out = new Set();
  if (isUsableKey(full)) out.add(full);
  const parts = full.split(/[\s\/,|+]+/).filter((t) => t.length >= 3 && !/^\d+$/.test(t));
  if (parts[0] && parts[0].length >= 4 && parts[0].length <= 18) {
    if (isUsableKey(parts[0])) out.add(parts[0]);
  }
  if (parts.length >= 2) {
    const two = `${parts[0]} ${parts[1]}`;
    if (two.length >= 6 && two.length <= 28 && isUsableKey(two)) out.add(two);
  }
  return [...out];
}

function existingRuleCovers(db, pattern, matchField, categoryId) {
  const rows = db
    .prepare(
      `SELECT id, pattern, match_field, category_id, is_regex
         FROM category_rules
        WHERE is_disabled IS NULL OR is_disabled = 0`,
    )
    .all();
  const needle = pattern.toUpperCase();
  for (const r of rows) {
    if (r.match_field !== matchField) continue;
    if (r.is_regex) continue;
    const p = String(r.pattern || '').toUpperCase();
    if (!p) continue;
    // Same or broader existing rule already points at this category
    if (r.category_id === categoryId && (needle.includes(p) || p.includes(needle) || needle === p)) {
      return r;
    }
    // Conflicting rule for overlapping pattern — skip learning
    if (r.category_id !== categoryId && (needle === p || needle.includes(p) || p.includes(needle))) {
      return { conflict: true, rule: r };
    }
  }
  return null;
}

function collectBankVotes(db, defaultId) {
  const rows = db
    .prepare(
      `SELECT id, merchant, beneficiary, details, category_id, category_source
         FROM transactions
        WHERE category_id IS NOT NULL
          AND category_id != ?
          AND category_source IN ('manual', 'rule')`,
    )
    .all(defaultId);

  /** @type {Map<string, { field: string, votes: Map<number, { total: number, manual: number }> }>} */
  const map = new Map();

  function add(field, raw, categoryId, source) {
    for (const key of expandKeys(raw)) {
      const mapKey = `${field}::${key}`;
      if (!map.has(mapKey)) map.set(mapKey, { field, key, votes: new Map() });
      const entry = map.get(mapKey);
      const cur = entry.votes.get(categoryId) || { total: 0, manual: 0 };
      cur.total += 1;
      if (source === 'manual') cur.manual += 1;
      entry.votes.set(categoryId, cur);
    }
  }

  for (const row of rows) {
    if (row.merchant) add('merchant', row.merchant, row.category_id, row.category_source);
    else if (row.beneficiary) add('beneficiary', row.beneficiary, row.category_id, row.category_source);
    if (row.details && row.details !== row.merchant) {
      // Only learn details when merchant empty and details looks like a name (not long remittance)
      if (!row.merchant && normalizeKey(row.details).length <= 60) {
        add('details', row.details, row.category_id, row.category_source);
      }
    }
  }
  return map;
}

function collectRevolutVotes(db, defaultId) {
  const rows = db
    .prepare(
      `SELECT id, description, category_id, category_source
         FROM revolut_transactions
        WHERE category_id IS NOT NULL
          AND category_id != ?
          AND category_source IN ('manual', 'rule')
          AND description IS NOT NULL AND TRIM(description) != ''`,
    )
    .all(defaultId);

  const map = new Map();
  for (const row of rows) {
    for (const key of expandKeys(row.description)) {
      const mapKey = `merchant::${key}`;
      if (!map.has(mapKey)) map.set(mapKey, { field: 'merchant', key, votes: new Map() });
      const entry = map.get(mapKey);
      const cur = entry.votes.get(row.category_id) || { total: 0, manual: 0 };
      cur.total += 1;
      if (row.category_source === 'manual') cur.manual += 1;
      entry.votes.set(row.category_id, cur);
    }
  }
  return map;
}

function pickUnanimousCategory(votes) {
  if (votes.size !== 1) return null;
  const [[categoryId, stats]] = [...votes.entries()];
  return { categoryId, ...stats };
}

function shouldCreateRule(stats, key) {
  // Short cores need stronger evidence
  if (key.length <= 6) {
    if (stats.manual >= 2) return { ok: true, priority: 80 };
    if (stats.total >= 4 && stats.manual >= 1) return { ok: true, priority: 76 };
    return { ok: false };
  }
  if (stats.manual >= 2) return { ok: true, priority: 78 };
  if (stats.manual >= 1 && key.length >= 8) return { ok: true, priority: 72 };
  if (stats.total >= 3 && stats.manual >= 1) return { ok: true, priority: 74 };
  if (stats.total >= 4) return { ok: true, priority: 68 };
  return { ok: false };
}

function applyCategoryToUncategorized(db, { matchField, pattern, categoryId, defaultId }) {
  let bankUpdated = 0;
  let revolutUpdated = 0;

  const bankRows = db
    .prepare(
      `SELECT id, fingerprint, transfer_ref, merchant, beneficiary, details, category_id, category_source
         FROM transactions
        WHERE category_source = 'auto'
           OR category_id IS NULL
           OR category_id = ?`,
    )
    .all(defaultId);

  const updBank = db.prepare(
    `UPDATE transactions
        SET category_id = ?, category_source = 'rule', updated_at = datetime('now')
      WHERE id = ?`,
  );

  for (const tx of bankRows) {
    if (tx.category_source === 'manual' || tx.category_source === 'rule') continue;
    if (hasManualCategoryLock(db, keysFromBankRow(tx))) continue;
    const raw = tx[matchField] || '';
    if (!raw.toUpperCase().includes(pattern.toUpperCase())) continue;
    if (tx.category_id === categoryId) continue;
    updBank.run(categoryId, tx.id);
    bankUpdated += 1;
  }

  const revRows = db
    .prepare(
      `SELECT id, fingerprint, transfer_ref, description, category_id, category_source
         FROM revolut_transactions
        WHERE category_source = 'auto'
           OR category_id IS NULL
           OR category_id = ?`,
    )
    .all(defaultId);

  const updRev = db.prepare(
    `UPDATE revolut_transactions
        SET category_id = ?, category_source = 'rule'
      WHERE id = ?`,
  );

  for (const tx of revRows) {
    if (tx.category_source === 'manual' || tx.category_source === 'rule') continue;
    if (hasManualCategoryLock(db, keysFromRevolutRow(tx))) continue;
    const raw = tx.description || '';
    if (!raw.toUpperCase().includes(pattern.toUpperCase())) continue;
    if (tx.category_id === categoryId) continue;
    updRev.run(categoryId, tx.id);
    revolutUpdated += 1;
  }

  return { bankUpdated, revolutUpdated };
}

/**
 * Learn rules from categorized txs and apply to uncategorized only.
 * @param {object} db per-user database wrapper
 */
function learnAndApplyCategories(db) {
  let defaultCat = db.prepare('SELECT id, name FROM categories WHERE is_default = 1 LIMIT 1').get();
  if (!defaultCat) {
    const named = db
      .prepare(
        `SELECT id, name FROM categories
          WHERE lower(name) IN ('uncategorized', 'uncategorised') LIMIT 1`,
      )
      .get();
    if (named) {
      db.prepare('UPDATE categories SET is_default = 0').run();
      db.prepare('UPDATE categories SET is_default = 1 WHERE id = ?').run(named.id);
      defaultCat = db.prepare('SELECT id, name FROM categories WHERE is_default = 1 LIMIT 1').get();
    } else {
      db.prepare('UPDATE categories SET is_default = 0').run();
      db.prepare(
        `INSERT INTO categories (name, icon, color, type, is_default)
         VALUES ('Uncategorized', '❓', '#94a3b8', 'expense', 1)`,
      ).run();
      defaultCat = db.prepare('SELECT id, name FROM categories WHERE is_default = 1 LIMIT 1').get();
    }
  }
  const defaultId = defaultCat?.id ?? -1;

  const beforeUncatBank = db
    .prepare(
      `SELECT COUNT(*) AS c FROM transactions
        WHERE category_source = 'auto' OR category_id IS NULL OR category_id = ?`,
    )
    .get(defaultId).c;
  const beforeUncatRev = db
    .prepare(
      `SELECT COUNT(*) AS c FROM revolut_transactions
        WHERE category_source = 'auto' OR category_id IS NULL OR category_id = ?`,
    )
    .get(defaultId).c;

  // First: apply existing rules to uncategorized only
  const { applyRuleToExisting } = require('./categorizer');
  const ruleIds = db
    .prepare('SELECT id FROM category_rules ORDER BY priority DESC, hit_count DESC')
    .all();
  let existingRuleUpdates = 0;
  for (const { id } of ruleIds) {
    const r = applyRuleToExisting(id, { overrideManual: false, onlyUncategorized: true });
    existingRuleUpdates += r.updated || 0;
  }

  const bankMap = collectBankVotes(db, defaultId);
  const revMap = collectRevolutVotes(db, defaultId);
  // Merge revolut keys into bank map for rule creation (merchant field works for both)
  for (const [k, v] of revMap) {
    if (!bankMap.has(k)) bankMap.set(k, v);
    else {
      const existing = bankMap.get(k);
      for (const [catId, stats] of v.votes) {
        const cur = existing.votes.get(catId) || { total: 0, manual: 0 };
        cur.total += stats.total;
        cur.manual += stats.manual;
        existing.votes.set(catId, cur);
      }
    }
  }

  const created = [];
  const skipped = [];
  let learnedUpdates = 0;

  const insertRule = db.prepare(
    `INSERT INTO category_rules
       (pattern, match_field, is_regex, category_id, priority, created_by, confidence)
     VALUES (?, ?, 0, ?, ?, 'learning', 0.85)`,
  );

  const candidates = [...bankMap.values()].sort((a, b) => b.key.length - a.key.length);

  const run = db.transaction(() => {
    for (const entry of candidates) {
      const picked = pickUnanimousCategory(entry.votes);
      if (!picked) {
        skipped.push({ key: entry.key, reason: 'ambiguous_categories' });
        continue;
      }
      const gate = shouldCreateRule(picked, entry.key);
      if (!gate.ok) {
        skipped.push({ key: entry.key, reason: 'insufficient_evidence', stats: picked });
        continue;
      }

      const cover = existingRuleCovers(db, entry.key, entry.field, picked.categoryId);
      if (cover?.conflict) {
        skipped.push({ key: entry.key, reason: 'conflicts_existing_rule' });
        continue;
      }

      let ruleId = cover?.id;
      if (!ruleId) {
        const result = insertRule.run(entry.key, entry.field, picked.categoryId, gate.priority);
        ruleId = result.lastInsertRowid;
        created.push({
          id: ruleId,
          pattern: entry.key,
          matchField: entry.field,
          categoryId: picked.categoryId,
          priority: gate.priority,
        });
      }

      const applied = applyCategoryToUncategorized(db, {
        matchField: entry.field,
        pattern: entry.key,
        categoryId: picked.categoryId,
        defaultId,
      });
      learnedUpdates += applied.bankUpdated + applied.revolutUpdated;

      if (ruleId && applied.bankUpdated + applied.revolutUpdated > 0) {
        db.prepare(
          `UPDATE category_rules
              SET hit_count = hit_count + ?, last_matched = datetime('now')
            WHERE id = ?`,
        ).run(applied.bankUpdated + applied.revolutUpdated, ruleId);
      }
    }
  });
  run();
  invalidateCache();

  const afterUncatBank = db
    .prepare(
      `SELECT COUNT(*) AS c FROM transactions
        WHERE category_source = 'auto' OR category_id IS NULL OR category_id = ?`,
    )
    .get(defaultId).c;
  const afterUncatRev = db
    .prepare(
      `SELECT COUNT(*) AS c FROM revolut_transactions
        WHERE category_source = 'auto' OR category_id IS NULL OR category_id = ?`,
    )
    .get(defaultId).c;

  return {
    beforeUncategorized: { bank: beforeUncatBank, revolut: beforeUncatRev },
    afterUncategorized: { bank: afterUncatBank, revolut: afterUncatRev },
    existingRuleUpdates,
    learnedUpdates,
    rulesCreated: created.length,
    created,
    skipped: skipped.length,
  };
}

module.exports = { learnAndApplyCategories, normalizeKey, isUsableKey };
