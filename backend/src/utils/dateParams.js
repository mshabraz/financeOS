/** Strict YYYY-MM-DD validation for query params (prevents SQL injection via date strings). */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateString(s) {
  if (!s || typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function sanitizeDateParam(value, label = 'date') {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (!isValidDateString(s)) {
    throw new Error(`Invalid ${label}: expected YYYY-MM-DD`);
  }
  return s;
}

function sanitizeDateRange({ dateFrom, dateTo } = {}) {
  const from = sanitizeDateParam(dateFrom, 'dateFrom');
  const to = sanitizeDateParam(dateTo, 'dateTo');
  if (from && to && from > to) {
    throw new Error('dateFrom must be on or before dateTo');
  }
  return { dateFrom: from, dateTo: to };
}

/** YYYY-MM → first day of month (YYYY-MM-DD). */
function monthKeyToDateFrom(monthKey) {
  const m = String(monthKey ?? '').trim();
  if (/^\d{4}-\d{2}$/.test(m)) return `${m}-01`;
  return sanitizeDateParam(m, 'dateFrom');
}

/** YYYY-MM → last calendar day of that month (YYYY-MM-DD). */
function monthKeyToDateTo(monthKey) {
  const m = String(monthKey ?? '').trim();
  if (/^\d{4}-\d{2}$/.test(m)) {
    const [y, mo] = m.split('-').map(Number);
    const last = new Date(y, mo, 0);
    const d = String(last.getDate()).padStart(2, '0');
    const mm = String(mo).padStart(2, '0');
    return `${y}-${mm}-${d}`;
  }
  return sanitizeDateParam(m, 'dateTo');
}

function monthKeyToDateRange(fromMonth, toMonth) {
  return {
    dateFrom: monthKeyToDateFrom(fromMonth),
    dateTo: monthKeyToDateTo(toMonth),
  };
}

function middleware(req, res, next) {
  try {
    const sanitized = sanitizeDateRange({
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
    });
    req.sanitizedDates = sanitized;
    next();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

module.exports = {
  isValidDateString,
  sanitizeDateParam,
  sanitizeDateRange,
  monthKeyToDateFrom,
  monthKeyToDateTo,
  monthKeyToDateRange,
  validateDateQuery: middleware,
};
