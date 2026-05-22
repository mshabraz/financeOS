import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getAuthStatus, login as apiLogin, setupPassword as apiSetup, logout as apiLogout } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const s = await getAuthStatus();
      setStatus(s);
    } catch {
      setStatus({ authEnabled: false, configured: false, authenticated: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener('financeos:auth-required', handler);
    return () => window.removeEventListener('financeos:auth-required', handler);
  }, [refresh]);

  const login = async (password) => {
    await apiLogin(password);
    await refresh();
  };

  const setup = async (password) => {
    await apiSetup(password);
    await refresh();
  };

  const logout = async () => {
    await apiLogout();
    await refresh();
  };

  const needsSetup = status?.authEnabled && !status?.configured;
  const needsLogin = status?.authEnabled && status?.configured && !status?.authenticated;
  const needsAuth  = needsSetup || needsLogin;

  return (
    <AuthContext.Provider
      value={{
        status,
        loading,
        needsAuth,
        needsSetup,
        needsLogin,
        login,
        setup,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
