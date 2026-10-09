#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

async function main() {
  const { initDb, openUserDatabase } = require(path.join(ROOT, 'backend', 'src', 'db', 'database.js'));
  const { runWithUserId } = require(path.join(ROOT, 'backend', 'src', 'db', 'requestContext.js'));
  const reg = require(path.join(ROOT, 'backend', 'src', 'services', 'userRegistry.js'));
  await initDb();

  const owner = reg.listUsers().find((u) => /owner|local\.financeos/i.test(u.email)) || reg.listUsers()[0];
  console.log('Inspecting', owner.email, owner.id);

  runWithUserId(owner.id, () => {
    const db = openUserDatabase(owner.id);
    const def = db.prepare('SELECT id, name FROM categories WHERE is_default = 1').get();
    const uncatCats = db
      .prepare(
        `SELECT id, name, is_default FROM categories
          WHERE is_default = 1 OR lower(name) LIKE '%uncategor%'`,
      )
      .all();
    console.log('default', def);
    console.log('uncat category rows', uncatCats);
    const uncatIds = uncatCats.map((c) => c.id);

    const bankTotal = db.prepare('SELECT COUNT(*) AS c FROM transactions').get().c;
    const revTotal = db.prepare('SELECT COUNT(*) AS c FROM revolut_transactions').get().c;
    console.log('totals bank', bankTotal, 'revolut', revTotal);

    console.log(
      'bank by source',
      db.prepare('SELECT category_source AS s, COUNT(*) AS c FROM transactions GROUP BY 1').all(),
    );
    console.log(
      'revolut by source',
      db.prepare('SELECT category_source AS s, COUNT(*) AS c FROM revolut_transactions GROUP BY 1').all(),
    );

    // How UI likely treats uncategorized
    const bankUncat = db
      .prepare(
        `SELECT COUNT(*) AS c FROM transactions t
          LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.category_id IS NULL
            OR c.is_default = 1
            OR lower(COALESCE(c.name,'')) LIKE '%uncategor%'`,
      )
      .get().c;
    const revUncat = db
      .prepare(
        `SELECT COUNT(*) AS c FROM revolut_transactions t
          LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.category_id IS NULL
            OR c.is_default = 1
            OR lower(COALESCE(c.name,'')) LIKE '%uncategor%'`,
      )
      .get().c;
    console.log('UI-style uncategorized bank', bankUncat, 'revolut', revUncat, 'combined', bankUncat + revUncat);

    console.log(
      'bank Uncategorized by source',
      db
        .prepare(
          `SELECT t.category_source AS s, COUNT(*) AS c
             FROM transactions t
             LEFT JOIN categories c ON c.id = t.category_id
            WHERE t.category_id IS NULL OR c.is_default = 1 OR lower(COALESCE(c.name,'')) LIKE '%uncategor%'
            GROUP BY 1`,
        )
        .all(),
    );
    console.log(
      'revolut Uncategorized by source',
      db
        .prepare(
          `SELECT t.category_source AS s, COUNT(*) AS c
             FROM revolut_transactions t
             LEFT JOIN categories c ON c.id = t.category_id
            WHERE t.category_id IS NULL OR c.is_default = 1 OR lower(COALESCE(c.name,'')) LIKE '%uncategor%'
            GROUP BY 1`,
        )
        .all(),
    );

    // Sample uncategorized merchants
    console.log(
      'sample bank uncategorized',
      db
        .prepare(
          `SELECT t.id, t.date, t.merchant, t.beneficiary, t.category_id, t.category_source, c.name AS cat
             FROM transactions t
             LEFT JOIN categories c ON c.id = t.category_id
            WHERE t.category_id IS NULL OR c.is_default = 1 OR lower(COALESCE(c.name,'')) LIKE '%uncategor%'
            ORDER BY t.date DESC LIMIT 25`,
        )
        .all(),
    );
    console.log(
      'sample revolut uncategorized',
      db
        .prepare(
          `SELECT t.id, t.date, t.description, t.category_id, t.category_source, c.name AS cat
             FROM revolut_transactions t
             LEFT JOIN categories c ON c.id = t.category_id
            WHERE t.category_id IS NULL OR c.is_default = 1 OR lower(COALESCE(c.name,'')) LIKE '%uncategor%'
            ORDER BY t.date DESC LIMIT 25`,
        )
        .all(),
    );

    // Top merchants among uncategorized
    console.log(
      'top uncategorized bank merchants',
      db
        .prepare(
          `SELECT UPPER(COALESCE(NULLIF(TRIM(t.merchant),''), NULLIF(TRIM(t.beneficiary),''), '(blank)')) AS m,
                  COUNT(*) AS c
             FROM transactions t
             LEFT JOIN categories c ON c.id = t.category_id
            WHERE t.category_id IS NULL OR c.is_default = 1 OR lower(COALESCE(c.name,'')) LIKE '%uncategor%'
            GROUP BY 1 ORDER BY c DESC LIMIT 30`,
        )
        .all(),
    );
    console.log(
      'top uncategorized revolut descriptions',
      db
        .prepare(
          `SELECT UPPER(TRIM(t.description)) AS m, COUNT(*) AS c
             FROM revolut_transactions t
             LEFT JOIN categories c ON c.id = t.category_id
            WHERE t.category_id IS NULL OR c.is_default = 1 OR lower(COALESCE(c.name,'')) LIKE '%uncategor%'
            GROUP BY 1 ORDER BY c DESC LIMIT 30`,
        )
        .all(),
    );

    // How many "rule" rows point at Uncategorized (bad)
    if (uncatIds.length) {
      const placeholders = uncatIds.map(() => '?').join(',');
      console.log(
        'bank rule->Uncategorized',
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM transactions
              WHERE category_source = 'rule' AND category_id IN (${placeholders})`,
          )
          .get(...uncatIds).c,
      );
      console.log(
        'revolut rule->Uncategorized',
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM revolut_transactions
              WHERE category_source = 'rule' AND category_id IN (${placeholders})`,
          )
          .get(...uncatIds).c,
      );
    }

    // Check API filter used by frontend
    console.log(
      'categories named Other / Miscellaneous',
      db
        .prepare(
          `SELECT id, name FROM categories
            WHERE lower(name) LIKE '%other%' OR lower(name) LIKE '%misc%' OR lower(name) LIKE '%general%'`,
        )
        .all(),
    );
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
