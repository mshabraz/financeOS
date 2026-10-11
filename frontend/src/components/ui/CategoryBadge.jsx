import * as React from 'react';
import { cn } from '../../lib/utils';

export default function CategoryBadge({ icon, name, color, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border border-black/[0.08] dark:border-white/[0.10] bg-white/60 dark:bg-slate-800/40 backdrop-blur-sm text-gray-700 dark:text-gray-300 transition-colors',
        className
      )}
      style={
        color
          ? {
              backgroundColor: `${color}14`,
              borderColor: `${color}35`,
              color: color,
            }
          : undefined
      }
    >
      {icon && <span className="text-xs leading-none">{icon}</span>}
      <span className="truncate max-w-[130px]">{name || 'Uncategorized'}</span>
    </span>
  );
}
