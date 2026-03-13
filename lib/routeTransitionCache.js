// Keep transition snapshots warm for long idle periods between dashboard/page hops.
const MAX_SNAPSHOT_AGE_MS = 60 * 60 * 1000; // 1 hour

const dashboardSnapshots = new Map();
const pageSnapshots = new Map();

function isFresh(entry) {
  return Boolean(entry && Date.now() - entry.updatedAt <= MAX_SNAPSHOT_AGE_MS);
}

function pruneStale(map) {
  for (const [key, value] of map.entries()) {
    if (!isFresh(value)) map.delete(key);
  }
}

export function setDashboardSnapshot(usernameTag, snapshot) {
  if (!usernameTag) return;
  pruneStale(dashboardSnapshots);
  dashboardSnapshots.set(usernameTag, {
    ...snapshot,
    updatedAt: Date.now(),
  });
}

export function getDashboardSnapshot(usernameTag) {
  if (!usernameTag) return null;
  const entry = dashboardSnapshots.get(usernameTag);
  if (!isFresh(entry)) {
    dashboardSnapshots.delete(usernameTag);
    return null;
  }
  return entry;
}

export function setPageSnapshot(usernameTag, pageSlug, snapshot) {
  if (!usernameTag || !pageSlug) return;
  pruneStale(pageSnapshots);
  const key = `${usernameTag}/${pageSlug}`;
  pageSnapshots.set(key, {
    ...snapshot,
    updatedAt: Date.now(),
  });
}

export function getPageSnapshot(usernameTag, pageSlug) {
  if (!usernameTag || !pageSlug) return null;
  const key = `${usernameTag}/${pageSlug}`;
  const entry = pageSnapshots.get(key);
  if (!isFresh(entry)) {
    pageSnapshots.delete(key);
    return null;
  }
  return entry;
}
