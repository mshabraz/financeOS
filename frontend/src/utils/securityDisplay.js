/** Display priority: custom name → nickname → official → ticker */

function trim(s) {
  if (s == null) return '';
  return String(s).trim();
}

export function officialSecurityName(row) {
  return (
    trim(row.officialSecurityName)
    || trim(row.securityName)
    || trim(row.fundName)
    || trim(row.name)
    || null
  );
}

export function resolveDisplayName(row) {
  const custom = trim(row.customDisplayName ?? row.binding?.customDisplayName);
  if (custom) return custom;
  const nick = trim(row.nickname ?? row.binding?.nickname);
  if (nick) return nick;
  const official = officialSecurityName(row);
  if (official) return official;
  return trim(row.ticker) || '—';
}

export function resolveDisplaySecondary(row) {
  if (row.displaySecondary) return row.displaySecondary;
  const ticker = trim(row.ticker);
  const official = officialSecurityName(row);
  const isin = trim(row.isin);
  const parts = [];
  if (ticker) parts.push(ticker);
  if (official && official.toUpperCase() !== ticker.toUpperCase()) {
    parts.push(official);
  } else if (isin) {
    parts.push(isin);
  }
  return parts.length ? parts.join(' • ') : null;
}

/** Normalize API rows for consistent display fields. */
export function attachSecurityDisplay(row) {
  if (!row) return row;
  const displayName = resolveDisplayName(row);
  const displaySecondary = resolveDisplaySecondary(row);
  const official = officialSecurityName(row);
  return {
    ...row,
    officialSecurityName: official,
    displayName,
    displaySecondary,
  };
}

export function matchesSecuritySearch(row, query) {
  const q = trim(query).toLowerCase();
  if (!q) return true;
  const hay = [
    row.displayName,
    resolveDisplayName(row),
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
