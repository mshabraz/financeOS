/** Shared FinanceOS mark (sidebar, login, favicon uses /logo.png in index.html). */
export default function FinanceLogo({ size = 32, className = '' }) {
  return (
    <img
      src="/logo.png"
      alt="FinanceOS"
      width={size}
      height={size}
      className={`rounded-lg object-cover flex-shrink-0 ${className}`}
    />
  );
}
