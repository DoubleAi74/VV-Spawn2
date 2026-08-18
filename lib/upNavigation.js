/**
 * The page header arrow means "up to this profile", not browser-back.
 *
 * App Router client navigations leave document.referrer empty, so the
 * dashboard writes this tab-scoped key when a card navigation starts.
 * A shared URL / refresh / other-profile key will not match, and the
 * arrow pushes instead of leaving the site.
 */
export const UP_STORAGE_KEY = 'volvox:up';

/** 'back' when this tab opened the page from this profile's dashboard. */
export function decideUpAction(storedUp, dashboardHref) {
  if (!dashboardHref) return 'push';
  return storedUp === dashboardHref ? 'back' : 'push';
}

export function writeUpTarget(dashboardHref) {
  if (typeof window === 'undefined' || !dashboardHref) return;
  try {
    window.sessionStorage.setItem(UP_STORAGE_KEY, dashboardHref);
  } catch {
    // Private mode / quota — the arrow will push, which is still correct.
  }
}

export function readUpTarget() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(UP_STORAGE_KEY);
  } catch {
    return null;
  }
}
