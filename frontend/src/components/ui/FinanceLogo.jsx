import clsx from 'clsx';

const ICON_SRC = '/logo-icon.svg';

/**
 * FinanceOS brand mark — icon + full wordmark (Finance + OS).
 * @param {'icon'|'full'} variant — icon-only, or icon with complete FinanceOS text
 */
export default function FinanceLogo({
  variant = 'icon',
  size = 32,
  className = '',
}) {
  if (variant === 'full') {
    const iconSize = Math.round(size * 0.95);
    const textSize = Math.max(14, Math.round(size * 0.42));
    return (
      <div className={clsx('flex items-center gap-2 min-w-0', className)} aria-label="FinanceOS">
        <img
          src={ICON_SRC}
          alt=""
          width={iconSize}
          height={iconSize}
          className="rounded-[22%] object-contain shrink-0"
          aria-hidden
        />
        <span
          className="font-bold leading-none whitespace-nowrap text-gray-900 dark:text-white"
          style={{ fontSize: textSize }}
        >
          Finance<span className="text-emerald-500 dark:text-emerald-400">OS</span>
        </span>
      </div>
    );
  }

  return (
    <img
      src={ICON_SRC}
      alt="FinanceOS"
      width={size}
      height={size}
      className={clsx('rounded-[22%] object-contain shrink-0', className)}
    />
  );
}
