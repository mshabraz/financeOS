/**
 * Investment parser entry point.
 * Detects broker format and routes to the correct parser.
 *
 * Usage:
 *   const { detect, parse } = require('./parsers');
 *   const detected = detect(buffer);          // { broker, brokerName, confidence, notes }
 *   const result   = parse(buffer);           // { broker, transactions, errors, summary, ... }
 *
 * Adding a new broker:
 *   1. Create backend/src/services/parsers/myBroker.js exporting { parse, BROKER }
 *   2. Add detection logic to detector.js
 *   3. Register in PARSERS map below
 */

const { detectBroker } = require('./detector');
const lightyear         = require('./lightyear');
const swedbankFund      = require('./swedbankFund');

const PARSERS = {
  lightyear:     lightyear,
  swedbank_fund: swedbankFund,
};

/**
 * Detect the broker format from a buffer.
 * Returns full detection object including broker key, name, confidence, notes.
 */
function detect(buffer) {
  return detectBroker(buffer);
}

/**
 * Parse an investment CSV buffer.
 * Auto-detects the broker and returns normalized transactions.
 *
 * Returns:
 *   { broker, brokerName, parserVersion, confidence, detectionNotes,
 *     transactions, errors, skipped, summary, warnings? }
 *
 * Throws if broker is unsupported.
 */
function parse(buffer) {
  const detection = detectBroker(buffer);

  if (detection.broker === 'unknown') {
    throw new Error(`Unable to detect broker format. ${detection.notes.join('; ')}`);
  }

  if (detection.broker === 'lhv_bank') {
    throw new Error('This looks like an LHV bank current account CSV. Please use the bank Import page instead.');
  }

  const parser = PARSERS[detection.broker];
  if (!parser) {
    throw new Error(`No parser registered for broker: ${detection.broker}`);
  }

  const result = parser.parse(buffer);

  return {
    ...result,
    confidence:     detection.confidence,
    detectionNotes: detection.notes,
  };
}

/**
 * List all registered broker keys.
 */
function supportedBrokers() {
  return Object.keys(PARSERS).map((key) => ({
    key,
    name:          PARSERS[key].BROKER,
    parserVersion: PARSERS[key].PARSER_VERSION,
  }));
}

module.exports = { detect, parse, supportedBrokers, PARSERS };
