export default function StatCardSkeleton({ count = 4, className = '' }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-5 space-y-3">
          <div className="flex justify-between items-start">
            <div className="h-3.5 bg-gray-200 dark:bg-gray-800 rounded w-20" />
            <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-800" />
          </div>
          <div className="h-7 bg-gray-200 dark:bg-gray-800 rounded w-32" />
          <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-24" />
        </div>
      ))}
    </div>
  );
}
