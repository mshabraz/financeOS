export default function QueryErrorPanel({ title, message, onRetry, hint }) {
  return (
    <div className="card p-6 border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm">
      <p className="font-medium">{title}</p>
      <p className="mt-1 opacity-90">{message || 'Unknown error'}</p>
      {hint && <p className="mt-2 text-xs opacity-80">{hint}</p>}
      {onRetry && (
        <button type="button" className="btn-secondary text-xs mt-3" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
