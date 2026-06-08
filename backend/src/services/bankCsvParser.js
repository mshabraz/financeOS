/**
 * Detect and parse bank transaction CSV exports (LHV, SEB).
 */

const { parseCSV: parseLhvCSV } = require('./csvParser');
const { isSebCSV, parseSebCSV } = require('./sebParser');
const { isRevolutCSV } = require('./revolutParser');

function detectBankCsvFormat(buffer) {
  if (isRevolutCSV(buffer)) return 'revolut';
  if (isSebCSV(buffer)) return 'seb';
  return 'lhv';
}

function parseBankCSV(buffer) {
  const format = detectBankCsvFormat(buffer);
  if (format === 'revolut') {
    const err = new Error(
      'This file is a Revolut statement. Import it from Transactions → Import / Export (Revolut CSV).'
    );
    err.code = 'REVOLUT_USE_DEDICATED';
    throw err;
  }
  if (format === 'seb') return parseSebCSV(buffer);
  return parseLhvCSV(buffer);
}

module.exports = { detectBankCsvFormat, parseBankCSV };
