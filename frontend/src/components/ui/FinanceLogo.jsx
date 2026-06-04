import clsx from 'clsx';

const SRC = {
  icon: '/logo-icon.svg',
  full: '/logo-full.svg',
};

/**
 * FinanceOS brand mark.
 * @param {'icon'|'full'} variant — icon-only squircle, or horizontal wordmark
 */
export default function FinanceLogo({
  variant = 'icon',
  size = 32,
  className = '',
  showText = false,
}) {
  if (variant === 'full' || showText) {
    return (
      <img
        src={SRC.full}
        alt="FinanceOS"
        height={size}
        className={clsx('w-auto object-contain flex-shrink-0', className)}
        style={{ maxHeight: size }}
      />
    );
  }

  return (
    <img
      src={SRC.icon}
      alt="FinanceOS"
      width={size}
      height={size}
      className={clsx('rounded-[22%] object-contain flex-shrink-0', className)}
    />
  );
}
