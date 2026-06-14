import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Globe, Info, Landmark, Lock, Percent, Users } from 'lucide-react';
import clsx from 'clsx';
import PageHeader from '../components/ui/PageHeader';
import { useAuth } from '../context/AuthContext';
import {
  getRevolutSplitSetting,
  updateRevolutSplitSetting,
  getNetWorthCurrencySetting,
  updateNetWorthCurrencySetting,
  changePassword,
  getAdminUsers,
  adminResetUserPassword,
  getOpenBankingStatus,
  getOpenBankingBanks,
  connectOpenBankingBank,
  getOpenBankingConnections,
  disconnectOpenBankingConnection,
  syncOpenBanking,
} from '../api/client';

function AdminUsersPanel({ showToast }) {
  const { user } = useAuth();
  const [resetFor, setResetFor] = useState(null);
  const [newPw, setNewPw] = useState('');

  const usersQ = useQuery({
    queryKey: ['adminUsers'],
    queryFn: getAdminUsers,
  });

  const resetMut = useMutation({
    mutationFn: ({ id, password }) => adminResetUserPassword(id, password),
    onSuccess: () => {
      setResetFor(null);
      setNewPw('');
      showToast('Password reset', 'success');
    },
    onError: (e) => showToast(e.message, 'error'),
  });

  const users = usersQ.data?.users ?? [];

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <Users size={20} className="text-brand-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">User accounts</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Admin can reset passwords for other users on this server. At least one admin account always exists.
          </p>
          <ul className="mt-4 space-y-2">
            {users.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2 text-sm"
              >
                <span className="truncate">
                  <span className="font-medium text-gray-800 dark:text-gray-200">{u.email}</span>
                  {u.role === 'admin' && (
                    <span className="ml-2 text-[10px] uppercase text-brand-600">admin</span>
                  )}
                  {u.id === user?.id && (
                    <span className="ml-2 text-[10px] text-gray-400">(you)</span>
                  )}
                </span>
                {resetFor === u.id ? (
                  <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
                    <input
                      type="password"
                      className="input text-sm flex-1 min-w-[140px]"
                      placeholder="New password (8+)"
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn-primary text-xs"
                      disabled={resetMut.isPending || newPw.length < 8}
                      onClick={() => resetMut.mutate({ id: u.id, password: newPw })}
                    >
                      Save
                    </button>
                    <button type="button" className="btn-secondary text-xs" onClick={() => { setResetFor(null); setNewPw(''); }}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary text-xs shrink-0"
                    onClick={() => setResetFor(u.id)}
                  >
                    Reset password
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function BankConnectionsPanel({ showToast }) {
  const qc = useQueryClient();
  const [selectedBank, setSelectedBank] = useState('');

  const statusQ = useQuery({
    queryKey: ['openBankingStatus'],
    queryFn: getOpenBankingStatus,
    retry: false,
  });

  const enabled = statusQ.data?.enabled === true;

  const banksQ = useQuery({
    queryKey: ['openBankingBanks'],
    queryFn: getOpenBankingBanks,
    enabled,
    retry: false,
  });

  const connectionsQ = useQuery({
    queryKey: ['openBankingConnections'],
    queryFn: getOpenBankingConnections,
    enabled,
    retry: false,
  });

  const connectMut = useMutation({
    mutationFn: () => {
      const bank = (banksQ.data?.banks || []).find((b) => `${b.name}|${b.country}` === selectedBank);
      if (!bank) throw new Error('Select a bank');
      return connectOpenBankingBank(bank.name, bank.country);
    },
    onSuccess: (data) => {
      if (data?.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    },
    onError: (e) => showToast(e.message, 'error'),
  });

  const syncMut = useMutation({
    mutationFn: ({ connectionId, fullBackfill }) =>
      syncOpenBanking(connectionId, { fullBackfill }),
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ['openBankingConnections'] });
      ['transactions', 'summary', 'trend', 'bycat', 'importSessions'].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      );
      const totals = (data?.results || []).reduce(
        (acc, r) => {
          acc.imported += r.importedCount || 0;
          acc.duplicates += r.duplicateCount || 0;
          return acc;
        },
        { imported: 0, duplicates: 0 },
      );
      const range = data?.results?.[0]?.dateFrom;
      const rangeNote = range ? ` from ${range}` : '';
      showToast(
        vars?.fullBackfill
          ? `Full sync complete${rangeNote} — ${totals.imported} new, ${totals.duplicates} duplicates`
          : `Sync complete — ${totals.imported} new, ${totals.duplicates} duplicates`,
        'success',
      );
    },
    onError: (e) => showToast(e.message, 'error'),
  });

  const disconnectMut = useMutation({
    mutationFn: (id) => disconnectOpenBankingConnection(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['openBankingConnections'] });
      showToast('Bank disconnected', 'success');
    },
    onError: (e) => showToast(e.message, 'error'),
  });

  const banks = banksQ.data?.banks ?? [];
  const connections = connectionsQ.data?.connections ?? [];

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <Landmark size={20} className="text-emerald-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Bank connections</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Connect Revolut, Swedbank, or SEB via Enable Banking to import transactions automatically.
          </p>

          {statusQ.isLoading && (
            <p className="text-sm text-gray-500 mt-3">Checking open banking configuration…</p>
          )}

          {!statusQ.isLoading && !enabled && (
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-3">
              {statusQ.data?.message ||
                'Open banking is not configured on this server. Add Enable Banking env vars to .env and restart.'}
            </p>
          )}

          {enabled && (
            <>
              {connections.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {connections.map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 dark:text-gray-200 truncate">
                          {c.account_name || c.account_iban || c.account_uid}
                        </p>
                        <p className="text-xs text-gray-500">
                          {c.aspsp_name} ({c.aspsp_country})
                          {c.account_iban ? ` · ${c.account_iban}` : ''}
                          {c.last_sync_at ? ` · last sync ${c.last_sync_at}` : ''}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          className="btn-primary text-xs"
                          disabled={syncMut.isPending}
                          onClick={() => syncMut.mutate({ connectionId: c.id })}
                        >
                          Sync now
                        </button>
                        <button
                          type="button"
                          className="btn-secondary text-xs"
                          disabled={syncMut.isPending}
                          onClick={() => syncMut.mutate({ connectionId: c.id, fullBackfill: true })}
                        >
                          Full sync (1 yr)
                        </button>
                        <button
                          type="button"
                          className="btn-secondary text-xs"
                          disabled={disconnectMut.isPending}
                          onClick={() => disconnectMut.mutate(c.id)}
                        >
                          Disconnect
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="text-sm flex-1 min-w-[200px]">
                  <span className="text-xs text-gray-500">Connect bank</span>
                  <select
                    className="input mt-1 block w-full max-w-sm"
                    value={selectedBank}
                    onChange={(e) => setSelectedBank(e.target.value)}
                    disabled={banksQ.isLoading}
                  >
                    <option value="">Select bank…</option>
                    {banks.map((b) => (
                      <option key={`${b.name}-${b.country}`} value={`${b.name}|${b.country}`}>
                        {b.name} ({b.country})
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn-primary text-sm"
                  disabled={!selectedBank || connectMut.isPending}
                  onClick={() => connectMut.mutate()}
                >
                  {connectMut.isPending ? 'Starting…' : 'Connect bank'}
                </button>
                {connections.length > 0 && (
                  <button
                    type="button"
                    className="btn-secondary text-sm"
                    disabled={syncMut.isPending}
                    onClick={() => syncMut.mutate(undefined)}
                  >
                    Sync all
                  </button>
                )}
              </div>

              {banksQ.isError && (
                <p className="text-sm text-red-600 mt-2">{banksQ.error?.message}</p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Settings() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [toast, setToast] = useState(null);
  const [splitPct, setSplitPct] = useState(50);
  const [fxEnabled, setFxEnabled] = useState(true);
  const [fxCurrency, setFxCurrency] = useState('PKR');
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

  const netWorthFxQ = useQuery({
    queryKey: ['netWorthCurrency'],
    queryFn: getNetWorthCurrencySetting,
  });

  useEffect(() => {
    if (netWorthFxQ.data) {
      setFxEnabled(netWorthFxQ.data.enabled !== false);
      if (netWorthFxQ.data.currency) setFxCurrency(netWorthFxQ.data.currency);
    }
  }, [netWorthFxQ.data]);

  const showToast = (msg, kind = 'info') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 5000);
  };

  useEffect(() => {
    const ob = searchParams.get('ob');
    if (!ob) return;
    if (ob === 'connected') {
      showToast('Bank connected successfully', 'success');
      qc.invalidateQueries({ queryKey: ['openBankingConnections'] });
    } else if (ob === 'error') {
      showToast(searchParams.get('msg') || 'Bank connection failed', 'error');
    }
    searchParams.delete('ob');
    searchParams.delete('msg');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams, qc]);

  const saveNetWorthFx = useMutation({
    mutationFn: () => updateNetWorthCurrencySetting({ enabled: fxEnabled, currency: fxCurrency }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['netWorthCurrency'] });
      qc.invalidateQueries({ queryKey: ['assets'] });
      showToast('Net worth currency settings saved', 'success');
    },
    onError: (e) => showToast(e.message, 'error'),
  });

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
          <li>Bank transaction CSV (LHV, SEB) — Transactions → Import / Export</li>
          <li>Revolut account CSV — Transactions → Import / Export</li>
          <li>Investment exports (Lightyear, Swedbank funds) — Investments → Import CSV</li>
          <li>Open banking (Revolut, Swedbank, SEB) — Settings → Bank connections</li>
        </ul>
      </section>

      <BankConnectionsPanel showToast={showToast} />

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
          <Globe size={20} className="text-blue-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Net worth currency conversion</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Show an estimated conversion under net worth on the dashboard (EUR remains the primary total).
            </p>
            <div className="mt-4 space-y-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-gray-300"
                  checked={fxEnabled}
                  onChange={(e) => setFxEnabled(e.target.checked)}
                />
                <span>Show converted amount on dashboard</span>
              </label>
              <label className="text-sm block">
                <span className="text-xs text-gray-500">Target currency</span>
                <select
                  className="input mt-1 block w-full max-w-xs"
                  value={fxCurrency}
                  disabled={!fxEnabled}
                  onChange={(e) => setFxCurrency(e.target.value)}
                >
                  {(netWorthFxQ.data?.supportedCurrencies ?? [{ code: 'PKR', label: 'Pakistani Rupee (PKR)' }]).map(
                    (c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <button
                type="button"
                className="btn-primary text-sm"
                disabled={saveNetWorthFx.isPending}
                onClick={() => saveNetWorthFx.mutate()}
              >
                {saveNetWorthFx.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {isAdmin && <AdminUsersPanel showToast={showToast} />}

      <section className="card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Lock size={20} className="text-brand-600 shrink-0 mt-0.5" />
          <div className="flex-1 max-w-md space-y-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Your password</h2>
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
