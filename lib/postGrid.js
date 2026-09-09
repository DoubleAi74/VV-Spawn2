/**
 * Cards-per-row density preference shared by each view and its loading UI
 * so the grid does not jump when the flight finishes. The dashboard and the
 * page view store their own key so adjusting one never reshuffles the other.
 */
export const POST_GRID_STORAGE_KEY = "volvox:postGridCols";
export const DASH_GRID_STORAGE_KEY = "volvox:dashGridCols";
export const POST_GRID_MIN = 1;
export const POST_GRID_MAX = 8;

export const DEFAULT_POST_GRID_CLASS =
  "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";

export const POST_GRID_COL_CLASS = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
  7: "grid-cols-7",
  8: "grid-cols-8",
};

export function readStoredPostCols(storageKey = POST_GRID_STORAGE_KEY) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw == null || raw === "auto") return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < POST_GRID_MIN || n > POST_GRID_MAX) {
      return null;
    }
    return n;
  } catch {
    return null;
  }
}

/** Match the current responsive default so the first up/down click feels continuous. */
export function resolveDefaultPostCols() {
  if (typeof window === "undefined") return 4;
  if (window.matchMedia("(min-width: 1024px)").matches) return 4;
  if (window.matchMedia("(min-width: 640px)").matches) return 3;
  return 2;
}

export function postGridClassFor(cols) {
  if (cols == null) return DEFAULT_POST_GRID_CLASS;
  return POST_GRID_COL_CLASS[cols] || DEFAULT_POST_GRID_CLASS;
}

export function writeStoredPostCols(cols, storageKey = POST_GRID_STORAGE_KEY) {
  try {
    window.localStorage.setItem(storageKey, String(cols));
  } catch {
    // ignore quota / private mode
  }
}
