import * as React from 'react';
import { cn } from '../../lib/utils';

const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-xl backdrop-blur-md transition-all duration-200',
      'bg-white/75 dark:bg-slate-900/60',
      'border border-black/[0.06] dark:border-white/[0.08]',
      'text-slate-900 dark:text-slate-100',
      'shadow-[0_1px_3px_0_rgba(0,0,0,0.03),inset_0_1px_0_0_rgba(255,255,255,0.9)]',
      'dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_1px_3px_0_rgba(0,0,0,0.4)]',
      'hover:border-black/[0.1] dark:hover:border-white/[0.12]',
      'hover:bg-white/90 dark:hover:bg-slate-900/75',
      className
    )}
    {...props}
  />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-4 sm:p-5', className)}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      'text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100',
      className
    )}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-xs text-slate-500 dark:text-slate-400', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-4 sm:p-5 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-4 sm:p-5 pt-0', className)}
    {...props}
  />
));
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
