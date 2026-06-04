import { useState } from 'react';
import { Wifi, Server } from 'lucide-react';
import FinanceLogo from '../components/ui/FinanceLogo';
import { useAuth } from '../context/AuthContext';
import { getNetworkInfo } from '../api/client';
import { useQuery } from '@tanstack/react-query';

export default function Login() {
  const { needsRegister, login, register, status } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const showRegister = needsRegister || mode === 'register';

  const network = useQuery({
    queryKey: ['networkInfo'],
    queryFn: getNetworkInfo,
    staleTime: 60_000,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm && (showRegister || mode === 'register')) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!email.trim().includes('@')) {
      setError('Enter a valid email address');
      return;
    }
    setBusy(true);
    try {
      if (showRegister || mode === 'register') {
        await register(email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] bg-gray-100 dark:bg-gray-950">
      <div className="w-full max-w-md card p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col items-center text-center gap-3 mb-6">
          <FinanceLogo variant="full" size={44} />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {needsRegister
              ? 'Create the first account (admin)'
              : showRegister
                ? 'Create your account'
                : 'Sign in to continue'}
          </p>
        </div>

        {status?.connectionFailed && (
          <p className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 mb-4">
            Cannot reach the server. Check that FinanceOS is running, then refresh this page.
          </p>
        )}

        {needsRegister && !status?.connectionFailed && (
          <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 mb-4">
            The first account becomes admin and owns any existing data migrated from a single-user install.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" style={status?.connectionFailed ? { pointerEvents: 'none', opacity: 0.6 } : undefined}>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input w-full mt-1"
              autoComplete="email"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input w-full mt-1"
              autoComplete={showRegister ? 'new-password' : 'current-password'}
            />
          </div>
          {(showRegister || mode === 'register') && (
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
            {busy ? 'Please wait…' : showRegister || mode === 'register' ? 'Register & continue' : 'Sign in'}
          </button>
        </form>

        {!needsRegister && (
          <p className="text-center text-xs text-gray-500 mt-4">
            {mode === 'login' ? (
              <>
                New here?{' '}
                <button type="button" className="text-brand-600 hover:underline" onClick={() => setMode('register')}>
                  Register
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button type="button" className="text-brand-600 hover:underline" onClick={() => setMode('login')}>
                  Sign in
                </button>
              </>
            )}
          </p>
        )}

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
