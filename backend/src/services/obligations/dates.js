function pad(n) {
  return String(n).padStart(2, '0');
}

function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayStr() {
  return toDateStr(new Date());
}

function parseDateStr(s) {
  if (!s || typeof s !== 'string') return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function addDaysStr(dateStr, days) {
  const d = parseDateStr(dateStr) || new Date();
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

function addWeeksStr(dateStr, weeks) {
  return addDaysStr(dateStr, weeks * 7);
}

function addMonthsStr(dateStr, months) {
  const d = parseDateStr(dateStr) || new Date();
  d.setMonth(d.getMonth() + months);
  return toDateStr(d);
}

function addYearsStr(dateStr, years) {
  const d = parseDateStr(dateStr) || new Date();
  d.setFullYear(d.getFullYear() + years);
  return toDateStr(d);
}

function daysBetween(fromStr, toStr) {
  const a = parseDateStr(fromStr);
  const b = parseDateStr(toStr);
  if (!a || !b) return null;
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/** First and last calendar day of the month (YYYY-MM-DD). */
function monthRangeStr(refDate = new Date()) {
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  const monthStart = `${y}-${pad(m + 1)}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const monthEnd = `${y}-${pad(m + 1)}-${pad(lastDay)}`;
  return { monthStart, monthEnd, monthLabel: `${y}-${pad(m + 1)}` };
}

module.exports = {
  toDateStr,
  todayStr,
  parseDateStr,
  addDaysStr,
  addWeeksStr,
  addMonthsStr,
  addYearsStr,
  daysBetween,
  monthRangeStr,
};
