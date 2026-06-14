import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getOpenBankingStatus,
  getOpenBankingConnections,
  syncOpenBanking,
} from '../api/client';

export const OPEN_BANKING_AUTO_SYNC_SESSION_KEY = 'financeos:ob-auto-synced';

const DATA_QUERY_KEYS = [
  'transactions',
  'summary',
  'trend',
  'bycat',
  'importSessions',
  'openBankingConnections',
  'assets',
  'manualBalances',
];

function invalidateSyncedData(qc) {
  DATA_QUERY_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

/**
 * Incremental open-banking sync once per browser session when the user is authenticated.
 * Complements backend auto-sync on login (debounced server-side).
 */
export function useOpenBankingAutoSync(enabled) {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || started.current) return;
    if (sessionStorage.getItem(OPEN_BANKING_AUTO_SYNC_SESSION_KEY)) return;

    started.current = true;
    let cancelled = false;

    (async () => {
      try {
        const status = await getOpenBankingStatus();
        if (!status?.enabled) return;

        const { connections } = await getOpenBankingConnections();
        if (!connections?.length) return;

        setSyncing(true);
        const result = await syncOpenBanking(undefined, { auto: true });
        if (cancelled) return;

        sessionStorage.setItem(OPEN_BANKING_AUTO_SYNC_SESSION_KEY, String(Date.now()));
        if (!result?.skipped) {
          invalidateSyncedData(qc);
        }
      } catch {
        /* Manual sync remains available in Settings */
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, qc]);

  return { syncing };
}
