const { randomUUID } = require('crypto');
const { todayStr, addDaysStr, addWeeksStr, addMonthsStr, addYearsStr } = require('./dates');
const { roundMoney } = require('./status');

function parseRule(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function nextDueDate(fromDateStr, rule) {
  const ruleObj = parseRule(rule);
  if (!ruleObj?.frequency || !fromDateStr) return null;
  const interval = Math.max(1, Number(ruleObj.interval) || 1);
  let next;
  switch (ruleObj.frequency) {
    case 'weekly':
      next = addWeeksStr(fromDateStr, interval);
      break;
    case 'yearly':
      next = addYearsStr(fromDateStr, interval);
      break;
    case 'monthly':
    default:
      next = addMonthsStr(fromDateStr, interval);
      break;
  }
  if (ruleObj.endDate && next > ruleObj.endDate) return null;
  return next;
}

/**
 * Generate recurring instances only through `throughDate` (default: end of current month).
 * Avoids cluttering "this month" views with next month's rent.
 */
function ensureRecurringInstances(db, options = {}) {
  let throughDate;
  if (typeof options === 'number') {
    throughDate = addDaysStr(todayStr(), options);
  } else if (typeof options === 'string') {
    throughDate = options;
  } else {
    throughDate = options.throughDate;
  }
  const { monthEnd } = require('./dates').monthRangeStr();
  const horizon = throughDate || monthEnd;

  const templates = db.prepare(`
    SELECT * FROM money_obligations
    WHERE is_series_template = 1 AND cancelled_at IS NULL AND recurrence_rule IS NOT NULL
  `).all();
  let created = 0;

  for (const tpl of templates) {
    const seriesId = tpl.series_id || `series-${tpl.id}`;
    if (!tpl.series_id) {
      db.prepare('UPDATE money_obligations SET series_id = ? WHERE id = ?').run(seriesId, tpl.id);
    }

    let cursor = tpl.due_date || todayStr();
    const rule = tpl.recurrence_rule;
    const maxIter = 48;
    let iter = 0;

    while (cursor && cursor <= horizon && iter < maxIter) {
      iter += 1;
      const exists = db.prepare(`
        SELECT id FROM money_obligations
        WHERE series_id = ? AND due_date = ? AND is_series_template = 0 AND cancelled_at IS NULL
      `).get(seriesId, cursor);

      if (!exists && cursor >= todayStr()) {
        db.prepare(`
          INSERT INTO money_obligations (
            direction, obligation_kind, title, amount, currency, amount_paid, due_date,
            counterparty, category, description, status, reminder_days, recurrence_rule,
            series_id, is_series_template, tags, shared_event_id
          ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'upcoming', ?, NULL, ?, 0, ?, ?)
        `).run(
          tpl.direction,
          tpl.obligation_kind,
          tpl.title,
          tpl.amount,
          tpl.currency,
          cursor,
          tpl.counterparty,
          tpl.category,
          tpl.description,
          tpl.reminder_days,
          seriesId,
          tpl.tags,
          tpl.shared_event_id,
        );
        created += 1;
      }

      const next = nextDueDate(cursor, rule);
      if (!next || next === cursor) break;
      cursor = next;
    }
  }

  return created;
}

function attachRecurrenceOnCreate(payload) {
  const rule = parseRule(payload.recurrence_rule);
  if (!rule?.frequency) return { series_id: null, is_series_template: 0, recurrence_rule: null };

  const seriesId = randomUUID();
  return {
    series_id: seriesId,
    is_series_template: 1,
    recurrence_rule: JSON.stringify(rule),
  };
}

module.exports = {
  parseRule,
  nextDueDate,
  ensureRecurringInstances,
  attachRecurrenceOnCreate,
};
