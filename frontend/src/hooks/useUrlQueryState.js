import { useSearchParams } from 'react-router-dom';
import { useCallback, useMemo } from 'react';

// Pending URLSearchParams shared across synchronous setter calls in the same event tick/task
let pendingParams = null;
let pendingReplace = true;
let microtaskScheduled = false;

function getActiveSearchParams(fallback) {
  if (pendingParams) return pendingParams;
  if (typeof window !== 'undefined' && window.location && typeof window.location.search === 'string') {
    return new URLSearchParams(window.location.search);
  }
  return new URLSearchParams(fallback);
}

/**
 * Custom hook to synchronize component state with URL search parameters.
 * Survives page reloads, supports browser back/forward buttons, strips default values,
 * and batches synchronous updates cleanly without race conditions.
 *
 * @template T
 * @param {string} key - Query parameter name
 * @param {T} defaultValue - Fallback value when parameter is missing
 * @param {object} [options]
 * @param {(val: T) => string} [options.serialize=String]
 * @param {(raw: string) => T} [options.deserialize]
 * @param {boolean} [options.replace=true] - If true, replaces browser history; if false, pushes new entry
 * @returns {[T, (updater: T | ((prev: T) => T), opts?: { replace?: boolean }) => void]}
 */
export function useUrlQueryState(key, defaultValue, options = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { serialize = String, deserialize, replace: defaultReplace = true } = options;

  const value = useMemo(() => {
    const raw = searchParams.get(key);
    if (raw === null || raw === undefined) return defaultValue;
    if (deserialize) return deserialize(raw);

    // Default inferring if no deserialize provided
    if (typeof defaultValue === 'number') {
      const n = Number(raw);
      return Number.isFinite(n) ? n : defaultValue;
    }
    if (typeof defaultValue === 'boolean') {
      return raw === '1' || raw === 'true';
    }
    return raw;
  }, [searchParams, key, defaultValue, deserialize]);

  const setValue = useCallback(
    (updater, callOpts = {}) => {
      const shouldReplace = callOpts.replace ?? defaultReplace;
      const current = getActiveSearchParams(searchParams);

      const nextVal = typeof updater === 'function' ? updater(value) : updater;

      const isDefault =
        nextVal === defaultValue ||
        nextVal === '' ||
        nextVal === null ||
        nextVal === undefined ||
        (Array.isArray(nextVal) && nextVal.length === 0);

      if (isDefault) {
        current.delete(key);
      } else {
        current.set(key, serialize(nextVal));
      }

      pendingParams = current;
      if (!shouldReplace) {
        pendingReplace = false;
      }

      if (!microtaskScheduled) {
        microtaskScheduled = true;
        const scheduleFn =
          typeof queueMicrotask === 'function'
            ? queueMicrotask
            : (cb) => Promise.resolve().then(cb);

        scheduleFn(() => {
          const toApply = pendingParams;
          const replace = pendingReplace;
          pendingParams = null;
          pendingReplace = true;
          microtaskScheduled = false;
          if (toApply) {
            setSearchParams(toApply, { replace });
          }
        });
      }
    },
    [key, defaultValue, value, serialize, setSearchParams, defaultReplace, searchParams]
  );

  return [value, setValue];
}

/**
 * Hook to atomically update multiple URL query parameters at once without race conditions.
 */
export function useUrlQueryBatch() {
  const [searchParams, setSearchParams] = useSearchParams();
  return useCallback(
    (updates, opts = { replace: false }) => {
      const current = getActiveSearchParams(searchParams);
      Object.entries(updates).forEach(([k, v]) => {
        const isDefault =
          v === '' ||
          v === null ||
          v === undefined ||
          (k === 'p' && (v === 1 || v === '1')) ||
          (k === 'notes' && !v);

        if (isDefault) {
          current.delete(k);
        } else {
          current.set(k, String(v));
        }
      });

      pendingParams = current;
      if (!opts.replace) {
        pendingReplace = false;
      }

      if (!microtaskScheduled) {
        microtaskScheduled = true;
        const scheduleFn =
          typeof queueMicrotask === 'function'
            ? queueMicrotask
            : (cb) => Promise.resolve().then(cb);

        scheduleFn(() => {
          const toApply = pendingParams;
          const replace = pendingReplace;
          pendingParams = null;
          pendingReplace = true;
          microtaskScheduled = false;
          if (toApply) {
            setSearchParams(toApply, { replace });
          }
        });
      }
    },
    [searchParams, setSearchParams]
  );
}
