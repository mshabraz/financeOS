/**
 * Fetch live balances from Enable Banking and persist on bank_connections + account_balances.
 */

const logger = require('../logger');
const { getAccountBalances } = require('./enableBankingClient');
const { pickPrimaryBalance } = require('./balanceUtils');

function isRevolutConnection(connection) {
  return /revolut/i.test(connection?.aspsp_name || '');
}

function upsertCsvStyleBankBalance(db, connection, balance) {
  const account = connection.account_iban || connection.account_name || connection.account_uid;
  const balanceDate = balance.asOf?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const existing = db.prepare(
    `SELECT id FROM account_balances
     WHERE account = ? AND balance_type = 'closing' AND balance_date = ?`,
  ).get(account, balanceDate);

  if (existing) {
    db.prepare(
      `UPDATE account_balances SET amount = ?, currency = ? WHERE id = ?`,
    ).run(balance.amount, balance.currency, existing.id);
  } else {
    db.prepare(`
      INSERT INTO account_balances (account, balance_type, amount, currency, balance_date)
      VALUES (?, 'closing', ?, ?, ?)
    `).run(account, balance.amount, balance.currency, balanceDate);
  }
}

function storeConnectionBalance(db, connection, balance) {
  db.prepare(`
    UPDATE bank_connections
    SET balance_amount = ?, balance_currency = ?, balance_as_of = ?, balance_updated_at = datetime('now')
    WHERE id = ?
  `).run(balance.amount, balance.currency, balance.asOf, connection.id);

  if (!isRevolutConnection(connection)) {
    upsertCsvStyleBankBalance(db, connection, balance);
  }
}

async function refreshConnectionBalance(db, connection, reqMeta) {
  if (!connection?.account_uid) return null;
  try {
    const data = await getAccountBalances(connection.account_uid, reqMeta);
    const balance = pickPrimaryBalance(data);
    if (!balance) {
      logger.warn('[OpenBanking] No usable balance returned', {
        connectionId: connection.id,
        aspsp: connection.aspsp_name,
      });
      return null;
    }
    storeConnectionBalance(db, connection, balance);
    return balance;
  } catch (err) {
    logger.warn('[OpenBanking] Balance fetch failed', {
      connectionId: connection.id,
      err: err.message,
    });
    return null;
  }
}

async function refreshAllConnectionBalances(db, reqMeta) {
  const connections = db.prepare('SELECT * FROM bank_connections').all();
  const results = [];
  for (const conn of connections) {
    const balance = await refreshConnectionBalance(db, conn, reqMeta);
    results.push({
      connectionId: conn.id,
      aspspName: conn.aspsp_name,
      accountIban: conn.account_iban,
      balance,
    });
  }
  return results;
}

module.exports = {
  isRevolutConnection,
  refreshConnectionBalance,
  refreshAllConnectionBalances,
  storeConnectionBalance,
};
