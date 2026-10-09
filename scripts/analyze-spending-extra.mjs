#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const require = createRequire(import.meta.url);
const OWNER_ID = '02bfafa3-9fa8-4b1d-b55f-e6108b246bcf';
const YEAR = '2026';

async function main() {
  const { initDb, openUserDatabase } = require(path.join(ROOT, 'backend', 'src', 'db', 'database.js'));
  const { runWithUserId } = require(path.join(ROOT, 'backend', 'src', 'db', 'requestContext.js'));
  await initDb();
  runWithUserId(OWNER_ID, () => {
    const db = openUserDatabase(OWNER_ID);
    const cash = db.prepare(
      `SELECT COALESCE(SUM(ABS(amount)),0) AS total, COUNT(*) AS cnt FROM transactions
       WHERE date LIKE ? AND direction='D'
         AND (upper(COALESCE(merchant,'')) LIKE '%SULARAHA%' OR upper(COALESCE(beneficiary,'')) LIKE '%SULARAHA%')`,
    ).get(`${YEAR}-%`);
    const tiers = db.prepare(
      `SELECT COALESCE(c.expense_tier,'other') AS tier, COALESCE(SUM(ABS(x.amt)),0) AS total
       FROM (
         SELECT category_id, amount AS amt FROM transactions WHERE date LIKE ? AND direction='D' AND amount < 0
         UNION ALL
         SELECT category_id, amount AS amt FROM revolut_transactions WHERE date LIKE ? AND amount < 0
       ) x LEFT JOIN categories c ON c.id = x.category_id
       GROUP BY tier ORDER BY total DESC`,
    ).all(`${YEAR}-%`, `${YEAR}-%`);
    const groceriesByMonth = db.prepare(
      `SELECT month, SUM(ABS(amount)) AS total FROM (
         SELECT substr(t.date,1,7) AS month, t.amount FROM transactions t
           JOIN categories c ON c.id=t.category_id
          WHERE t.date LIKE ? AND t.direction='D' AND c.name='Groceries'
         UNION ALL
         SELECT substr(r.date,1,7) AS month, r.amount FROM revolut_transactions r
           JOIN categories c ON c.id=r.category_id
          WHERE r.date LIKE ? AND r.amount < 0 AND c.name='Groceries'
       ) GROUP BY month ORDER BY month`,
    ).all(`${YEAR}-%`, `${YEAR}-%`);
    const diningByMonth = db.prepare(
      `SELECT month, SUM(ABS(amount)) AS total FROM (
         SELECT substr(t.date,1,7) AS month, t.amount FROM transactions t
           JOIN categories c ON c.id=t.category_id
          WHERE t.date LIKE ? AND t.direction='D' AND c.name IN ('Restaurants','Coffee & Cafes')
         UNION ALL
         SELECT substr(r.date,1,7) AS month, r.amount FROM revolut_transactions r
           JOIN categories c ON c.id=r.category_id
          WHERE r.date LIKE ? AND r.amount < 0 AND c.name IN ('Restaurants','Coffee & Cafes')
       ) GROUP BY month ORDER BY month`,
    ).all(`${YEAR}-%`, `${YEAR}-%`);
    const exclMarch = db.prepare(
      `SELECT COALESCE(SUM(ABS(amount)),0) AS total FROM (
         SELECT amount FROM transactions WHERE date LIKE ? AND direction='D' AND amount < 0 AND date NOT LIKE '2026-03%'
         UNION ALL
         SELECT amount FROM revolut_transactions WHERE date LIKE ? AND amount < 0 AND date NOT LIKE '2026-03%'
       )`,
    ).get(`${YEAR}-%`, `${YEAR}-%`);
    console.log(JSON.stringify({ cash, tiers, groceriesByMonth, diningByMonth, exclMarch: exclMarch.total }, null, 2));
  });
}
main().catch((e) => { console.error(e); process.exit(1); });
