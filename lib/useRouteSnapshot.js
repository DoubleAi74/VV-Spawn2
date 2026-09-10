'use client';

import { useSyncExternalStore } from 'react';
import {
  getDashboardSnapshot, getPageSnapshot, subscribeRouteSnapshots,
} from './routeTransitionCache.js';

// Browser-only previews must not be baked into the server/hydration render.
const getServerSnapshot = () => null;

export function useDashboardSnapshot(usernameTag) {
  return useSyncExternalStore(
    subscribeRouteSnapshots,
    () => getDashboardSnapshot(usernameTag),
    getServerSnapshot,
  );
}

export function usePageSnapshot(usernameTag, pageSlug) {
  return useSyncExternalStore(
    subscribeRouteSnapshots,
    () => getPageSnapshot(usernameTag, pageSlug),
    getServerSnapshot,
  );
}
