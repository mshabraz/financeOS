import clsx from 'clsx';
import { attachSecurityDisplay, resolveDisplayName, resolveDisplaySecondary } from '../../utils/securityDisplay';

/**
 * Primary user-friendly name + optional secondary line (ticker • official name).
 */
export default function SecurityDisplay({
  row,
  primaryClassName = 'font-medium text-gray-900 dark:text-white',
  secondaryClassName = 'text-[11px] text-gray-500 dark:text-gray-400 mt-0.5',
  monoTicker = false,
  showSecondary = true,
  as: Tag = 'div',
}) {
  const r = attachSecurityDisplay(row);
  const primary = resolveDisplayName(r);
  const secondary = showSecondary ? resolveDisplaySecondary(r) : null;

  return (
    <Tag className="min-w-0">
      <p className={clsx(primaryClassName, 'break-words leading-snug')}>{primary}</p>
      {secondary && (
        <p
          className={clsx(
            secondaryClassName,
            'break-words leading-snug',
            monoTicker && 'font-mono',
          )}
        >
          {secondary}
        </p>
      )}
    </Tag>
  );
}
