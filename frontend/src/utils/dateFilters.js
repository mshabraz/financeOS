import { format, subMonths, startOfMonth, endOfMonth, parseISO, isValid } from 'date-fns';

/** Last N months for dropdowns (newest first). */
export function buildMonthOptions(count = 24) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = subMonths(now, i);
    const value = format(d, 'yyyy-MM');
    return { value, label: format(d, 'MMMM yyyy') };
  });
}

export function getMonthRange(monthValue) {
  if (!monthValue || !/^\d{4}-\d{2}$/.test(monthValue)) {
    return { dateFrom: '', dateTo: '' };
  }
  const d = parseISO(`${monthValue}-01`);
  if (!isValid(d)) return { dateFrom: '', dateTo: '' };
  return {
    dateFrom: format(startOfMonth(d), 'yyyy-MM-dd'),
    dateTo: format(endOfMonth(d), 'yyyy-MM-dd'),
  };
}

export function sanitizeTransactionParams(params) {
  const out = {};
  Object.entries(params).forEach(([k, v]) => {
    if (v === '' || v === null || v === undefined) return;
    out[k] = v;
  });
  return out;
}
