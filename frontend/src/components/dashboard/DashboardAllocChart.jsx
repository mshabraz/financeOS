import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { fmtEur, fmtPct } from '../../utils/displayFormat';
import { resolveAllocationLabel } from '../../utils/securityDisplay';
import { CHART_COLORS } from '../investments/constants';

function labelText(row) {
  const pct = row.pct ?? row.portfolioPct;
  const eur = row.valueEur ?? row.value;
  if (pct != null && eur != null) return `${fmtPct(pct, { decimals: 1 })} · ${fmtEur(eur)}`;
  if (pct != null) return fmtPct(pct, { decimals: 1 });
  if (eur != null) return fmtEur(eur);
  return '';
}

export default function DashboardAllocChart({ data, dataKey = 'valueEur' }) {
  if (!data?.length) return null;

  const rows = data
    .filter((d) => (d[dataKey] ?? d.pct ?? 0) > 0)
    .map((d) => ({
      ...d,
      label: resolveAllocationLabel(d),
      valueEur: d.valueEur ?? d.value ?? 0,
      pct: d.pct ?? d.portfolioPct ?? 0,
    }));

  const chartHeight = Math.max(120, rows.length * 32);

  return (
    <div className="w-full min-w-0" style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ left: 4, right: 108, top: 4, bottom: 4 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={72}
            tick={{ fontSize: 9 }}
            tickFormatter={(v) => (v.length > 12 ? `${v.slice(0, 11)}…` : v)}
          />
          <Tooltip
            formatter={(v, _n, p) => [
              `${fmtEur(p.payload.valueEur)} (${fmtPct(p.payload.pct, { decimals: 1 })})`,
              p.payload.label,
            ]}
          />
          <Bar dataKey={dataKey} radius={[0, 4, 4, 0]} minPointSize={4}>
            {rows.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
            <LabelList
              dataKey={dataKey}
              position="right"
              formatter={(_v, _n, index) => labelText(rows[index] ?? {})}
              className="fill-gray-600 dark:fill-gray-300"
              style={{ fontSize: 9, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
