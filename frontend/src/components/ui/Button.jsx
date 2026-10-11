import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-50 select-none touch-manipulation',
  {
    variants: {
      variant: {
        default:
          'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm',
        destructive:
          'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm',
        outline:
          'border border-black/[0.06] dark:border-white/[0.08] bg-white/60 dark:bg-slate-900/40 backdrop-blur-sm hover:bg-white/90 dark:hover:bg-slate-900/70 hover:border-black/[0.1] dark:hover:border-white/[0.14] text-slate-800 dark:text-slate-200 shadow-sm',
        secondary:
          'bg-black/[0.04] hover:bg-black/[0.07] active:bg-black/[0.09] border border-black/[0.05] text-slate-800 backdrop-blur-sm shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8)] dark:bg-white/[0.06] dark:hover:bg-white/[0.1] dark:active:bg-white/[0.12] dark:border-white/[0.08] dark:text-slate-200 dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]',
        ghost:
          'hover:bg-black/[0.04] dark:hover:bg-white/[0.06] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white',
        link:
          'text-brand-600 underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-lg px-8 text-base',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const Button = React.forwardRef(({ className, variant, size, ...props }, ref) => {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
});
Button.displayName = 'Button';

export { Button, buttonVariants };
