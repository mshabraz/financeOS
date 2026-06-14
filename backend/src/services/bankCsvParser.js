/**
 * Detect and parse bank transaction CSV exports (LHV, SEB, Swedbank).
 */

const { parseCSV: parseLhvCSV } = require('./csvParser');
const { isSebCSV, parseSebCSV } = require('./sebParser');
const { isRevolutCSV } = require('./revolutParser');
const { isSwedbankWrappedExport, preprocessBankCsvBuffer } = require('./swedbankCsvNormalizer');

function detectBankCsvFormat(buffer) {
  if (isRevolutCSV(buffer)) return 'revolut';
  if (isSwedbankWrappedExport(buffer)) return 'swedbank';
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

  const parsedBuffer = format === 'swedbank' ? preprocessBankCsvBuffer(buffer) : buffer;

  if (format === 'seb') return parseSebCSV(parsedBuffer);
  return parseLhvCSV(parsedBuffer);
}

module.exports = { detectBankCsvFormat, parseBankCSV };
