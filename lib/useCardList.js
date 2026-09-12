'use client';

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { createCardListStore, getCardListStore } from './cardListCache.js';
import { updateSnapshotCards } from './routeTransitionCache.js';
import { useQueue } from './useQueue.js';

export function useCardList({
  resourceKey, initialItems, readUrl, usernameTag, pageSlug = '', isOwner, onError,
}) {
  const { store, reused } = useMemo(() => {
    const options = {
      read: async () => {
        const response = await fetch(readUrl, { cache: 'no-store' });
        if (!response.ok) throw new Error('Could not refresh cards');
        return response.json();
      },
      onChange: items => updateSnapshotCards(usernameTag, pageSlug, items, isOwner),
    };
    // Never share private/full card data between server requests or view roles.
    return typeof window === 'undefined'
      ? { store: createCardListStore(initialItems), reused: false }
      : getCardListStore(`${isOwner ? 'owner' : 'visitor'}:${usernameTag}:${pageSlug}:${resourceKey}`, initialItems, options);
  // Initial route props may be an hour-old Router Cache response on return.
  // A fresh, guarded API read is what reconciles an existing list instead.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceKey, readUrl, usernameTag, pageSlug, isOwner]);
  const serverSnapshot = useMemo(() => ({ items: initialItems, pending: 0 }), [initialItems]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, () => serverSnapshot);
  const { enqueue: enqueueOperation, isSyncing } = useQueue(undefined, onError);
  const firstItems = useRef(initialItems);

  useEffect(() => {
    if (reused || firstItems.current !== initialItems) void store.refresh();
  }, [store, reused, initialItems]);

  const enqueue = useCallback(op => {
    const finish = store.beginMutation();
    enqueueOperation({
      ...op,
      onRollback: undefined,
      fn: async () => {
        try {
          await op.fn();
        } catch (error) {
          op.onRollback?.();
          throw error;
        } finally {
          void finish();
        }
      },
    });
  }, [store, enqueueOperation]);

  return {
    items: snapshot.items,
    setItems: store.setItems,
    getItems: store.getItems,
    generationRef: store.generationRef,
    refresh: store.refresh,
    enqueue,
    isSyncing: snapshot.pending > 0 || isSyncing,
  };
}
