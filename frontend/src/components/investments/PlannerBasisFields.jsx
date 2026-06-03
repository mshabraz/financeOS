import clsx from 'clsx';
import { fmtEur, fmtQty } from '../../utils/investmentFormat';
import { BASIS_OPTIONS } from '../../utils/compoundPlannerEngine';
import NumericField from './plannerNumericField';

export { NumericField };

const BROKER_LABELS = {
  lightyear: 'Lightyear',
  swedbank_fund: 'Swedbank Funds',
};

export default function PlannerBasisFields({
  form,
  set,
  baseline,
  isLoading,
  tickerPick,
  setTickerPick,
  showPrincipal = true,
}) {
  const basis = form.basis;

  return (
    <div className="space-y-3">
      <label className="block text-xs text-gray-500 dark:text-gray-400">Starting amount from</label>
      <select
        className="input w-full text-sm"
        value={basis}
        onChange={(e) => set('basis', e.target.value)}
      >
        {BASIS_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>

      {basis === 'broker' && (
        <div className="space-y-1">
          <label className="block text-xs text-gray-500">Broker account</label>
          <select
            className="input w-full text-sm"
            value={form.plannerBroker || ''}
            onChange={(e) => set('plannerBroker', e.target.value)}
          >
            <option value="">Select broker…</option>
            {(baseline?.brokers || []).map((b) => (
              <option key={b} value={b}>{BROKER_LABELS[b] || b}</option>
            ))}
          </select>
          {!form.plannerBroker && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400">Choose a broker to load its portfolio value.</p>
          )}
        </div>
      )}

      {basis === 'tickers' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">Open holdings (current market value)</p>
          {isLoading ? (
            <p className="text-xs text-gray-400">Loading holdings…</p>
          ) : !baseline?.openHoldings?.length ? (
            <p className="text-xs text-gray-400">No open positions with a value in your portfolio.</p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-2 dark:border-gray-700">
              {baseline.openHoldings.map((h) => {
                const on = tickerPick.includes(h.key);
                return (
                  <label
                    key={h.key}
                    className={clsx(
                      'flex items-start gap-2 text-xs p-2 rounded-lg cursor-pointer',
                      on ? 'bg-brand-50 dark:bg-brand-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={on}
                      onChange={() =>
                        setTickerPick((p) => (on ? p.filter((x) => x !== h.key) : [...p, h.key]))
                      }
                    />
                    <span className="flex-1 min-w-0">
                      <span className="font-mono font-semibold text-brand-600">{h.ticker}</span>
                      <span className="text-gray-400 ml-1">· {BROKER_LABELS[h.broker] || h.broker}</span>
                      <span className="block text-gray-600 dark:text-gray-300 tabular-nums font-medium">
                        {fmtEur(h.marketValueEur)}
                        {h.quantity != null && (
                          <span className="text-gray-400 font-normal ml-1">· {fmtQty(h.quantity)} units</span>
                        )}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          {tickerPick.length > 0 && baseline?.openHoldings && (
            <p className="text-[10px] text-gray-500 tabular-nums">
              Selected: {fmtEur(
                baseline.openHoldings
                  .filter((h) => tickerPick.includes(h.key))
                  .reduce((s, h) => s + h.marketValueEur, 0)
              )}
            </p>
          )}
        </div>
      )}

      {isLoading && basis !== 'manual' && <p className="text-xs text-gray-400">Loading live data…</p>}
      {baseline && basis !== 'manual' && (
        <p className="text-[10px] text-gray-400 leading-relaxed">
          Portfolio {fmtEur(baseline.portfolioTotal)}
          {baseline.totalAssets != null && <> · Total assets {fmtEur(baseline.totalAssets)}</>}
          {baseline.avgMonthlyContribution > 0 && (
            <> · Avg net savings {fmtEur(baseline.avgMonthlyContribution)}/mo</>
          )}
        </p>
      )}

      {showPrincipal && (
        <NumericField
          label="Starting capital (€)"
          value={form.principal}
          onChange={(v) => set('principal', v)}
          min={0}
          step={100}
        />
      )}
    </div>
  );
}
