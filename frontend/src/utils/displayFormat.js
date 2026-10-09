import { maskIfPrivacy, maskTextIfPrivacy } from './privacyMask';

export function fmtEur(n, opts = {}) {
  if (n == null || Number.isNaN(n)) return maskIfPrivacy('—');
  const amount = opts.abs ? Math.abs(n) : n;
  const decimals = opts.decimals ?? 2;
  const formatted = new Intl.NumberFormat(opts.locale ?? 'et-EE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: opts.sign ? 'exceptZero' : (opts.signDisplay || 'auto'),
  }).format(amount ?? 0);
  return maskIfPrivacy(formatted);
}

export function fmtCurrency(n, currency = 'EUR', opts = {}) {
  if (n == null || Number.isNaN(n)) return maskIfPrivacy('—');
  const amount = opts.abs ? Math.abs(n) : n;
  const decimals = opts.decimals ?? 2;
  const formatted = new Intl.NumberFormat(opts.locale ?? 'et-EE', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: opts.sign ? 'exceptZero' : (opts.signDisplay || 'auto'),
  }).format(amount ?? 0);
  return maskIfPrivacy(formatted);
}

export function formatFinancialValue(n, opts = {}) {
  return fmtCurrency(n, opts.currency || 'EUR', opts);
}

export function formatFinancialDelta(n, currency = 'EUR', opts = {}) {
  if (n == null || Number.isNaN(n)) return maskIfPrivacy('—');
  return fmtCurrency(n, currency, { ...opts, sign: true });
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
