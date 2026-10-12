import { useState, useMemo, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  format,
  parseISO,
  isValid,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
} from 'date-fns';
import { Popover, PopoverTrigger, PopoverContent } from './Popover';
import { cn } from '../../lib/utils';

function displayValue(iso) {
  if (!iso) return '';
  const d = parseISO(iso);
  return isValid(d) ? format(d, 'dd MMM yyyy') : iso;
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export default function DatePicker({
  value,
  onChange,
  placeholder = 'Pick date',
  className,
  id,
  size = 'default',
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = useMemo(() => {
    if (!value) return null;
    const d = parseISO(value);
    return isValid(d) ? d : null;
  }, [value]);

  const [currentMonth, setCurrentMonth] = useState(() => selectedDate || new Date());

  useEffect(() => {
    if (selectedDate) {
      setCurrentMonth(selectedDate);
    }
  }, [selectedDate]);

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: startDate, end: endDate });
  }, [currentMonth]);

  const handleSelect = (day) => {
    const formatted = format(day, 'yyyy-MM-dd');
    onChange(formatted);
    setOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
  };

  const handleToday = () => {
    const today = new Date();
    onChange(format(today, 'yyyy-MM-dd'));
    setCurrentMonth(today);
    setOpen(false);
  };

  return (
    <div className={cn('relative inline-flex items-center w-full min-w-[120px]', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            className={cn(
              size === 'sm'
                ? 'flex min-h-[34px] h-[34px] w-full items-center justify-between rounded-lg backdrop-blur-sm px-2.5 py-1 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 select-none cursor-pointer transition-colors'
                : 'flex min-h-[44px] h-[44px] w-full items-center justify-between rounded-lg backdrop-blur-sm px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 select-none cursor-pointer transition-colors',
              'border border-black/[0.08] dark:border-white/[0.08] bg-white/70 dark:bg-slate-900/50',
              'hover:bg-white/90 dark:hover:bg-slate-900/70 hover:border-black/[0.12] dark:hover:border-white/[0.12]',
              'focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/80 focus:bg-white dark:focus:bg-slate-900/80',
              !value && 'text-slate-400 dark:text-slate-500'
            )}
            aria-label={placeholder}
          >
            <div className="flex items-center gap-2 truncate">
              <CalendarIcon size={size === 'sm' ? 12 : 14} className="text-slate-400 dark:text-slate-500 shrink-0" />
              <span className={cn('truncate font-medium', size === 'sm' ? 'text-xs' : 'text-xs sm:text-sm')}>
                {value ? displayValue(value) : placeholder}
              </span>
            </div>
            {value && (
              <span
                role="button"
                tabIndex={0}
                onClick={handleClear}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClear(e); }}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors shrink-0 ml-1"
                title="Clear date"
                aria-label="Clear date"
              >
                <X size={size === 'sm' ? 11 : 13} />
              </span>
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-[280px] p-3">
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-3 px-1">
            <button
              type="button"
              onClick={() => setCurrentMonth((prev) => subMonths(prev, 1))}
              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors"
              title="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <button
              type="button"
              onClick={() => setCurrentMonth((prev) => addMonths(prev, 1))}
              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors"
              title="Next month"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {WEEKDAYS.map((day) => (
              <span key={day} className="text-[11px] font-medium text-slate-400 dark:text-slate-500 py-1">
                {day}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isTodayDate = isToday(day);

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => handleSelect(day)}
                  className={cn(
                    'h-8 w-8 rounded-lg text-xs font-medium flex items-center justify-center transition-colors relative mx-auto',
                    isSelected
                      ? 'bg-brand-600 text-white font-semibold shadow-sm'
                      : isCurrentMonth
                      ? 'text-slate-900 dark:text-slate-100 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]'
                      : 'text-slate-300 dark:text-slate-600 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]',
                    isTodayDate && !isSelected && 'ring-1 ring-brand-500 text-brand-600 dark:text-brand-400 font-semibold'
                  )}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>

          {/* Bottom Actions: Today / Clear */}
          <div className="mt-3 pt-2.5 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between text-xs px-1">
            <button
              type="button"
              onClick={handleToday}
              className="text-brand-600 dark:text-brand-400 hover:underline font-medium"
            >
              Today
            </button>
            {value && (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                Clear
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
