/**
 * Shared layout rules for live views and loading snapshots. Published counts
 * live in Mongo; only a visitor's explicit override lives in localStorage.
 */
export const POST_GRID_MIN = 1;
export const POST_GRID_MAX = 8;

export const DEFAULT_POST_GRID_CLASS =
  "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";

export const POST_GRID_COL_CLASS = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-4 lg:grid-cols-5",
  6: "grid-cols-2 sm:grid-cols-4 lg:grid-cols-6",
  7: "grid-cols-2 sm:grid-cols-4 lg:grid-cols-7",
  8: "grid-cols-2 sm:grid-cols-4 lg:grid-cols-8",
};

export function normalizePostCols(value) {
  return Number.isInteger(value) && value >= POST_GRID_MIN && value <= POST_GRID_MAX
    ? value
    : null;
}

export function visitorGridStorageKey(resourceKey) {
  return resourceKey ? `volvox:visitorGridCols:${resourceKey}` : '';
}

export function readStoredPostCols(storageKey) {
  if (typeof window === "undefined" || !storageKey) return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw == null || raw === "auto") return null;
    return normalizePostCols(Number(raw));
  } catch {
    return null;
  }
}

export function maxPostColsForWidth(width) {
  return width >= 1024 ? POST_GRID_MAX : width >= 640 ? 4 : 2;
}

export function visiblePostCols(cols, width) {
  const saved = normalizePostCols(cols);
  const automatic = width >= 1024 ? 4 : width >= 640 ? 3 : 2;
  return saved == null ? automatic : Math.min(saved, maxPostColsForWidth(width));
}

export function selectedPostCols(sharedCols, override, isOwner) {
  return (!isOwner && normalizePostCols(override)) || normalizePostCols(sharedCols);
}

/** Step from what is visible, without ever writing a resize back to Mongo. */
export function adjustedPostCols(cols, delta, width) {
  return Math.max(POST_GRID_MIN, Math.min(maxPostColsForWidth(width), visiblePostCols(cols, width) + delta));
}

export function postGridClassFor(cols) {
  if (cols == null) return DEFAULT_POST_GRID_CLASS;
  return POST_GRID_COL_CLASS[cols] || DEFAULT_POST_GRID_CLASS;
}

export function writeStoredPostCols(cols, storageKey) {
  if (typeof window === 'undefined' || !storageKey) return;
  try {
    const value = normalizePostCols(cols);
    if (value == null) window.localStorage.removeItem(storageKey);
    else window.localStorage.setItem(storageKey, String(value));
  } catch {
    // ignore quota / private mode
  }
}
