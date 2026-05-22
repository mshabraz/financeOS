/**
 * Per-broker uninvested cash (user-entered, not from CSV imports).
 */

const { convertToEur, TARGET } = require('./fxRates');

const DEFAULT_BROKERS = ['lightyear', 'swedbank_fund'];

const BROKER_LABELS = {
  lightyear: 'LightYear',
  swedbank_fund: 'Swedbank Fund',
};

function listKnownBrokers(db) {
  const fromTx = db
    .prepare(
      `SELECT DISTINCT broker FROM investment_transactions
       WHERE broker IS NOT NULL AND TRIM(broker) != ''`
    )
    .all()
    .map((r) => r.broker);
  const fromCash = db
    .prepare('SELECT broker FROM investment_broker_cash')
    .all()
    .map((r) => r.broker);
  return [...new Set([...DEFAULT_BROKERS, ...fromTx, ...fromCash])].sort();
}

function getAllBrokerCash(db) {
  return db.prepare('SELECT * FROM investment_broker_cash ORDER BY broker').all();
}

function getBrokerCash(db, broker) {
  if (!broker) return null;
  return db.prepare('SELECT * FROM investment_broker_cash WHERE broker = ?').get(broker) || null;
}

function setBrokerCash(db, broker, amount, currency = TARGET) {
  const amt = Math.max(0, parseFloat(amount) || 0);
  const ccy = String(currency || TARGET).toUpperCase();
  db.prepare(
    `INSERT INTO investment_broker_cash (broker, amount, currency, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(broker) DO UPDATE SET
       amount = excluded.amount,
       currency = excluded.currency,
       updated_at = excluded.updated_at`
  ).run(broker, amt, ccy);
  return getBrokerCash(db, broker);
}

/**
 * Resolve cash for a portfolio view.
 * @param {string} brokerFilter - '' = all brokers (sum), else single broker key
 */
function resolveBrokerCash(db, brokerFilter, perEur) {
  const rows = brokerFilter
    ? [getBrokerCash(db, brokerFilter)].filter(Boolean)
    : getAllBrokerCash(db).filter((r) => (r.amount || 0) > 0.0001);

  const byBroker = rows.map((r) => ({
    broker: r.broker,
    label: BROKER_LABELS[r.broker] || r.broker,
    amount: r.amount ?? 0,
    currency: (r.currency || TARGET).toUpperCase(),
    amountEur: convertToEur(r.amount, r.currency, perEur) ?? 0,
    updatedAt: r.updated_at,
  }));

  const totalEur = Math.round(byBroker.reduce((s, r) => s + r.amountEur, 0) * 100) / 100;

  return {
    brokerFilter: brokerFilter || null,
    rows: byBroker,
    totalEur,
    currencies: [...new Set(byBroker.map((r) => r.currency))],
  };
}

module.exports = {
  DEFAULT_BROKERS,
  BROKER_LABELS,
  listKnownBrokers,
  getAllBrokerCash,
  getBrokerCash,
  setBrokerCash,
  resolveBrokerCash,
};
