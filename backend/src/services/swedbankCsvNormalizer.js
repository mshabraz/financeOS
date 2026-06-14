/**
 * Swedbank (and similar) internet-bank CSV exports are semicolon-separated LHV-style
 * rows, but Excel often saves them as comma-CSV with each semicolon row wrapped in
 * outer quotes and inner fields doubled (""value""). European decimal commas in
 * amounts become broken "3481","12" patterns.
 */

const iconv = require('iconv-lite');

function decodeBuffer(buffer) {
  try {
    const utf = iconv.decode(buffer, 'utf-8');
    if (utf.includes('\uFFFD')) throw new Error('Bad UTF-8');
    return utf;
  } catch {
    return iconv.decode(buffer, 'latin1');
  }
}

function peekFirstNonEmptyLine(buffer) {
  const content = decodeBuffer(buffer);
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map((l) => l.trim()).find((l) => l.length) || '';
}

/**
 * Detect Excel-wrapped Swedbank export (Client account header + doubled quotes).
 */
function isSwedbankWrappedExport(buffer) {
  const line = peekFirstNonEmptyLine(buffer);
  if (!line.includes('Client account')) return false;
  if (line.includes('""Row type""') || line.includes('""Date""')) return true;
  if (line.startsWith('"') && line.includes(';""')) return true;

  // Single outer field containing the whole semicolon row
  if (line.startsWith('"') && line.includes(';') && !line.slice(1).trimStart().startsWith('"')) {
    const inner = line.replace(/^"+|"+$/g, '').replace(/,+$/g, '');
    return inner.includes(';');
  }
  return false;
}

function normalizeSwedbankLine(line) {
  let s = line.trim();
  if (!s) return s;

  s = s.replace(/,+$/g, '');

  if (s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1);
  }

  s = s.replace(/""/g, '"');

  // Excel-broken European decimal amounts: "39","00" → "39,00"
  s = s.replace(/"(\d+)","(\d{2})"/g, '"$1,$2"');

  // Excel-broken commas inside text fields: HARJUMAA"," TA → HARJUMAA, TA
  s = s.replace(/([A-Za-z0-9])","(\s*[A-Za-z])/g, '$1,$2');

  // Broken IBAN / account fragments in details: '30101119828"," EE3600001822
  s = s.replace(/'(\d+)","(\s*EE\d+)/g, "'$1, $2");

  return s;
}

function normalizeSwedbankCsvContent(content) {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  return lines.map((line) => normalizeSwedbankLine(line)).join('\n');
}

function preprocessBankCsvBuffer(buffer) {
  if (!isSwedbankWrappedExport(buffer)) return buffer;
  const normalized = normalizeSwedbankCsvContent(decodeBuffer(buffer));
  return Buffer.from(normalized, 'utf8');
}

module.exports = {
  isSwedbankWrappedExport,
  normalizeSwedbankLine,
  normalizeSwedbankCsvContent,
  preprocessBankCsvBuffer,
};
