export default function CategoryBadge({ icon, name, color }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: color ? `${color}20` : '#e5e7eb', color: color ?? '#6b7280' }}
    >
      <span>{icon}</span>
      <span>{name}</span>
    </span>
  );
}
