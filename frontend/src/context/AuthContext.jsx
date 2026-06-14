import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getAuthStatus, login as apiLogin, register as apiRegister, logout as apiLogout } from '../api/client';
import { OPEN_BANKING_AUTO_SYNC_SESSION_KEY } from '../hooks/useOpenBankingAutoSync';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const s = await getAuthStatus();
      setStatus(s);
    } catch {
      setStatus({
        authEnabled: true,
        configured: false,
        authenticated: false,
        connectionFailed: true,
      });
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

  const login = async (email, password) => {
    await apiLogin(email, password);
    await refresh();
  };

  const register = async (email, password) => {
    await apiRegister(email, password);
    await refresh();
  };

  const logout = async () => {
    await apiLogout();
    sessionStorage.removeItem(OPEN_BANKING_AUTO_SYNC_SESSION_KEY);
    await refresh();
  };

  const needsRegister = status?.authEnabled && !status?.configured;
  const needsLogin = status?.authEnabled && status?.configured && !status?.authenticated;
  const needsAuth = needsRegister || needsLogin;
  const isAdmin = status?.user?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        status,
        loading,
        needsAuth,
        needsRegister,
        needsLogin,
        isAdmin,
        user: status?.user ?? null,
        login,
        register,
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
