import { buildMonthOptions } from '../../utils/dateFilters';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from './Select';

const OPTIONS = buildMonthOptions(36);

export default function MonthFilterSelect({ value, onChange, className = 'w-full sm:w-44' }) {
  return (
    <Select value={value || 'all'} onValueChange={(val) => onChange(val === 'all' ? '' : val)}>
      <SelectTrigger className={className} aria-label="Filter by month">
        <SelectValue placeholder="All months" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value="all">All months</SelectItem>
        {OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
