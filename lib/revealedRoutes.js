/**
 * Which routes have already lifted their loading cover.
 *
 * The skeleton and the live view sit on opposite sides of a Suspense
 * boundary, so React unmounts one and mounts the other. Readiness is
 * component state, so the cover re-arms on the way through and hides a
 * dashboard that is already on screen and already correct — a two-frame
 * blink of flat background. A route that has revealed once stays revealed.
 *
 * sessionStorage-backed because the snapshot that lets the skeleton paint a
 * complete dashboard is too. An in-memory map would forget after a reload,
 * which is the case where the skeleton is most convincing and the blink was
 * most obvious.
 */

// Matches routeTransitionCache: a cover is only worth skipping while the
// snapshot that justified it is still around to paint.
const MAX_AGE_MS = 60 * 60 * 1000;

export const REVEALED_STORAGE_KEY = 'volvox:revealedRoutes';

const revealed = new Map();
let hydrated = false;

/** Invalid JSON / non-objects → null. Same stance as parseSnapshotStore. */
export function parseRevealedStore(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isFresh(timestamp) {
  return Number.isFinite(timestamp) && Date.now() - timestamp <= MAX_AGE_MS;
}

function ensureHydrated() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  const parsed = (() => {
    try {
      return parseRevealedStore(window.sessionStorage.getItem(REVEALED_STORAGE_KEY));
    } catch {
      // Private mode / disabled storage. The in-memory map still works.
      return null;
    }
  })();
  if (!parsed) return;
  for (const [key, timestamp] of Object.entries(parsed)) {
    if (isFresh(Number(timestamp))) revealed.set(key, Number(timestamp));
  }
}

function persist() {
  if (typeof window === 'undefined') return;
  try {
    const payload = {};
    for (const [key, timestamp] of revealed.entries()) {
      if (isFresh(timestamp)) payload[key] = timestamp;
    }
    window.sessionStorage.setItem(REVEALED_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota / private mode — this load still remembers in memory.
  }
}

/** False on the server, so it can never differ from the hydration render. */
export function hasRevealed(key) {
  if (!key || typeof window === 'undefined') return false;
  ensureHydrated();
  const timestamp = revealed.get(key);
  if (!isFresh(timestamp)) {
    revealed.delete(key);
    return false;
  }
  return true;
}

export function markRevealed(key) {
  if (!key || typeof window === 'undefined') return;
  ensureHydrated();
  for (const [existing, timestamp] of revealed.entries()) {
    if (!isFresh(timestamp)) revealed.delete(existing);
  }
  revealed.set(key, Date.now());
  persist();
}
