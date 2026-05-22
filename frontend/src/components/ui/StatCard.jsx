import clsx from 'clsx';

export default function StatCard({ label, value, sub, icon, color = 'blue', trend }) {
  const colors = {
    blue:   'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    green:  'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    red:    'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
    gray:   'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  };

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {label}
          </p>
          <p className="mt-1 text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white break-words">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
        </div>
        {icon && (
          <div className={clsx('p-2 rounded-lg', colors[color])}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
