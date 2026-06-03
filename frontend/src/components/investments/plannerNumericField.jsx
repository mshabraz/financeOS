export default function NumericField({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  unit = '',
  hint,
}) {
  const handleNum = (raw) => {
    if (raw === '' || raw == null) {
      onChange(0);
      return;
    }
    const v = Number(raw);
    if (!Number.isNaN(v)) onChange(v);
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-xs text-gray-500 dark:text-gray-400">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={value ?? 0}
          onChange={(e) => handleNum(e.target.value)}
          className="input w-full text-sm tabular-nums"
        />
        {unit && <span className="text-xs text-gray-400 shrink-0">{unit}</span>}
      </div>
      {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
    </div>
  );
}
