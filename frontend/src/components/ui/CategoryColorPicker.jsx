import * as React from 'react';
import { Popover, PopoverTrigger, PopoverContent } from './Popover';
import { Check, Sparkles, Pipette } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  CURATED_CATEGORY_COLORS,
  suggestCategoryColor,
  getAccessibleBadgeStyle,
} from '../../utils/categoryColors';

export default function CategoryColorPicker({
  color,
  categoryName,
  onChange,
  disabled = false,
  className,
  size = 'md',
}) {
  const [open, setOpen] = React.useState(false);
  const [customInput, setCustomInput] = React.useState(color || '#64748b');
  const nativePickerRef = React.useRef(null);

  React.useEffect(() => {
    setCustomInput(color || '#64748b');
  }, [color]);

  const activeColor = (color && color.startsWith('#')) ? color.toLowerCase() : '#64748b';

  const handleSelect = (newHex) => {
    onChange?.(newHex);
    setCustomInput(newHex);
  };

  const handleCustomChange = (val) => {
    setCustomInput(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      onChange?.(val);
    }
  };

  const handleAutoSuggest = () => {
    const suggested = suggestCategoryColor(categoryName);
    handleSelect(suggested);
  };

  const preview = React.useMemo(() => getAccessibleBadgeStyle(activeColor), [activeColor]);

  const sizeClasses = {
    sm: 'h-6 w-6 rounded-md',
    md: 'h-8 w-8 rounded-lg',
    lg: 'h-10 w-10 rounded-xl',
  }[size] || 'h-8 w-8 rounded-lg';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'relative shrink-0 transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
            'border border-black/[0.12] dark:border-white/[0.16] shadow-inner cursor-pointer group',
            sizeClasses,
            className
          )}
          style={{ backgroundColor: activeColor }}
          title={`Category color: ${activeColor} (click to change)`}
          aria-label="Change category color"
        >
          <span className="sr-only">Change color</span>
          {/* Subtle sheen highlight */}
          <span className="absolute inset-0 rounded-[inherit] bg-gradient-to-b from-white/25 to-transparent pointer-events-none" />
          <span className="absolute inset-0 rounded-[inherit] opacity-0 group-hover:opacity-100 ring-2 ring-black/20 dark:ring-white/30 transition-opacity" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-80 p-3.5 space-y-3 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl border border-black/[0.08] dark:border-white/[0.1] rounded-2xl shadow-2xl"
      >
        {/* Header with Auto-Suggest */}
        <div className="flex items-center justify-between gap-2 border-b border-black/[0.06] dark:border-white/[0.06] pb-2.5">
          <div>
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Category Color</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">Theme-balanced for Dark & Light mode</p>
          </div>
          <button
            type="button"
            onClick={handleAutoSuggest}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-brand-600 dark:text-brand-400 bg-brand-50/80 dark:bg-brand-950/40 hover:bg-brand-100 dark:hover:bg-brand-900/40 rounded-lg transition-colors border border-brand-200/50 dark:border-brand-800/50"
            title="Auto-pick best color for this category"
          >
            <Sparkles size={11} />
            <span>Auto-pick</span>
          </button>
        </div>

        {/* Curated Swatches Grid */}
        <div>
          <span className="text-[10px] uppercase font-semibold text-slate-400 dark:text-slate-500 tracking-wider block mb-2">
            Curated Palette
          </span>
          <div className="grid grid-cols-6 gap-2">
            {CURATED_CATEGORY_COLORS.map((item) => {
              const isSelected = activeColor === item.hex.toLowerCase();
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.hex)}
                  className={cn(
                    'h-7 w-7 rounded-lg transition-all flex items-center justify-center relative group',
                    'border border-black/[0.1] dark:border-white/[0.12] hover:scale-110 focus:outline-none',
                    isSelected && 'ring-2 ring-brand-500 dark:ring-brand-400 ring-offset-2 dark:ring-offset-slate-900'
                  )}
                  style={{ backgroundColor: item.hex }}
                  title={`${item.name} (${item.hex})`}
                >
                  <span className="absolute inset-0 rounded-[inherit] bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
                  {isSelected && (
                    <Check size={13} className="text-white drop-shadow-md stroke-[3]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Contrast Previews */}
        <div className="bg-black/[0.02] dark:bg-white/[0.03] p-2.5 rounded-xl border border-black/[0.04] dark:border-white/[0.05] space-y-1.5">
          <span className="text-[10px] uppercase font-semibold text-slate-400 dark:text-slate-500 tracking-wider block">
            Contrast Preview
          </span>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* Light Mode Preview */}
            <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-sm flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: activeColor }} />
              <span
                className="font-medium text-xs truncate"
                style={{ color: preview.style['--cat-text-light'] }}
              >
                Light mode
              </span>
            </div>
            {/* Dark Mode Preview */}
            <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 shadow-sm flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: activeColor }} />
              <span
                className="font-medium text-xs truncate"
                style={{ color: preview.style['--cat-text-dark'] }}
              >
                Dark mode
              </span>
            </div>
          </div>
        </div>

        {/* Custom Hex & System Dropper */}
        <div className="flex items-center gap-2 pt-1 border-t border-black/[0.04] dark:border-white/[0.05]">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono">#</span>
            <input
              type="text"
              maxLength={7}
              value={customInput.startsWith('#') ? customInput.slice(1) : customInput}
              onChange={(e) => handleCustomChange(`#${e.target.value.replace(/[^0-9a-fA-F]/g, '')}`)}
              placeholder="Hex code"
              className="w-full pl-6 pr-2.5 py-1 text-xs font-mono rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.04] text-slate-900 dark:text-slate-100 uppercase focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Hidden native input for dropper / fine picking */}
          <input
            ref={nativePickerRef}
            type="color"
            value={activeColor}
            onChange={(e) => handleSelect(e.target.value)}
            className="sr-only"
          />

          <button
            type="button"
            onClick={() => nativePickerRef.current?.click()}
            className="p-1.5 rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.04] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] text-slate-600 dark:text-slate-300 transition-colors"
            title="Custom color wheel"
          >
            <Pipette size={14} />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
