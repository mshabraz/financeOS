import { attachSecurityDisplay, matchesSecuritySearch } from '../../../utils/securityDisplay';

export function positionKey(h) {
  return `${h.broker}|${h.ticker}|${h.currency}`;
}

export function mergePortfolioRows(marketOpen = [], composition = [], totalPortfolioEur = 0) {
  const compMap = new Map();
  for (const c of composition) compMap.set(positionKey(c), c);

  return marketOpen.map((h) => {
    const c = compMap.get(positionKey(h)) || {};
    const securityName =
      c.securityName || h.binding?.securityName || h.fundName || h.ticker;
    const portfolioPct =
      c.portfolioPct ??
      (totalPortfolioEur > 0 && h.marketValueEur != null
        ? Math.round((h.marketValueEur / totalPortfolioEur) * 10000) / 100
        : null);

    return attachSecurityDisplay({
      ...h,
      ...c,
      customDisplayName:
        c.customDisplayName ?? h.customDisplayName ?? h.binding?.customDisplayName,
      nickname: c.nickname ?? h.nickname ?? h.binding?.nickname,
      securityName,
      portfolioPct,
      quantity: c.quantity ?? h.effectiveQuantity ?? h.quantity,
      avgCostPerShare: c.avgCostPerShare ?? h.avgCostPerShare,
      latestPriceEur: c.latestPriceEur ?? h.latestPriceEur ?? h.latestPrice,
      latestPrice: c.latestPrice ?? h.latestPriceNative ?? h.latestPrice,
      marketValueEur: c.marketValueEur ?? h.marketValueEur,
      unrealizedPnLEur: c.unrealizedPnLEur ?? h.unrealizedPnLEur,
      unrealizedPnLPct: c.unrealizedPnLPct ?? h.unrealizedPnLPct,
      dailyChangeEur: c.dailyChangeEur ?? null,
      sector: c.sector ?? null,
      region: c.region ?? null,
      assetClass: c.assetClass ?? null,
      dividendYield: c.dividendYield ?? null,
    });
  });
}

export function computeHoldingsSummary(rows, valuation, analytics) {
  const priced = rows.filter((r) => r.marketValueEur != null && r.priceStatus === 'ok');
  const totalValue = valuation?.primary?.holdingsValue
    ?? priced.reduce((s, r) => s + (r.marketValueEur || 0), 0);
  const totalUnrealized = priced.reduce((s, r) => s + (r.unrealizedPnLEur || 0), 0);
  const totalCost = priced.reduce((s, r) => s + (r.costBasisEur || r.totalCostBasis || 0), 0);
  const unrealizedPct = totalCost > 0 ? (totalUnrealized / totalCost) * 100 : null;

  const byPct = [...priced].sort((a, b) => (b.portfolioPct ?? 0) - (a.portfolioPct ?? 0));
  const byPnl = [...priced].sort((a, b) => (b.unrealizedPnLPct ?? -Infinity) - (a.unrealizedPnLPct ?? -Infinity));
  const best = byPnl[0];
  const worst = [...priced].sort((a, b) => (a.unrealizedPnLPct ?? Infinity) - (b.unrealizedPnLPct ?? Infinity))[0];

  const cash = valuation?.primary?.cashBalance ?? 0;
  const totalPortfolio = valuation?.primary?.totalPortfolio ?? totalValue + cash;
  const investedPct = totalPortfolio > 0 ? ((totalValue / totalPortfolio) * 100) : null;
  const cashPct = totalPortfolio > 0 ? ((cash / totalPortfolio) * 100) : null;

  const divScore = analytics?.diversification?.score;
  const unbound = valuation?.unboundCount ?? 0;
  const needsQty = valuation?.needsQuantityCount ?? 0;

  return {
    totalValue,
    totalUnrealized,
    unrealizedPct,
    totalPortfolio,
    cash,
    investedPct,
    cashPct,
    positionCount: rows.length,
    pricedCount: priced.length,
    largest: byPct[0] ?? null,
    best: best?.unrealizedPnLPct != null ? best : null,
    worst: worst?.unrealizedPnLPct != null ? worst : null,
    diversificationScore: divScore,
    unbound,
    needsQty,
    lastSync: valuation?.sync?.last_success_at,
  };
}

export function holdingInsight(row) {
  const pct = row.portfolioPct;
  const lines = [];
  if (pct != null) {
    if (pct >= 25) lines.push({ level: 'warn', text: `Represents ${pct.toFixed(1)}% of your portfolio — high concentration.` });
    else if (pct >= 15) lines.push({ level: 'info', text: `${pct.toFixed(1)}% of portfolio weight.` });
    else if (pct < 1 && pct > 0) lines.push({ level: 'muted', text: 'Small position — under 1% of portfolio.' });
  }
  if (row.priceStatus === 'needs_binding') {
    lines.push({ level: 'warn', text: 'Link market data to show live price and P/L.' });
  }
  if (row.priceStatus === 'needs_quantity') {
    lines.push({ level: 'warn', text: 'Set quantity and average cost for accurate valuation.' });
  }
  if ((row.unrealizedPnLPct ?? 0) >= 20) {
    lines.push({ level: 'good', text: 'Largest unrealized gain in your open book.' });
  }
  if ((row.unrealizedPnLPct ?? 0) <= -20) {
    lines.push({ level: 'bad', text: 'Notable unrealized loss — review cost basis.' });
  }
  return lines;
}

export function filterAndSortRows(rows, { search, sortKey, sortDir, brokerFilter, statusFilter }) {
  let list = [...rows];
  if (brokerFilter) list = list.filter((r) => r.broker === brokerFilter);
  if (statusFilter === 'needs_action') {
    list = list.filter((r) => r.priceStatus === 'needs_binding' || r.priceStatus === 'needs_quantity' || r.priceStatus === 'error');
  } else if (statusFilter === 'priced') {
    list = list.filter((r) => r.priceStatus === 'ok');
  }
  const q = search.trim();
  if (q) {
    list = list.filter(
      (r) => matchesSecuritySearch(r, q) || r.sector?.toLowerCase().includes(q.toLowerCase()),
    );
  }
  list.sort((a, b) => {
    const key = sortKey === 'displayName' ? 'displayName' : sortKey;
    const av = a[key] ?? a[sortKey];
    const bv = b[key] ?? b[sortKey];
    const aNum = av == null ? -Infinity : Number(av);
    const bNum = bv == null ? -Infinity : Number(bv);
    if (typeof av === 'string' || typeof bv === 'string') {
      const cmp = String(av ?? '').localeCompare(String(bv ?? ''));
      return sortDir === 'asc' ? cmp : -cmp;
    }
    return sortDir === 'asc' ? aNum - bNum : bNum - aNum;
  });
  return list;
}

export const HOLDINGS_COLUMNS = [
  { id: 'securityName', label: 'Security', primary: true, sortKey: 'displayName' },
  { id: 'ticker', label: 'Ticker', primary: true, sortKey: 'ticker' },
  { id: 'quantity', label: 'Qty', primary: true, sortKey: 'quantity' },
  { id: 'marketValueEur', label: 'Value', primary: true, sortKey: 'marketValueEur' },
  { id: 'portfolioPct', label: 'Weight', primary: true, sortKey: 'portfolioPct' },
  { id: 'latestPriceEur', label: 'Price', primary: true, sortKey: 'latestPriceEur' },
  { id: 'avgCostPerShare', label: 'Avg cost', primary: true, sortKey: 'avgCostPerShare' },
  { id: 'unrealizedPnLEur', label: 'Unrealized', primary: true, sortKey: 'unrealizedPnLEur' },
  { id: 'dailyChangeEur', label: 'Today', primary: true, sortKey: 'dailyChangeEur' },
  { id: 'sector', label: 'Sector', primary: false, sortKey: 'sector' },
  { id: 'region', label: 'Region', primary: false, sortKey: 'region' },
  { id: 'broker', label: 'Broker', primary: false, sortKey: 'broker' },
  { id: 'assetClass', label: 'Type', primary: false, sortKey: 'assetClass' },
  { id: 'dividendYield', label: 'Div yield', primary: false, sortKey: 'dividendYield' },
];

export const DEFAULT_VISIBLE_COLUMNS = HOLDINGS_COLUMNS.filter((c) => c.primary).map((c) => c.id);
