/** Full card data lives only in this tab; loading snapshots remain small. */
const lists = new Map();
const MAX_IDLE_LISTS = 40;

export function createCardListStore(initialItems, { read, onChange } = {}) {
  let snapshot = { items: initialItems, pending: 0 };
  let revision = 0;
  let readId = 0;
  let locallyChanged = false;
  const listeners = new Set();
  // Shared across mounts, including acknowledgements from a departed view.
  const generationRef = { current: 0 };

  function publish(items = snapshot.items, pending = snapshot.pending) {
    snapshot = { items, pending };
    onChange?.(items);
    listeners.forEach(listener => listener());
  }

  async function refresh() {
    if (!read) return false;
    if (snapshot.pending > 0) {
      return false;
    }
    const requestedRevision = revision;
    const requestId = ++readId;
    try {
      const items = await read();
      // A read started before a save must never undo that save (or rollback).
      if (requestId !== readId || revision !== requestedRevision || snapshot.pending > 0) {
        return false;
      }
      if (!Array.isArray(items)) return false;
      publish(items);
      return true;
    } catch {
      // Keep the last usable list on a failed/offline background read.
      return false;
    }
  }

  return {
    generationRef,
    getSnapshot: () => snapshot,
    getItems: () => snapshot.items,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // Keep edited lists for the tab's lifetime: an older route may still be
    // cached even after a long trip through other pages.
    canEvict: () => !locallyChanged && listeners.size === 0 && snapshot.pending === 0,
    setItems(update) {
      locallyChanged = true;
      revision += 1;
      publish(typeof update === 'function' ? update(snapshot.items) : update);
    },
    beginMutation() {
      revision += 1;
      publish(snapshot.items, snapshot.pending + 1);
      let finished = false;
      return () => {
        if (finished) return Promise.resolve(false);
        finished = true;
        revision += 1;
        publish(snapshot.items, snapshot.pending - 1);
        // Reconcile once the entire burst has settled, even after navigation.
        return snapshot.pending === 0 ? refresh() : Promise.resolve(false);
      };
    },
    refresh,
  };
}

export function getCardListStore(key, initialItems, options) {
  const existing = lists.get(key);
  if (existing) {
    lists.delete(key);
    lists.set(key, existing);
    return { store: existing, reused: true };
  }
  for (const [oldKey, store] of lists) {
    if (lists.size < MAX_IDLE_LISTS) break;
    if (store.canEvict()) lists.delete(oldKey);
  }
  const store = createCardListStore(initialItems, options);
  lists.set(key, store);
  return { store, reused: false };
}
