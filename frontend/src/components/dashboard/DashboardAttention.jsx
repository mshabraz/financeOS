import { Link } from 'react-router-dom';
import { Bell, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

const SEV = {
  error: 'border-red-500/30 bg-red-500/5',
  warning: 'border-amber-500/30 bg-amber-500/5',
  info: 'border-gray-500/20 bg-gray-500/5',
};

export default function DashboardAttention({ items }) {
  if (!items?.length) return null;

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Bell size={16} className="text-amber-500" />
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Needs attention</h2>
      </div>
      <ul className="space-y-2">
        {items.map((item) => {
          const className = clsx(
            'flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm transition-shadow',
            SEV[item.severity] || SEV.info,
            item.href && 'hover:ring-1 hover:ring-brand-500/20',
          );
          const inner = (
            <>
              <div className="min-w-0">
                <p className="font-medium text-gray-800 dark:text-gray-200">{item.title}</p>
                {item.detail && (
                  <p className="text-xs text-gray-500 mt-0.5 break-words leading-snug">{item.detail}</p>
                )}
              </div>
              {item.href && <ChevronRight size={16} className="text-gray-400 shrink-0" />}
            </>
          );
          return (
            <li key={item.id}>
              {item.href ? (
                <Link to={item.href} className={className}>
                  {inner}
                </Link>
              ) : (
                <div className={className}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
