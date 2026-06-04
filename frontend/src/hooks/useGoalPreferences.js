import { useState, useCallback } from 'react';

const DASHBOARD_FEATURED_KEY = 'financeos.dashboardFeaturedGoalId';
const GOALS_PAGE_DEFAULT_KEY = 'financeos.goalsPageDefaultGoalId';

export function normalizeGoalId(id) {
  if (id == null || id === '') return null;
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

function readStoredGoalId(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null || raw === '') return null;
    return normalizeGoalId(raw);
  } catch {
    return null;
  }
}

function writeStoredGoalId(key, id) {
  try {
    if (id == null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(id));
  } catch {
    /* ignore */
  }
}

export function useDashboardFeaturedGoalId() {
  const [id, setId] = useState(() => readStoredGoalId(DASHBOARD_FEATURED_KEY));
  const setFeatured = useCallback((goalId) => {
    const n = normalizeGoalId(goalId);
    setId(n);
    writeStoredGoalId(DASHBOARD_FEATURED_KEY, n);
  }, []);
  return [id, setFeatured];
}

export function useGoalsPageDefaultGoalId() {
  const [id, setId] = useState(() => readStoredGoalId(GOALS_PAGE_DEFAULT_KEY));
  const setDefault = useCallback((goalId) => {
    const n = normalizeGoalId(goalId);
    setId(n);
    writeStoredGoalId(GOALS_PAGE_DEFAULT_KEY, n);
  }, []);
  return [id, setDefault];
}

/** Pick goal from list by stored id, else first item. */
export function resolveGoalFromList(goals, storedId) {
  const list = goals ?? [];
  if (!list.length) return null;
  const sid = normalizeGoalId(storedId);
  if (sid != null) {
    const found = list.find((g) => normalizeGoalId(g.id) === sid);
    if (found) return found;
  }
  return list[0];
}

/** Pick goal from active + archived lists by stored id. */
export function resolveGoalFromActiveAndArchives(active, archives, storedId) {
  const sid = normalizeGoalId(storedId);
  if (sid != null) {
    const inActive = (active ?? []).find((g) => normalizeGoalId(g.id) === sid);
    if (inActive) return inActive;
    const inArchive = (archives ?? []).find((g) => normalizeGoalId(g.id) === sid);
    if (inArchive) return inArchive;
  }
  return (active ?? [])[0] ?? (archives ?? [])[0] ?? null;
}
