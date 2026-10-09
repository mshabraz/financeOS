import { useSearchParams } from 'react-router-dom';
import { useCallback, useMemo } from 'react';

/**
 * Custom hook to synchronize component state with URL search parameters.
 * Survives page reloads, supports browser back/forward buttons, and strips default values.
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
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const nextVal = typeof updater === 'function' ? updater(value) : updater;

          const isDefault =
            nextVal === defaultValue ||
            nextVal === '' ||
            nextVal === null ||
            nextVal === undefined ||
            (Array.isArray(nextVal) && nextVal.length === 0);

          if (isDefault) {
            next.delete(key);
          } else {
            next.set(key, serialize(nextVal));
          }
          return next;
        },
        { replace: shouldReplace }
      );
    },
    [key, defaultValue, value, serialize, setSearchParams, defaultReplace]
  );

  return [value, setValue];
}
