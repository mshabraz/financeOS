import { useRef, useCallback, useId } from 'react';
import { Calendar } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import clsx from 'clsx';

function displayValue(iso) {
  if (!iso) return '';
  const d = parseISO(iso);
  return isValid(d) ? format(d, 'dd MMM yyyy') : iso;
}

/**
 * Opens the native date picker from a visible control.
 *
 * Desktop: overlaying opacity-0 inputs often fails to open; showPicker may return
 * a rejected Promise when the UA dislikes “invisible” fields. Using a clipped
 * off-screen input + explicit showPicker()/click fallback fixes that.
 */
function openNativeDatePicker(input) {
  if (!input) return;
  const runClick = () => {
    try {
      input.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
    try {
      input.click();
    } catch {
      /* ignore */
    }
  };
  try {
    if (typeof input.showPicker === 'function') {
      const result = input.showPicker();
      if (result && typeof result.then === 'function') {
        result.catch(runClick);
      }
      return;
    }
  } catch {
    runClick();
    return;
  }
  runClick();
}

/**
 * Native date field with readable label — works on desktop (mouse), mobile (touch),
 * and screen readers (`aria-label`; input kept focusable/sr-hidden but not aria-hidden).
 */
export default function DatePicker({ value, onChange, placeholder = 'Pick date', className, id }) {
  const inputRef = useRef(null);
  const reactId = useId();
  const nativeInputId = id ? `${id}-native` : `${reactId}-native`;

  const handleOpen = useCallback(() => {
    openNativeDatePicker(inputRef.current);
  }, []);

  return (
    <div className={clsx('relative', className)}>
      <input
        ref={inputRef}
        id={nativeInputId}
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        tabIndex={-1}
        aria-label={placeholder}
      />
      <button
        type="button"
        id={id}
        onClick={(e) => {
          e.preventDefault();
          handleOpen();
        }}
        className={clsx(
          'input w-full text-left flex items-center gap-2 pr-3',
          !value && 'text-gray-400'
        )}
        aria-label={placeholder}
      >
        <Calendar size={16} className="text-gray-400 flex-shrink-0 pointer-events-none" />
        <span className="flex-1 truncate pointer-events-none">
          {value ? displayValue(value) : placeholder}
        </span>
      </button>
    </div>
  );
}
