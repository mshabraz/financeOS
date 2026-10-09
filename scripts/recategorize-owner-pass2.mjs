#!/usr/bin/env node
/**
 * Second-pass categorization for owner account:
 * For each uncategorized tx, find categorized examples that share a stable
 * merchant/description core. Only assign when evidence is unanimous.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

const STOP = new Set([
  'THE', 'AND', 'FOR', 'FROM', 'WITH', 'PAYMENT', 'TRANSFER', 'TO', 'OF', 'OU',
  'OUE', 'AS', 'SIA', 'LTD', 'LLC', 'UAB', 'OY', 'AB', 'EE', 'HARJUMAA', 'TALLINN',
  'ESTONIA', 'DUBLIN', 'EUROPE', 'STORE', 'GAS', 'STATION', 'APPS', 'PLAY',
]);

function coresFrom(text) {
  const u = String(text || '')
    .toUpperCase()
    .replace(/[^A-Z0-9ÄÖÜÕÅ\s*&'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!u) return [];
  const out = new Set();
  // Full string if short enough
  if (u.length >= 4 && u.length <= 40) out.add(u);

  const parts = u.split(/[\s\/|*&]+/).filter((p) => p.length >= 3 && !/^\d+$/.test(p) && !STOP.has(p));
  if (parts[0] && parts[0].length >= 4) out.add(parts[0]);
  if (parts.length >= 2) {
    const two = `${parts[0]} ${parts[1]}`;
    if (two.length <= 28) out.add(two);
  }
  // Special multi-word brands
  if (/\bR-?KIOSK\b/.test(u)) out.add('R-KIOSK');
  if (/\bCIRCLE\s*K\b/.test(u)) out.add('CIRCLE K');
  if (/\bBURGER\s*KING\b/.test(u)) out.add('BURGER KING');
  if (/\bGOOGLE\b/.test(u)) out.add('GOOGLE');
  if (/\bLIDL\b/.test(u)) out.add('LIDL');
  if (/\bRIMI\b/.test(u)) out.add('RIMI');
  if (/\bMAXIMA\b/.test(u)) out.add('MAXIMA');
  if (/\bSELVER\b/.test(u)) out.add('SELVER');
  if (/\bSTOCKMANN\b/.test(u)) out.add('STOCKMANN');
  if (/\bJYSK\b/.test(u)) out.add('JYSK');
  if (/\bKFC\b/.test(u)) out.add('KFC');
  if (/\bPAYPAL\b/.test(u)) out.add('PAYPAL');
  return [...out];
}

function isUncategorized(row, defaultId) {
  if (row.category_source === 'manual' || row.category_source === 'rule') return false;
  return (
    row.category_source === 'auto'
    || row.category_id == null
    || row.category_id === defaultId
  );
}

async function main() {
  const { initDb, openUserDatabase } = require(path.join(ROOT, 'backend', 'src', 'db', 'database.js'));
  const { runWithUserId } = require(path.join(ROOT, 'backend', 'src', 'db', 'requestContext.js'));
  const { invalidateCache } = require(path.join(ROOT, 'backend', 'src', 'services', 'categorizer.js'));
  const reg = require(path.join(ROOT, 'backend', 'src', 'services', 'userRegistry.js'));

  await initDb();
  const owner =
    reg.listUsers().find((u) => /owner@local\.financeos/i.test(u.email)) || reg.listUsers()[0];

  const summary = runWithUserId(owner.id, () => {
    const db = openUserDatabase(owner.id);
    const def = db.prepare('SELECT id, name FROM categories WHERE is_default = 1').get();
    const defaultId = def.id;

    // Build core -> category votes from categorized (non-uncategorized) txs
    /** @type {Map<string, Map<number, number>>} */
    const votes = new Map();
    function addVote(text, categoryId) {
      if (!categoryId || categoryId === defaultId) return;
      for (const core of coresFrom(text)) {
        if (!votes.has(core)) votes.set(core, new Map());
        const m = votes.get(core);
        m.set(categoryId, (m.get(categoryId) || 0) + 1);
      }
    }

    const labeledBank = db
      .prepare(
        `SELECT merchant, beneficiary, details, category_id FROM transactions
          WHERE category_id IS NOT NULL AND category_id != ?
            AND category_source IN ('manual','rule')`,
      )
      .all(defaultId);
    for (const r of labeledBank) {
      addVote(r.merchant || r.beneficiary || r.details, r.category_id);
    }
    const labeledRev = db
      .prepare(
        `SELECT description, category_id FROM revolut_transactions
          WHERE category_id IS NOT NULL AND category_id != ?
            AND category_source IN ('manual','rule')`,
      )
      .all(defaultId);
    for (const r of labeledRev) addVote(r.description, r.category_id);

    // Prefer longer cores when resolving
    const coreList = [...votes.keys()].sort((a, b) => b.length - a.length);

    function resolveCategory(text) {
      const present = new Set(coresFrom(text));
      for (const core of coreList) {
        if (!present.has(core) && !String(text || '').toUpperCase().includes(core)) continue;
        // require core to appear in text
        if (!String(text || '').toUpperCase().includes(core)) continue;
        const m = votes.get(core);
        if (!m || m.size !== 1) continue;
        const [[catId, count]] = [...m.entries()];
        // Short cores need more evidence
        if (core.length <= 5 && count < 2) continue;
        if (core.length <= 8 && count < 1) continue;
        return { catId, core, count };
      }
      return null;
    }

    const uncatBank = db
      .prepare(
        `SELECT id, merchant, beneficiary, details, category_id, category_source
           FROM transactions
          WHERE category_source = 'auto' OR category_id IS NULL OR category_id = ?`,
      )
      .all(defaultId);
    const uncatRev = db
      .prepare(
        `SELECT id, description, category_id, category_source
           FROM revolut_transactions
          WHERE category_source = 'auto' OR category_id IS NULL OR category_id = ?`,
      )
      .all(defaultId);

    const updBank = db.prepare(
      `UPDATE transactions SET category_id = ?, category_source = 'rule', updated_at = datetime('now') WHERE id = ?`,
    );
    const updRev = db.prepare(
      `UPDATE revolut_transactions SET category_id = ?, category_source = 'rule' WHERE id = ?`,
    );
    const insertRule = db.prepare(
      `INSERT INTO category_rules (pattern, match_field, is_regex, category_id, priority, created_by, confidence)
       VALUES (?, 'merchant', 0, ?, 82, 'learning', 0.9)`,
    );
    const ruleExists = db.prepare(
      `SELECT id FROM category_rules WHERE upper(pattern) = upper(?) AND match_field = 'merchant' LIMIT 1`,
    );

    let bankUpdated = 0;
    let revUpdated = 0;
    const usedCores = new Map(); // core -> catId
    const examples = [];

    const run = db.transaction(() => {
      for (const tx of uncatBank) {
        if (!isUncategorized(tx, defaultId)) continue;
        const text = tx.merchant || tx.beneficiary || tx.details || '';
        const hit = resolveCategory(text);
        if (!hit) continue;
        updBank.run(hit.catId, tx.id);
        bankUpdated += 1;
        usedCores.set(hit.core, hit.catId);
        if (examples.length < 20) examples.push({ ledger: 'bank', text, core: hit.core, catId: hit.catId });
      }
      for (const tx of uncatRev) {
        if (!isUncategorized(tx, defaultId)) continue;
        const text = tx.description || '';
        const hit = resolveCategory(text);
        if (!hit) continue;
        updRev.run(hit.catId, tx.id);
        revUpdated += 1;
        usedCores.set(hit.core, hit.catId);
        if (examples.length < 40) examples.push({ ledger: 'revolut', text, core: hit.core, catId: hit.catId });
      }
      for (const [core, catId] of usedCores) {
        if (!ruleExists.get(core)) insertRule.run(core, catId);
      }
    });
    run();
    invalidateCache();

    const afterBank = db
      .prepare(
        `SELECT COUNT(*) AS c FROM transactions t
          LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.category_id IS NULL OR c.is_default = 1`,
      )
      .get().c;
    const afterRev = db
      .prepare(
        `SELECT COUNT(*) AS c FROM revolut_transactions t
          LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.category_id IS NULL OR c.is_default = 1`,
      )
      .get().c;

    return {
      email: owner.email,
      beforeUncategorized: { bank: uncatBank.filter((t) => isUncategorized(t, defaultId)).length, revolut: uncatRev.filter((t) => isUncategorized(t, defaultId)).length },
      updated: { bank: bankUpdated, revolut: revUpdated },
      afterUncategorized: { bank: afterBank, revolut: afterRev, combined: afterBank + afterRev },
      rulesEnsured: usedCores.size,
      examples,
    };
  });

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
