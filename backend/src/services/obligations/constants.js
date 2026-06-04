const OBLIGATION_KINDS = [
  'bill', 'subscription', 'loan', 'reimbursement', 'iou', 'debt', 'tax',
  'rent', 'mortgage', 'utility', 'insurance', 'credit_card', 'custom',
];

const DIRECTIONS = ['payable', 'receivable'];

const STATUSES = [
  'upcoming', 'due_today', 'paid', 'partial', 'overdue',
  'waiting', 'settled', 'cancelled',
];

const RECURRENCE_FREQUENCIES = ['weekly', 'monthly', 'yearly', 'custom'];

module.exports = {
  OBLIGATION_KINDS,
  DIRECTIONS,
  STATUSES,
  RECURRENCE_FREQUENCIES,
};
