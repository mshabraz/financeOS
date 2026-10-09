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

    const income = db
      .prepare(
        `SELECT COALESCE(SUM(amount),0) AS total FROM (
           SELECT amount FROM transactions WHERE date LIKE ? AND direction='K' AND amount > 0
           UNION ALL
           SELECT amount FROM revolut_transactions WHERE date LIKE ? AND amount > 0
         )`,
      )
      .get(`${YEAR}-%`, `${YEAR}-%`);

    const bankExp = db
      .prepare(
        `SELECT COALESCE(SUM(ABS(amount)),0) AS total FROM transactions
          WHERE date LIKE ? AND direction='D' AND amount < 0`,
      )
      .get(`${YEAR}-%`);

    const revExp = db
      .prepare(
        `SELECT COALESCE(SUM(ABS(amount)),0) AS total FROM revolut_transactions
          WHERE date LIKE ? AND amount < 0`,
      )
      .get(`${YEAR}-%`);

    const byCategory = db
      .prepare(
        `SELECT c.name, c.expense_tier, COALESCE(SUM(x.amt),0) AS total, COUNT(*) AS cnt
           FROM (
             SELECT category_id, ABS(amount) AS amt FROM transactions
              WHERE date LIKE ? AND direction='D' AND amount < 0
             UNION ALL
             SELECT category_id, ABS(amount) AS amt FROM revolut_transactions
              WHERE date LIKE ? AND amount < 0
           ) x
           LEFT JOIN categories c ON c.id = x.category_id
          GROUP BY c.name, c.expense_tier
          ORDER BY total DESC`,
      )
      .all(`${YEAR}-%`, `${YEAR}-%`);

    const byMonth = db
      .prepare(
        `SELECT month, SUM(amt) AS total FROM (
           SELECT substr(date,1,7) AS month, ABS(amount) AS amt FROM transactions
            WHERE date LIKE ? AND direction='D' AND amount < 0
           UNION ALL
           SELECT substr(date,1,7) AS month, ABS(amount) AS amt FROM revolut_transactions
            WHERE date LIKE ? AND amount < 0
         ) GROUP BY month ORDER BY month`,
      )
      .all(`${YEAR}-%`, `${YEAR}-%`);

    const topMerchants = db
      .prepare(
        `SELECT merchant, SUM(amt) AS total, COUNT(*) AS cnt FROM (
           SELECT COALESCE(NULLIF(TRIM(merchant),''), NULLIF(TRIM(beneficiary),''), '(unknown)') AS merchant,
                  ABS(amount) AS amt
             FROM transactions WHERE date LIKE ? AND direction='D' AND amount < 0
           UNION ALL
           SELECT COALESCE(NULLIF(TRIM(description),''), '(unknown)') AS merchant, ABS(amount) AS amt
             FROM revolut_transactions WHERE date LIKE ? AND amount < 0
         ) GROUP BY merchant ORDER BY total DESC LIMIT 40`,
      )
      .all(`${YEAR}-%`, `${YEAR}-%`);

    const subscriptions = db
      .prepare(
        `SELECT merchant, SUM(amt) AS total, COUNT(*) AS cnt, MIN(date) AS first_d, MAX(date) AS last_d
           FROM (
             SELECT COALESCE(NULLIF(TRIM(merchant),''), beneficiary) AS merchant, ABS(amount) AS amt, date
               FROM transactions WHERE date LIKE ? AND direction='D' AND amount < 0
             UNION ALL
             SELECT description AS merchant, ABS(amount) AS amt, date
               FROM revolut_transactions WHERE date LIKE ? AND amount < 0
           )
          WHERE merchant IS NOT NULL AND (
            upper(merchant) LIKE '%GOOGLE%' OR upper(merchant) LIKE '%NETFLIX%' OR upper(merchant) LIKE '%SPOTIFY%'
            OR upper(merchant) LIKE '%APPLE%' OR upper(merchant) LIKE '%AMAZON PRIME%' OR upper(merchant) LIKE '%OPENAI%'
            OR upper(merchant) LIKE '%CHATGPT%' OR upper(merchant) LIKE '%MICROSOFT%' OR upper(merchant) LIKE '%ADOBE%'
            OR upper(merchant) LIKE '%SUBSCRIPTION%' OR upper(merchant) LIKE '%HELPPAY%' OR upper(merchant) LIKE '%PLAY APPS%'
            OR upper(merchant) LIKE '%ELISA%' OR upper(merchant) LIKE '%TELIA%' OR upper(merchant) LIKE '%BEEP%'
          )
          GROUP BY merchant ORDER BY total DESC`,
      )
      .all(`${YEAR}-%`, `${YEAR}-%`);

    const dining = db
      .prepare(
        `SELECT merchant, SUM(amt) AS total, COUNT(*) AS cnt FROM (
           SELECT COALESCE(NULLIF(TRIM(merchant),''), beneficiary) AS merchant, ABS(amount) AS amt
             FROM transactions t JOIN categories c ON c.id=t.category_id
            WHERE t.date LIKE ? AND t.direction='D' AND c.name IN ('Restaurants','Coffee & Cafes','Entertainment')
           UNION ALL
           SELECT description AS merchant, ABS(amount) AS amt
             FROM revolut_transactions r JOIN categories c ON c.id=r.category_id
            WHERE r.date LIKE ? AND r.amount < 0 AND c.name IN ('Restaurants','Coffee & Cafes','Entertainment')
         ) GROUP BY merchant ORDER BY total DESC LIMIT 25`,
      )
      .all(`${YEAR}-%`, `${YEAR}-%`);

    const shopping = db
      .prepare(
        `SELECT merchant, SUM(amt) AS total, COUNT(*) AS cnt FROM (
           SELECT COALESCE(NULLIF(TRIM(merchant),''), beneficiary) AS merchant, ABS(amount) AS amt
             FROM transactions t JOIN categories c ON c.id=t.category_id
            WHERE t.date LIKE ? AND t.direction='D' AND c.name IN ('Shopping','Other Expenses','Major Purchase')
           UNION ALL
           SELECT description AS merchant, ABS(amount) AS amt
             FROM revolut_transactions r JOIN categories c ON c.id=r.category_id
            WHERE r.date LIKE ? AND r.amount < 0 AND c.name IN ('Shopping','Other Expenses','Major Purchase')
         ) GROUP BY merchant ORDER BY total DESC LIMIT 25`,
      )
      .all(`${YEAR}-%`, `${YEAR}-%`);

    const travel = db
      .prepare(
        `SELECT c.name AS cat, SUM(amt) AS total, COUNT(*) AS cnt FROM (
           SELECT t.category_id, ABS(t.amount) AS amt FROM transactions t
            WHERE t.date LIKE ? AND t.direction='D' AND t.amount < 0
           UNION ALL
           SELECT r.category_id, ABS(r.amount) AS amt FROM revolut_transactions r
            WHERE r.date LIKE ? AND r.amount < 0
         ) x JOIN categories c ON c.id=x.category_id
         WHERE c.name IN ('Travel','Accommodation','Transport','Car')
         GROUP BY c.name ORDER BY total DESC`,
      )
      .all(`${YEAR}-%`, `${YEAR}-%`);

    const uncategorized = db
      .prepare(
        `SELECT COALESCE(SUM(amt),0) AS total, COUNT(*) AS cnt FROM (
           SELECT ABS(amount) AS amt FROM transactions t
            LEFT JOIN categories c ON c.id=t.category_id
            WHERE t.date LIKE ? AND t.direction='D' AND (c.is_default=1 OR c.name LIKE '%Uncategor%')
           UNION ALL
           SELECT ABS(amount) AS amt FROM revolut_transactions r
            LEFT JOIN categories c ON c.id=r.category_id
            WHERE r.date LIKE ? AND r.amount < 0 AND (c.is_default=1 OR c.name LIKE '%Uncategor%')
         )`,
      )
      .get(`${YEAR}-%`, `${YEAR}-%`);

    console.log(JSON.stringify({
      year: YEAR,
      income: income.total,
      expenses: { bank: bankExp.total, revolut: revExp.total, combined: bankExp.total + revExp.total },
      savings: income.total - (bankExp.total + revExp.total),
      byCategory,
      byMonth,
      topMerchants,
      subscriptions,
      dining,
      shopping,
      travel,
      uncategorized,
    }, null, 2));
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
