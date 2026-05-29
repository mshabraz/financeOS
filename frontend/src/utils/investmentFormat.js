import { maskIfPrivacy } from './privacyMask';

export function fmtEur(n, opts = {}) {
  if (n == null || Number.isNaN(n)) return maskIfPrivacy('—');
  return maskIfPrivacy(new Intl.NumberFormat('et-EE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: opts.decimals ?? 2,
    signDisplay: opts.sign ? 'exceptZero' : 'auto',
  }).format(n));
}

export function fmtNative(n, currency = 'EUR') {
  if (n == null || Number.isNaN(n)) return maskIfPrivacy('—');
  return maskIfPrivacy(new Intl.NumberFormat('et-EE', {
    style: 'currency',
    currency: currency || 'EUR',
    maximumFractionDigits: 4,
  }).format(n));
}

export function fmtPct(n, opts = {}) {
  if (n == null || Number.isNaN(n)) return maskIfPrivacy('—');
  const sign = opts.sign && n > 0 ? '+' : '';
  return maskIfPrivacy(`${sign}${n.toFixed(opts.decimals ?? 1)}%`);
}

export function fmtQty(n) {
  if (n == null) return maskIfPrivacy('—');
  return maskIfPrivacy(Number(n).toLocaleString('et-EE', { maximumFractionDigits: 6 }));
}

export function fmtShortDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('et-EE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}
