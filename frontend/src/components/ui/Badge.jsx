import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-brand-600 text-white shadow hover:bg-brand-700',
        secondary:
          'border-black/[0.04] dark:border-white/[0.06] bg-black/[0.04] dark:bg-white/[0.08] text-gray-800 dark:text-gray-200',
        outline:
          'border-black/[0.08] dark:border-white/[0.12] text-gray-700 dark:text-gray-300 bg-white/70 dark:bg-slate-900/60 backdrop-blur-sm shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]',
        success:
          'border-emerald-500/20 dark:border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium',
        destructive:
          'border-rose-500/20 dark:border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 font-medium',
        warning:
          'border-amber-500/20 dark:border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium',
        muted:
          'border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.04] text-gray-500 dark:text-gray-400 font-normal',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
