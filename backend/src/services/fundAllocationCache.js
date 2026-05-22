/**
 * Cache Yahoo fund breakdown (sectors / countries) per yahoo_symbol.
 */

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getCachedBreakdown(db, yahooSymbol) {
  if (!db || !yahooSymbol) return null;
  const row = db
    .prepare(
      `SELECT payload_json, updated_at FROM fund_allocation_cache WHERE yahoo_symbol = ?`
    )
    .get(String(yahooSymbol).trim());
  if (!row?.payload_json) return null;
  const updated = new Date(row.updated_at).getTime();
  if (Number.isFinite(updated) && Date.now() - updated > TTL_MS) return null;
  try {
    return JSON.parse(row.payload_json);
  } catch {
    return null;
  }
}

function setCachedBreakdown(db, yahooSymbol, payload) {
  if (!db || !yahooSymbol || !payload) return;
  db.prepare(
    `INSERT INTO fund_allocation_cache (yahoo_symbol, payload_json, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(yahoo_symbol) DO UPDATE SET
       payload_json = excluded.payload_json,
       updated_at = datetime('now')`
  ).run(String(yahooSymbol).trim(), JSON.stringify(payload));
}

module.exports = { getCachedBreakdown, setCachedBreakdown, TTL_MS };
