import { buildMonthOptions } from '../../utils/dateFilters';

const OPTIONS = buildMonthOptions(36);

export default function MonthFilterSelect({ value, onChange, className = 'input w-full sm:w-44' }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className} aria-label="Filter by month">
      <option value="">All months</option>
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
