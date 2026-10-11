import * as React from 'react';
import { cn } from '../../lib/utils';

export default function CategoryBadge({ icon, name, color, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border border-gray-200/70 dark:border-gray-800/70 bg-gray-50/80 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 transition-colors',
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
