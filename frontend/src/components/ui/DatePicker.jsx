import { useRef, useId } from 'react';
import { Calendar, X } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import clsx from 'clsx';

function displayValue(iso) {
  if (!iso) return '';
  const d = parseISO(iso);
  return isValid(d) ? format(d, 'dd MMM yyyy') : iso;
}

export default function DatePicker({ value, onChange, placeholder = 'Pick date', className, id }) {
  const inputRef = useRef(null);
  const reactId = useId();
  const inputId = id || reactId;

  const handleClick = (e) => {
    try {
      if (typeof e.currentTarget.showPicker === 'function') {
        e.currentTarget.showPicker();
      }
    } catch {
      /* ignore */
    }
  };

  const handleClear = (e) => {
    e.stopPropagation();
    e.preventDefault();
    onChange('');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className={clsx('relative inline-flex items-center w-full min-w-[120px]', className)}>
      {/* Visual representation styled consistently with other inputs */}
      <div
        className={clsx(
          'input w-full text-left flex items-center gap-2 pr-7 pointer-events-none select-none',
          !value && 'text-gray-400'
        )}
      >
        <Calendar size={15} className="text-gray-400 flex-shrink-0" />
        <span className="flex-1 truncate text-xs sm:text-sm font-medium">
          {value ? displayValue(value) : placeholder}
        </span>
      </div>

      {/* Interactive native date input covering the entire control */}
      <input
        ref={inputRef}
        id={inputId}
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onClick={handleClick}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        aria-label={placeholder}
      />

      {/* Quick clear button when a date is selected */}
      {value ? (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 z-10 p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title="Clear date"
          aria-label="Clear date"
        >
          <X size={13} />
        </button>
      ) : null}
    </div>
  );
}
