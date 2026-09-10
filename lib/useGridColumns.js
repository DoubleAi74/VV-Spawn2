'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import {
  adjustedPostCols, maxPostColsForWidth, normalizePostCols, postGridClassFor,
  readStoredPostCols, selectedPostCols, visiblePostCols, visitorGridStorageKey, writeStoredPostCols,
} from './postGrid.js';

export function useGridColumns({ resourceKey, isOwner, sharedCols, onSharedChange }) {
  const storageKey = visitorGridStorageKey(resourceKey);
  const [override, setOverride] = useState(null);
  // CSS supplies the right columns before hydration; this width drives buttons.
  const [width, setWidth] = useState(1024);
  const preferredCols = selectedPostCols(sharedCols, override, isOwner);
  const currentCols = useRef(preferredCols);
  currentCols.current = preferredCols;

  useLayoutEffect(() => {
    const read = () => setOverride(isOwner ? null : readStoredPostCols(storageKey));
    read();
    const onStorage = event => {
      if (event.key === storageKey || event.key === null) read();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storageKey, isOwner]);

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
      setOverride(next);
      writeStoredPostCols(next, storageKey);
    }
  };

  return {
    preferredCols,
    postCols: visiblePostCols(preferredCols, width),
    maxCols: maxPostColsForWidth(width),
    gridClass: postGridClassFor(preferredCols),
    adjust: delta => change(adjustedPostCols(currentCols.current, delta, window.innerWidth)),
    reset: () => change(null),
    canReset: isOwner ? normalizePostCols(sharedCols) != null : override != null,
    resetLabel: isOwner ? 'Use automatic layout' : "Use owner's layout",
  };
}
