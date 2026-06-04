const OBLIGATION_KINDS = [
  'bill', 'subscription', 'loan', 'reimbursement', 'iou', 'debt', 'tax',
  'rent', 'mortgage', 'utility', 'insurance', 'credit_card', 'custom',
];

const DIRECTIONS = ['payable', 'receivable'];

const STATUSES = [
  'upcoming', 'due_today', 'paid', 'partial', 'overdue',
  'waiting', 'settled', 'cancelled',
];

const DEFAULT_REMINDER_DAYS = [0, 1, 3, 7];

const RECURRENCE_FREQUENCIES = ['weekly', 'monthly', 'yearly', 'custom'];

module.exports = {
  OBLIGATION_KINDS,
  DIRECTIONS,
  STATUSES,
  DEFAULT_REMINDER_DAYS,
  RECURRENCE_FREQUENCIES,
};
