'use client';

import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  adjustedPostCols, maxPostColsForWidth, normalizePostCols, postGridClassFor,
  readStoredPostCols, selectedPostCols, subscribeStoredPostCols, visiblePostCols, visitorGridStorageKey, writeStoredPostCols,
} from './postGrid.js';

const getServerOverride = () => null;

export function useGridColumns({ resourceKey, isOwner, sharedCols, onSharedChange }) {
  const storageKey = visitorGridStorageKey(resourceKey);
  // Read the visitor's preference on the first navigation render, before a
  // stale default can be written back into the loading snapshot.
  const subscribe = useCallback(listener => subscribeStoredPostCols(storageKey, listener), [storageKey]);
  const readOverride = useCallback(() => isOwner ? null : readStoredPostCols(storageKey), [isOwner, storageKey]);
  const override = useSyncExternalStore(subscribe, readOverride, getServerOverride);
  // CSS supplies the right columns before hydration; this width drives buttons.
  const [width, setWidth] = useState(1024);
  const preferredCols = selectedPostCols(sharedCols, override, isOwner);
  const currentCols = useRef(preferredCols);
  currentCols.current = preferredCols;

  useLayoutEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const change = next => {
    currentCols.current = isOwner ? next : next ?? normalizePostCols(sharedCols);
    if (isOwner) onSharedChange(next);
    else {
      writeStoredPostCols(next, storageKey);
    }
  };

  return {
    preferredCols,
    postCols: visiblePostCols(preferredCols, width),
    maxCols: maxPostColsForWidth(width),
    gridClass: postGridClassFor(preferredCols),
    adjust: delta => change(adjustedPostCols(currentCols.current, delta, window.innerWidth)),
  };
}
