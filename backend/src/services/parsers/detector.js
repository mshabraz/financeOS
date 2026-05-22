/**
 * Broker format detector.
 *
 * Takes raw CSV buffer and returns:
 *   { broker: string, confidence: number, notes: string[] }
 *
 * Supported brokers:
 *   - 'lightyear'      LightYear.io stock/ETF broker (comma-delimited)
 *   - 'swedbank_fund'  Swedbank mutual fund investment account (semicolon-delimited, LHV-format)
 *
 * The detection is intentionally conservative — returns highest-confidence match
 * and falls back to 'unknown' if nothing fits.
 */

const iconv = require('iconv-lite');

function decodeBuffer(buffer) {
  const utf8 = iconv.decode(buffer, 'utf-8');
  // If UTF-8 has replacement characters, fall back to Windows-1252
  if (utf8.includes('\uFFFD') || utf8.includes('??')) {
    return iconv.decode(buffer, 'win1252');
  }
  return utf8;
}

function getFirstLines(content, n = 5) {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').slice(0, n);
}

/**
 * Detect the broker format for a given CSV buffer.
 * Returns { broker, confidence (0–1), brokerName, notes[] }
 */
function detectBroker(buffer) {
  const content = decodeBuffer(buffer);
  const lines   = getFirstLines(content, 10);
  const header  = lines[0] || '';
  const sample  = lines.slice(0, 10).join('\n');

  const notes = [];

  // ── LightYear detection ──────────────────────────────────────────────────
  // Fingerprints: comma-delimited, has "Ticker","ISIN","Type" columns
  if (header.includes('"Date"') && header.includes('"Ticker"') && header.includes('"ISIN"') && !header.includes(';')) {
    const hasLYRefs = sample.includes('OR-') || sample.includes('DD-') || sample.includes('DT-') || sample.includes('WL-');
    const conf = hasLYRefs ? 1.0 : 0.92;
    notes.push('Detected comma delimiter', 'Found Ticker + ISIN headers');
    if (hasLYRefs) notes.push('Found LightYear reference prefixes (OR-, DD-, DT-, WL-)');
    return { broker: 'lightyear', brokerName: 'LightYear', confidence: conf, notes };
  }

  // ── Swedbank/LHV-format with investment fund patterns ────────────────────
  // Fingerprints: semicolon-delimited, has "Client account";"Row type" headers,
  //               Details contain Fundorder/Fondi patterns
  if (header.includes('"Client account"') && header.includes('"Row type"') && header.includes(';')) {
    notes.push('Detected semicolon delimiter', 'Found "Client account" + "Row type" headers');

    const hasFundPatterns =
      sample.includes('Fundorder') ||
      sample.includes('Fondi ') ||
      sample.includes('müügiorder') ||
      sample.includes('ostuorder') ||
      sample.includes('investeerimine') ||
      sample.includes('SWRGHDC') || sample.includes('SWRAEUC') ||
      sample.includes('SWBRUSAC') || sample.includes('SWRAGLC') ||
      sample.includes('SWRTECC') || sample.includes('SWRMEDC') ||
      sample.includes('SWBACASC');

    if (hasFundPatterns) {
      notes.push('Found Swedbank Robur fund patterns (Fundorder, Fondi, müügiorder)');
      // Extract account number if present
      const acctMatch = sample.match(/"(EE\d+)"/);
      if (acctMatch) notes.push(`Account ID: ${acctMatch[1]}`);
      return { broker: 'swedbank_fund', brokerName: 'Swedbank Investment', confidence: 0.97, notes };
    }

    // Same structure but no fund patterns → regular LHV bank CSV (not an investment file)
    notes.push('Looks like LHV bank account CSV — no investment fund patterns found');
    return { broker: 'lhv_bank', brokerName: 'LHV Bank', confidence: 0.80, notes };
  }

  // ── Fallback ─────────────────────────────────────────────────────────────
  notes.push(`Unknown format. Header: ${header.slice(0, 120)}`);
  return { broker: 'unknown', brokerName: 'Unknown', confidence: 0, notes };
}

module.exports = { detectBroker };
