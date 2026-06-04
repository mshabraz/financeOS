/**
 * User-friendly security display names (per holding binding).
 * Priority: custom display name → nickname → official name → ticker.
 */

function trim(s) {
  if (s == null) return '';
  return String(s).trim();
}

function officialName({ securityName, fundName, name }) {
  return trim(securityName) || trim(fundName) || trim(name) || null;
}

function resolveDisplayName(fields) {
  const custom = trim(fields.customDisplayName ?? fields.custom_display_name);
  if (custom) return custom;
  const nick = trim(fields.nickname);
  if (nick) return nick;
  const official = officialName(fields);
  if (official) return official;
  return trim(fields.ticker) || '—';
}

function resolveSecondaryLine(fields) {
  const ticker = trim(fields.ticker);
  const official = officialName(fields);
  const isin = trim(fields.isin || fields.security_isin);
  const parts = [];
  if (ticker) parts.push(ticker);
  if (official && official.toUpperCase() !== ticker.toUpperCase()) {
    parts.push(official);
  } else if (isin && !parts.includes(isin)) {
    parts.push(isin);
  }
  return parts.length ? parts.join(' • ') : null;
}

function bindingDisplayFields(binding, holding = {}) {
  const securityName = binding?.security_name || holding.fundName;
  return {
    customDisplayName: binding?.custom_display_name ?? null,
    nickname: binding?.nickname ?? null,
    displayNotes: binding?.display_notes ?? null,
    ticker: holding.ticker || binding?.ticker,
    isin: holding.isin || binding?.isin || binding?.security_isin,
    securityName,
    fundName: holding.fundName,
  };
}

function attachSecurityDisplay(row, binding = null) {
  const b = binding ?? row.binding;
  const fields = bindingDisplayFields(b, row);
  const displayName = resolveDisplayName(fields);
  const displaySecondary = resolveSecondaryLine(fields);
  const officialSecurityName = officialName(fields);

  return {
    ...row,
    customDisplayName: fields.customDisplayName,
    nickname: fields.nickname,
    displayNotes: fields.displayNotes,
    officialSecurityName,
    displayName,
    displaySecondary,
    securityName: officialSecurityName || row.securityName || row.fundName || row.ticker,
    binding: b
      ? {
          ...(typeof row.binding === 'object' ? row.binding : {}),
          customDisplayName: fields.customDisplayName,
          nickname: fields.nickname,
          displayNotes: fields.displayNotes,
          securityName: fields.securityName || row.binding?.securityName,
        }
      : row.binding,
  };
}

function matchesSecuritySearch(row, query) {
  const q = trim(query).toLowerCase();
  if (!q) return true;
  const hay = [
    row.displayName,
    row.customDisplayName,
    row.nickname,
    row.ticker,
    row.securityName,
    row.officialSecurityName,
    row.fundName,
    row.displaySecondary,
    row.isin,
    row.binding?.yahooSymbol,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

module.exports = {
  resolveDisplayName,
  resolveSecondaryLine,
  attachSecurityDisplay,
  matchesSecuritySearch,
  bindingDisplayFields,
};
