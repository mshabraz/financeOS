#!/usr/bin/env node
/**
 * One-shot repair for Swedbank fund positions after statement import.
 */
const { initDb, openUserDatabase } = require('../backend/src/db/database');
const { runWithUserId } = require('../backend/src/db/requestContext');
const { computeHoldings } = require('../backend/src/services/investmentHoldings');
const { backfillSwedbankIsins, applyPositionSnapshots } = require('../backend/src/services/investmentImporter');
const { buildPortfolioValuation } = require('../backend/src/services/investmentValuation');

const OWNER_ID = process.env.OWNER_ID || '02bfafa3-9fa8-4b1d-b55f-e6108b246bcf';

async function main() {
  await initDb();
  await new Promise((resolve, reject) => {
    runWithUserId(OWNER_ID, async () => {
      try {
        const db = openUserDatabase(OWNER_ID);
        const isinsBackfilled = backfillSwedbankIsins(db);
        const snapshots = [
          { ticker: 'SWRAEUC', isin: 'SE0015192331', currency: 'EUR', closingBalance: 153.3725 },
          { ticker: 'SWRGHDC', isin: 'SE0014261756', currency: 'EUR', closingBalance: 148.2391 },
        ];
        const snapshotsApplied = applyPositionSnapshots(db, 'swedbank_fund', snapshots);
        const holdings = computeHoldings(db, 'swedbank_fund').filter((h) =>
          ['SWRAEUC', 'SWRGHDC'].includes(h.ticker)
        );
        const valuation = await buildPortfolioValuation(db, 'swedbank_fund');
        const valued = (valuation.openHoldings || []).filter((h) =>
          ['SWRAEUC', 'SWRGHDC'].includes(h.ticker)
        );
        const bindings = db.prepare(
          `SELECT ticker, isin, manual_quantity, manual_avg_cost_per_share, custom_display_name
             FROM holding_security_bindings
            WHERE broker='swedbank_fund' AND ticker IN ('SWRAEUC','SWRGHDC')
            ORDER BY ticker`
        ).all();
        // Force immediate disk persist (sql.js debounce otherwise races process exit).
        const fs = require('fs');
        fs.writeFileSync(db.dbPath, Buffer.from(db._raw.export()));

        console.log(JSON.stringify({
          isinsBackfilled,
          snapshotsApplied,
          holdings,
          bindings,
          valued: valued.map((h) => ({
            ticker: h.ticker,
            isin: h.isin,
            quantityBased: h.quantityBased,
            hybrid: h.hybridAmountAndQuantity,
            effectiveQuantity: h.effectiveQuantity,
            marketValueEur: h.marketValueEur,
            avgCostPerShare: h.avgCostPerShare,
            displayName: h.displayName,
          })),
        }, null, 2));
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
