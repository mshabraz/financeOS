import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { fmtPct } from '../../utils/displayFormat';
import { CHART_COLORS } from '../investments/constants';

export default function DashboardAllocChart({ data, dataKey = 'pct' }) {
  if (!data?.length) return null;

  return (
    <div className="h-36 sm:h-40 min-h-[9rem] w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" width={64} tick={{ fontSize: 9 }} />
          <Tooltip formatter={(v, _n, p) => [fmtPct(p.payload.pct ?? p.payload.portfolioPct ?? v), p.payload.label]} />
          <Bar dataKey={dataKey} radius={[0, 4, 4, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
