import { useState, useRef, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function InlineAmountEditor({
  value,
  currency = '€',
  onSave,
  onCancel,
  className,
  autoFocus = true,
}) {
  const [val, setVal] = useState(value ?? '');
  const inputRef = useRef(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [autoFocus]);

  const handleSave = () => {
    onSave?.(val);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel?.();
    }
  };

  return (
    <div className={cn('inline-flex items-center gap-1.5', className)}>
      <div className="relative inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm focus-within:border-transparent focus-within:ring-2 focus-within:ring-brand-500 transition-colors overflow-hidden">
        {currency && (
          <span className="pointer-events-none pl-2.5 pr-1 text-xs font-medium text-gray-400 select-none">
            {currency}
          </span>
        )}
        <input
          ref={inputRef}
          type="number"
          step="any"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-28 py-1.5 pr-2.5 bg-transparent text-sm font-semibold text-right tabular-nums text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none"
        />
      </div>
      <button
        type="button"
        onClick={handleSave}
        className="p-1.5 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 active:scale-95 transition-all focus:outline-none focus:ring-1 focus:ring-emerald-500"
        title="Save (Enter)"
        aria-label="Save"
      >
        <Check size={14} className="stroke-[2.5]" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-95 transition-all focus:outline-none"
        title="Cancel (Esc)"
        aria-label="Cancel"
      >
        <X size={14} className="stroke-[2.5]" />
      </button>
    </div>
  );
}
