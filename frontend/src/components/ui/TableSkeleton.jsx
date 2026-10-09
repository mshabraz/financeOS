export default function TableSkeleton({ rows = 6, className = '' }) {
  return (
    <div className={`w-full overflow-hidden animate-pulse ${className}`}>
      <div className="space-y-3 p-4">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div
            key={rIdx}
            className="flex items-center justify-between gap-4 py-2.5 border-b border-gray-100 dark:border-gray-800/60 last:border-0"
          >
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-20 shrink-0" />
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded flex-1 max-w-sm" />
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-24 shrink-0 hidden sm:block" />
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-16 shrink-0 hidden md:block" />
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-20 shrink-0 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
