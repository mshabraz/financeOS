import { Area, AreaChart, ResponsiveContainer } from 'recharts';

export default function MiniSparkline({ data, dataKey = 'v', positive, height = 36 }) {
  const rows = (data ?? []).map((d, i) => ({
    i,
    v: typeof d === 'number' ? d : d[dataKey],
  }));
  if (rows.length < 2) return <div className="h-9 w-20 rounded bg-gray-100 dark:bg-gray-800/60" />;

  const color = positive == null ? '#6366f1' : positive ? '#10b981' : '#ef4444';

  return (
    <div style={{ height }} className="w-full max-w-[140px] shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            fill={color}
            fillOpacity={0.15}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
