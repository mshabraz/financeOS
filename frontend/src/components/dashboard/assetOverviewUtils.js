/** Build net-worth segments for dashboard asset overview (amounts in EUR). */
export function buildAssetSegments(assets) {
  if (!assets) return { segments: [], total: 0, investmentSplit: null };

  const total = assets.totalAssets ?? 0;
  const segments = [];

  if ((assets.bankBalance ?? 0) !== 0) {
    segments.push({
      key: 'bank',
      label: 'Bank',
      icon: '🏦',
      amount: assets.bankBalance,
      color: '#3b82f6',
    });
  }

  const revolutAmount = assets.revolutClosingBalance ?? assets.revolutSharedAsset ?? 0;
  if (revolutAmount > 0) {
    segments.push({
      key: 'revolut',
      label: 'Revolut',
      icon: '💳',
      amount: revolutAmount,
      color: '#a855f7',
    });
  }

  const portfolio = assets.investmentPortfolio;
  const manuals = assets.manuals ?? [];

  for (const row of manuals) {
    if (row.key === 'investments') {
      const amt = portfolio?.totalPortfolio ?? row.amount ?? 0;
      if (amt > 0) {
        segments.push({
          key: 'investments',
          label: row.label || 'Investments',
          icon: row.icon || '📈',
          amount: amt,
          color: '#10b981',
          computed: true,
        });
      }
      continue;
    }
    const amt = row.amount ?? 0;
    if (amt === 0) continue;
    segments.push({
      key: row.key,
      label: row.label,
      icon: row.icon || '💰',
      amount: amt,
      color: '#6366f1',
    });
  }

  const sumSeg = segments.reduce((s, x) => s + x.amount, 0);
  const investmentSplit = portfolio
    ? {
        holdings: portfolio.holdingsValue ?? 0,
        cash: portfolio.cashBalance ?? 0,
        total: portfolio.totalPortfolio ?? 0,
      }
    : null;

  return { segments, total: total || sumSeg, investmentSplit };
}
