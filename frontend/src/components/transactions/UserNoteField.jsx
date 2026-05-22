import { useState, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import { Check, Pencil } from 'lucide-react';

/**
 * Inline editable user-defined note / short description.
 * Tap to edit; blur or ✓ saves; Esc cancels (optional).
 */
export default function UserNoteField({
  value,
  onSave,
  placeholder = 'Add a note…',
  className,
  multiline = true,
  minRows = 2,
  disabled = false,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  const commit = useCallback(() => {
    const trimmed = (draft || '').trim();
    const next = trimmed === '' ? null : trimmed;
    const prev = (value || '').trim() || null;
    if (next !== prev) {
      onSave(next);
    }
    setEditing(false);
  }, [draft, value, onSave]);

  const cancel = useCallback(() => {
    setDraft(value ?? '');
    setEditing(false);
  }, [value]);

  if (disabled) {
    return (
      <span className={clsx('text-xs text-gray-400', className)}>
        {(value || '').trim() || '—'}
      </span>
    );
  }

  if (editing) {
    const Input = multiline ? 'textarea' : 'input';
    return (
      <div className={clsx('flex flex-col gap-1', className)}>
        <Input
          type={multiline ? undefined : 'text'}
          rows={multiline ? minRows : undefined}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
            if (!multiline && e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          autoFocus
          className="input text-xs w-full min-h-[44px] py-2 touch-manipulation"
          placeholder={placeholder}
          aria-label={placeholder}
        />
        <div className="flex gap-1 justify-end sm:hidden">
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={commit} className="btn-primary text-xs py-1 px-2 gap-1">
            <Check size={12} /> Save
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={cancel} className="btn-secondary text-xs py-1 px-2">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const display = (value || '').trim();

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={clsx(
        'group text-left w-full rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 px-1.5 py-1 -mx-1.5 transition-colors min-h-[36px] touch-manipulation',
        className
      )}
      title="Add or edit your note"
    >
      <div className="flex items-start gap-1">
        <Pencil size={11} className="mt-0.5 flex-shrink-0 text-gray-300 group-hover:text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity" />
        {display ? (
          <span className="text-xs text-gray-700 dark:text-gray-200 line-clamp-2 break-words">{display}</span>
        ) : (
          <span className="text-xs text-gray-400 italic">{placeholder}</span>
        )}
      </div>
    </button>
  );
}
