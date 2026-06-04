import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, Lock, Percent } from 'lucide-react';
import clsx from 'clsx';
import PageHeader from '../components/ui/PageHeader';
import {
  getRevolutSplitSetting,
  updateRevolutSplitSetting,
  changePassword,
} from '../api/client';

export default function Settings() {
  const qc = useQueryClient();
  const [toast, setToast] = useState(null);
  const [splitPct, setSplitPct] = useState(50);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  const revolutSplitQ = useQuery({
    queryKey: ['revolutSplit'],
    queryFn: getRevolutSplitSetting,
  });

  useEffect(() => {
    if (revolutSplitQ.data?.ratio != null) {
      setSplitPct(Math.round(revolutSplitQ.data.ratio * 100));
    }
  }, [revolutSplitQ.data?.ratio]);

  const showToast = (msg, kind = 'info') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 5000);
  };

  const saveRevolutSplit = useMutation({
    mutationFn: () => updateRevolutSplitSetting(splitPct / 100),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['revolutSplit'] });
      ['transactions', 'summary', 'trend', 'bycat', 'assets'].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] })
      );
      showToast(`Revolut split saved (${r.rowsUpdated ?? 0} rows recalculated)`, 'success');
    },
    onError: (e) => showToast(e.message, 'error'),
  });

  const changePwMut = useMutation({
    mutationFn: () => changePassword(currentPw, newPw),
    onSuccess: () => {
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      showToast('Password updated', 'success');
    },
    onError: (e) => showToast(e.message, 'error'),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="App preferences. Import CSV files from Transactions or Investments."
      />

      {toast && (
        <div
          className={clsx(
            'card px-4 py-3 text-sm',
            toast.kind === 'error' && 'border-red-300 dark:border-red-800 text-red-700 dark:text-red-300',
            toast.kind === 'success' && 'border-green-300 dark:border-green-800 text-green-700 dark:text-green-300'
          )}
        >
          {toast.msg}
        </div>
      )}

      <section className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Info size={18} className="text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Supported import formats</h2>
        </div>
        <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1.5 list-disc list-inside">
          <li>Bank transaction CSV (LHV) — Transactions → Import / Export</li>
          <li>Revolut account CSV — Transactions → Import / Export</li>
          <li>Investment exports (Lightyear, Swedbank funds) — Investments → Import CSV</li>
        </ul>
      </section>

      <section className="card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Percent size={20} className="text-purple-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Revolut household split</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Share of joint Revolut expenses counted toward your analytics (default 50%). Saving recalculates all Revolut rows.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="text-xs text-gray-500">Your share (%)</span>
                <input
                  type="number"
                  min={5}
                  max={100}
                  className="input w-24 mt-1 block"
                  value={splitPct}
                  onChange={(e) => setSplitPct(Number(e.target.value))}
                />
              </label>
              <button
                type="button"
                className="btn-primary text-sm"
                disabled={saveRevolutSplit.isPending}
                onClick={() => saveRevolutSplit.mutate()}
              >
                {saveRevolutSplit.isPending ? 'Saving…' : 'Save & recalculate'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Lock size={20} className="text-brand-600 shrink-0 mt-0.5" />
          <div className="flex-1 max-w-md space-y-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">LAN password</h2>
            <input type="password" className="input w-full" placeholder="Current password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} autoComplete="current-password" />
            <input type="password" className="input w-full" placeholder="New password (min 8 chars)" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
            <input type="password" className="input w-full" placeholder="Confirm new password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" />
            <button
              type="button"
              className="btn-secondary text-sm"
              disabled={changePwMut.isPending || !currentPw || newPw.length < 8 || newPw !== confirmPw}
              onClick={() => changePwMut.mutate()}
            >
              Change password
            </button>
          </div>
        </div>
      </section>

      <section className="card p-4 text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <p className="flex items-center gap-2 font-medium text-gray-600 dark:text-gray-300">
          <Info size={14} /> Security note
        </p>
        <p>
          If market data fails with certificate errors on your LAN, you may set <code>YAHOO_TLS_RELAXED=true</code> on the
          backend — this disables TLS verification for Yahoo fetches and should only be used on trusted networks.
        </p>
      </section>
    </div>
  );
}
