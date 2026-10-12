import * as React from 'react';
import { cn } from '../../lib/utils';
import { getAccessibleBadgeStyle } from '../../utils/categoryColors';

export default function CategoryBadge({ icon, name, color, className }) {
  const badgeInfo = React.useMemo(() => getAccessibleBadgeStyle(color), [color]);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border backdrop-blur-sm transition-colors',
        'bg-[var(--cat-bg-light)] dark:bg-[var(--cat-bg-dark)]',
        'border-[var(--cat-border-light)] dark:border-[var(--cat-border-dark)]',
        'text-[var(--cat-text-light)] dark:text-[var(--cat-text-dark)]',
        className
      )}
      style={badgeInfo.style}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0 opacity-80"
        style={{ backgroundColor: badgeInfo.dotColor }}
      />
      {icon && <span className="text-xs leading-none">{icon}</span>}
      <span className="truncate max-w-[130px]">{name || 'Uncategorized'}</span>
    </span>
  );
}
