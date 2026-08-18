// Keep transition snapshots warm for long idle periods between dashboard/page hops.
const MAX_SNAPSHOT_AGE_MS = 60 * 60 * 1000; // 1 hour
const MAX_DASHBOARD_PAGES = 20;
const MAX_PAGE_POSTS = 30;
/** Huge thesis HTML stays in the in-memory map; sessionStorage skips it. */
export const INFO_SNAPSHOT_MAX_CHARS = 80_000;

export const DASH_SNAPSHOT_STORAGE_KEY = 'volvox:dashSnapshots';
export const PAGE_SNAPSHOT_STORAGE_KEY = 'volvox:pageSnapshots';

const dashboardSnapshots = new Map();
const pageSnapshots = new Map();
let hydrated = false;

function isFresh(entry) {
  return Boolean(entry && Date.now() - entry.updatedAt <= MAX_SNAPSHOT_AGE_MS);
}

function pruneStale(map) {
  for (const [key, value] of map.entries()) {
    if (!isFresh(value)) map.delete(key);
  }
}

/** Invalid JSON / non-objects → null. Same stance as readPersistedTheme. */
export function parseSnapshotStore(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function asText(value) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function asInfoMode(value) {
  return value === 'html' || value === 'text' ? value : '';
}

function asInfoHeight(value) {
  const height = Number(value);
  return Number.isFinite(height) && height > 0 ? Math.round(height) : 0;
}

function persistableInfo(snapshot, keys) {
  if (
    !(keys.text in snapshot) &&
    !(keys.mode in snapshot) &&
    !(keys.height in snapshot)
  ) {
    return {};
  }
  const infoText = asText(snapshot[keys.text]);
  if (infoText.length > INFO_SNAPSHOT_MAX_CHARS) return {};
  const infoMode = asInfoMode(snapshot[keys.mode]);
  const infoHeight = asInfoHeight(snapshot[keys.height]);
  return {
    [keys.text]: infoText,
    ...(infoMode ? { [keys.mode]: infoMode } : {}),
    ...(infoHeight ? { [keys.height]: infoHeight } : {}),
  };
}

/** Drop hashes, foreign emails, and post HTML. Info HTML is kept under the cap. */
export function sanitizeDashboardSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const pages = Array.isArray(snapshot.pages) ? snapshot.pages : [];
  return {
    usernameTitle: asText(snapshot.usernameTitle),
    email: asText(snapshot.email),
    isOwner: Boolean(snapshot.isOwner),
    dashHex: asText(snapshot.dashHex),
    backHex: asText(snapshot.backHex),
    ...persistableInfo(snapshot, {
      text: 'infoText1',
      mode: 'infoMode1',
      height: 'infoHeight1',
    }),
    ...persistableInfo(snapshot, {
      text: 'infoText',
      mode: 'infoMode',
      height: 'infoHeight',
    }),
    pages: pages.slice(0, MAX_DASHBOARD_PAGES).map((page) => ({
      _id: page?._id ?? '',
      title: asText(page?.title),
      thumbnail: asText(page?.thumbnail),
      blurDataURL: asText(page?.blurDataURL),
      slug: asText(page?.slug),
    })),
    updatedAt: Number(snapshot.updatedAt) || 0,
  };
}

export function sanitizePageSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const posts = Array.isArray(snapshot.posts) ? snapshot.posts : [];
  return {
    pageTitle: asText(snapshot.pageTitle),
    userEmail: asText(snapshot.userEmail),
    isOwner: Boolean(snapshot.isOwner),
    dashHex: asText(snapshot.dashHex),
    backHex: asText(snapshot.backHex),
    ...persistableInfo(snapshot, {
      text: 'infoText1',
      mode: 'infoMode1',
      height: 'infoHeight1',
    }),
    posts: posts.slice(0, MAX_PAGE_POSTS).map((post) => ({
      _id: post?._id ?? '',
      title: asText(post?.title),
      content_type: asText(post?.content_type) || 'photo',
      thumbnail: asText(post?.thumbnail),
      blurDataURL: asText(post?.blurDataURL),
    })),
    updatedAt: Number(snapshot.updatedAt) || 0,
  };
}

function loadInto(map, storageKey, sanitize) {
  if (typeof window === 'undefined') return;
  try {
    const parsed = parseSnapshotStore(window.sessionStorage.getItem(storageKey));
    if (!parsed) return;
    for (const [key, value] of Object.entries(parsed)) {
      const clean = sanitize(value);
      if (clean && isFresh(clean)) map.set(key, clean);
    }
  } catch {
    // Ignore unreadable storage.
  }
}

function persistMap(map, storageKey, sanitize) {
  if (typeof window === 'undefined') return;
  try {
    const payload = {};
    for (const [key, value] of map.entries()) {
      const clean = sanitize(value);
      if (clean && isFresh(clean)) payload[key] = clean;
    }
    window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // Quota / private mode — in-memory map still works for this load.
  }
}

function ensureHydrated() {
  if (hydrated) return;
  hydrated = true;
  loadInto(dashboardSnapshots, DASH_SNAPSHOT_STORAGE_KEY, sanitizeDashboardSnapshot);
  loadInto(pageSnapshots, PAGE_SNAPSHOT_STORAGE_KEY, sanitizePageSnapshot);
}

export function setDashboardSnapshot(usernameTag, snapshot) {
  if (!usernameTag) return;
  ensureHydrated();
  pruneStale(dashboardSnapshots);
  dashboardSnapshots.set(usernameTag, {
    ...snapshot,
    updatedAt: Date.now(),
  });
  persistMap(dashboardSnapshots, DASH_SNAPSHOT_STORAGE_KEY, sanitizeDashboardSnapshot);
}

export function getDashboardSnapshot(usernameTag) {
  if (!usernameTag) return null;
  ensureHydrated();
  const entry = dashboardSnapshots.get(usernameTag);
  if (!isFresh(entry)) {
    dashboardSnapshots.delete(usernameTag);
    return null;
  }
  return entry;
}

export function setPageSnapshot(usernameTag, pageSlug, snapshot) {
  if (!usernameTag || !pageSlug) return;
  ensureHydrated();
  pruneStale(pageSnapshots);
  const key = `${usernameTag}/${pageSlug}`;
  pageSnapshots.set(key, {
    ...snapshot,
    updatedAt: Date.now(),
  });
  persistMap(pageSnapshots, PAGE_SNAPSHOT_STORAGE_KEY, sanitizePageSnapshot);
}

export function getPageSnapshot(usernameTag, pageSlug) {
  if (!usernameTag || !pageSlug) return null;
  ensureHydrated();
  const key = `${usernameTag}/${pageSlug}`;
  const entry = pageSnapshots.get(key);
  if (!isFresh(entry)) {
    pageSnapshots.delete(key);
    return null;
  }
  return entry;
}
