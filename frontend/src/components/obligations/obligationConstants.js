export const OBLIGATION_KINDS = [
  { id: 'bill', label: 'Bill' },
  { id: 'subscription', label: 'Subscription' },
  { id: 'rent', label: 'Rent' },
  { id: 'utility', label: 'Utility' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'credit_card', label: 'Credit card' },
  { id: 'loan', label: 'Loan' },
  { id: 'mortgage', label: 'Mortgage' },
  { id: 'tax', label: 'Tax' },
  { id: 'reimbursement', label: 'Reimbursement' },
  { id: 'iou', label: 'IOU' },
  { id: 'debt', label: 'Debt' },
  { id: 'custom', label: 'Custom' },
];

export const TABS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'payable', label: 'I owe' },
  { id: 'receivable', label: 'Owed to me' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'recurring', label: 'Recurring' },
  { id: 'settled', label: 'Settled' },
  { id: 'calendar', label: 'Calendar' },
];

export const STATUS_LABELS = {
  upcoming: 'Upcoming',
  due_today: 'Due today',
  paid: 'Paid',
  partial: 'Partial',
  overdue: 'Overdue',
  waiting: 'Waiting',
  settled: 'Settled',
  cancelled: 'Cancelled',
};

export const STATUS_STYLES = {
  upcoming: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20',
  due_today: 'bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-500/30',
  paid: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
  partial: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20',
  overdue: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30',
  waiting: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20',
  settled: 'bg-gray-500/10 text-gray-600 dark:text-gray-300 border-gray-500/20',
  cancelled: 'bg-gray-500/5 text-gray-400 border-gray-500/10',
};

export const REMINDER_PRESETS = [
  { id: 'same_day', days: [0, 1, 3, 7] },
  { id: 'minimal', days: [0, 3] },
  { id: 'week_ahead', days: [0, 1, 3, 7, 14] },
];

export const RECURRENCE_OPTIONS = [
  { id: '', label: 'One-time' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
];
