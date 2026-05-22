import { useState } from 'react';
import { Lock, Wifi, Server } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getNetworkInfo } from '../api/client';
import { useQuery } from '@tanstack/react-query';

export default function Login() {
  const { needsSetup, login, setup } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);

  const network = useQuery({
    queryKey: ['networkInfo'],
    queryFn: getNetworkInfo,
    staleTime: 60_000,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (needsSetup && password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setBusy(true);
    try {
      if (needsSetup) await setup(password);
      else await login(password);
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] bg-gray-100 dark:bg-gray-950">
      <div className="w-full max-w-md card p-6 sm:p-8 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-xl bg-brand-600 text-white">
            <Lock size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">FinanceOS</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {needsSetup ? 'Create your LAN password' : 'Sign in to continue'}
            </p>
          </div>
        </div>

        {needsSetup && (
          <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 mb-4">
            This password protects access from other devices on your network. There is no cloud reset.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input w-full mt-1"
              autoComplete={needsSetup ? 'new-password' : 'current-password'}
              autoFocus
            />
          </div>
          {needsSetup && (
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="input w-full mt-1"
                autoComplete="new-password"
              />
            </div>
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? 'Please wait…' : needsSetup ? 'Set password & continue' : 'Sign in'}
          </button>
        </form>

        {network.data?.urls?.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-2">
              <Wifi size={14} /> LAN access URLs
            </div>
            <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-400 max-h-32 overflow-y-auto">
              {network.data.urls.slice(0, 6).map((u) => (
                <li key={u.url} className="flex items-start gap-2">
                  <Server size={12} className="mt-0.5 flex-shrink-0" />
                  <span>
                    <span className="text-gray-400">{u.label}: </span>
                    <a href={u.url} className="text-brand-600 dark:text-brand-400 break-all">{u.url}</a>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}