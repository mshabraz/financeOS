#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

const OBVIOUS = [
  { re: /\bJYSK\b/i, cat: 'Shopping' },
  { re: /\bSTOCKMANN\b/i, cat: 'Shopping' },
  { re: /\bBAUHOF\b/i, cat: 'Shopping' },
  { re: /\bKAUP24\b/i, cat: 'Shopping' },
  { re: /\bASIANMART\b/i, cat: 'Groceries' },
  { re: /^GROCERY STORE$/i, cat: 'Groceries' },
  { re: /\bZORBAS\b/i, cat: 'Restaurants' },
  { re: /\bTAVERNA\b|\bTAVERN\b|\bSOUVLAKI\b|\bBBQ\b|\bLA TABLA\b|\bKOKOS\b|\bMAQAM\b/i, cat: 'Restaurants' },
  { re: /\bSPA TOURS\b/i, cat: 'Wellness & Spa' },
  { re: /^TRANSFER TO\b/i, cat: 'Transfers' },
  { re: /^REVOLUT$/i, cat: 'Transfers' },
  { re: /\bPAYPAL\b/i, cat: 'Transfers' },
  { re: /\bRAAMATUMAJA\b|\bRAHVA RAAMAT\b/i, cat: 'Shopping' },
  { re: /\bBEEP\.EE\b/i, cat: 'Phone & Internet' },
  { re: /\bFLOWER\b/i, cat: 'Shopping' },
];

async function main() {
  const { initDb, openUserDatabase } = require(path.join(ROOT, 'backend', 'src', 'db', 'database.js'));
  const { runWithUserId } = require(path.join(ROOT, 'backend', 'src', 'db', 'requestContext.js'));
  const { invalidateCache } = require(path.join(ROOT, 'backend', 'src', 'services', 'categorizer.js'));
  await initDb();
  const id = '02bfafa3-9fa8-4b1d-b55f-e6108b246bcf';

  const result = runWithUserId(id, () => {
    const db = openUserDatabase(id);
    const def = db.prepare('SELECT id FROM categories WHERE is_default = 1').get().id;
    const catByName = Object.fromEntries(
      db.prepare('SELECT id, name FROM categories').all().map((c) => [c.name, c.id]),
    );

    // Remove dangerous short rule
    db.prepare(`DELETE FROM category_rules WHERE upper(pattern) = 'HELP' AND created_by = 'learning'`).run();

    const uncat = db
      .prepare(
        `SELECT id, description FROM revolut_transactions
          WHERE category_source = 'auto' OR category_id IS NULL OR category_id = ?`,
      )
      .all(def);
    const uncatBank = db
      .prepare(
        `SELECT id, merchant, beneficiary FROM transactions
          WHERE category_source = 'auto' OR category_id IS NULL OR category_id = ?`,
      )
      .all(def);

    const updR = db.prepare(
      `UPDATE revolut_transactions SET category_id = ?, category_source = 'rule' WHERE id = ?`,
    );
    const updB = db.prepare(
      `UPDATE transactions SET category_id = ?, category_source = 'rule', updated_at = datetime('now') WHERE id = ?`,
    );
    const insertRule = db.prepare(
      `INSERT INTO category_rules (pattern, match_field, is_regex, category_id, priority, created_by, confidence)
       VALUES (?, 'merchant', 0, ?, 85, 'learning', 0.88)`,
    );

    let rev = 0;
    let bank = 0;
    const applied = [];
    const run = db.transaction(() => {
      for (const tx of uncat) {
        for (const rule of OBVIOUS) {
          if (!rule.re.test(tx.description || '')) continue;
          const catId = catByName[rule.cat];
          if (!catId) continue;
          updR.run(catId, tx.id);
          rev += 1;
          applied.push({ ledger: 'revolut', text: tx.description, cat: rule.cat });
          break;
        }
      }
      for (const tx of uncatBank) {
        const text = `${tx.merchant || ''} ${tx.beneficiary || ''}`;
        for (const rule of OBVIOUS) {
          if (!rule.re.test(text)) continue;
          const catId = catByName[rule.cat];
          if (!catId) continue;
          updB.run(catId, tx.id);
          bank += 1;
          applied.push({ ledger: 'bank', text: tx.merchant, cat: rule.cat });
          break;
        }
      }
      // Ensure a few brand rules
      for (const [pattern, catName] of [
        ['JYSK', 'Shopping'],
        ['STOCKMANN', 'Shopping'],
        ['BAUHOF', 'Shopping'],
        ['KAUP24', 'Shopping'],
        ['ZORBAS', 'Restaurants'],
        ['ASIANMART', 'Groceries'],
      ]) {
        const catId = catByName[catName];
        const exists = db
          .prepare(`SELECT id FROM category_rules WHERE upper(pattern) = ? LIMIT 1`)
          .get(pattern);
        if (!exists && catId) insertRule.run(pattern, catId);
      }
    });
    run();
    invalidateCache();

    const after = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM transactions t LEFT JOIN categories c ON c.id=t.category_id WHERE t.category_id IS NULL OR c.is_default=1) AS bank,
           (SELECT COUNT(*) FROM revolut_transactions t LEFT JOIN categories c ON c.id=t.category_id WHERE t.category_id IS NULL OR c.is_default=1) AS revolut`,
      )
      .get();
    return { updated: { bank, revolut: rev }, after, applied };
  });
  console.log(JSON.stringify(result, null, 2));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
