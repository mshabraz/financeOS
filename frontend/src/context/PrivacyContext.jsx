import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { setPrivacyEnabled } from '../utils/privacyMask';

const STORAGE_KEY = 'financeos.privacyMode';

const PrivacyContext = createContext(null);

export function PrivacyProvider({ children }) {
  const [privacyMode, setPrivacyMode] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    setPrivacyEnabled(privacyMode);
    try {
      localStorage.setItem(STORAGE_KEY, privacyMode ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [privacyMode]);

  const togglePrivacy = useCallback(() => setPrivacyMode((v) => !v), []);

  return (
    <PrivacyContext.Provider value={{ privacyMode, togglePrivacy }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  const ctx = useContext(PrivacyContext);
  if (!ctx) throw new Error('usePrivacy must be used within PrivacyProvider');
  return ctx;
}
