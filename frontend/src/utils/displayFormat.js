import { maskIfPrivacy, maskTextIfPrivacy } from './privacyMask';

export function fmtEur(n, opts = {}) {
  if (n == null || Number.isNaN(n)) return maskIfPrivacy('—');
  const amount = opts.abs ? Math.abs(n) : n;
  const formatted = new Intl.NumberFormat('et-EE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: opts.decimals ?? 2,
    signDisplay: opts.sign ? 'exceptZero' : 'auto',
  }).format(amount ?? 0);
  return maskIfPrivacy(formatted);
}

export function fmtCurrency(n, currency = 'EUR', opts = {}) {
  if (n == null || Number.isNaN(n)) return maskIfPrivacy('—');
  const amount = opts.abs ? Math.abs(n) : n;
  const formatted = new Intl.NumberFormat('et-EE', {
    style: 'currency',
    currency,
    maximumFractionDigits: opts.decimals ?? 2,
  }).format(amount ?? 0);
  return maskIfPrivacy(formatted);
}

export function fmtPkr(n) {
  const formatted = `₨${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n ?? 0))}`;
  return maskIfPrivacy(formatted);
}

export function fmtNumber(n, opts = {}) {
  if (n == null || Number.isNaN(n)) return maskIfPrivacy('—');
  const formatted = new Intl.NumberFormat('en', { maximumFractionDigits: opts.decimals ?? 6 }).format(n);
  return maskIfPrivacy(formatted);
}

export function fmtPct(n, opts = {}) {
  if (n == null || Number.isNaN(n)) return maskIfPrivacy('—');
  const sign = opts.sign && n > 0 ? '+' : '';
  return maskIfPrivacy(`${sign}${n.toFixed(opts.decimals ?? 1)}%`);
}

export function privText(value) {
  return maskTextIfPrivacy(value);
}
