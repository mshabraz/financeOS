import { get, set, del } from 'idb-keyval';

const IDB_KEY = 'FINANCEOS_QUERY_CACHE';

/**
 * Creates an asynchronous IndexedDB persister for TanStack Query.
 * Avoids the 5 MB localStorage limit and runs non-blocking off the main thread.
 *
 * @param {string} [idbKey=IDB_KEY]
 * @returns {import('@tanstack/react-query-persist-client').Persister}
 */
export function createIDBPersister(idbKey = IDB_KEY) {
  return {
    persistClient: async (client) => {
      try {
        await set(idbKey, client);
      } catch (err) {
        console.warn('[IDBPersister] Failed to save query cache:', err);
      }
    },
    restoreClient: async () => {
      try {
        return await get(idbKey);
      } catch (err) {
        console.warn('[IDBPersister] Failed to restore query cache:', err);
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        await del(idbKey);
      } catch (err) {
        console.warn('[IDBPersister] Failed to remove query cache:', err);
      }
    },
  };
}
