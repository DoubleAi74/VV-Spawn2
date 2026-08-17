export function clampOrderIndex(value, maxCount) {
  const safeMax = Math.max(1, Number(maxCount) || 1);
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 1;
  }

  return Math.min(safeMax, Math.max(1, Math.trunc(numericValue)));
}

/**
 * Rewrite order_index on every item to match its array position (1-based).
 * Array position is the single source of truth for ordering; order_index is
 * a projection of it. Keeping the two in step is what stops duplicate
 * indices accumulating.
 */
export function normalizeOrderIndexes(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => ({ ...item, order_index: index + 1 }));
}

/**
 * Swap two items by id and renumber the whole list.
 * Returns the original list unchanged if either id is missing.
 */
export function swapItemsByIds(items, idA, idB) {
  if (!Array.isArray(items)) return items;

  const a = items.findIndex((item) => item?._id === idA);
  const b = items.findIndex((item) => item?._id === idB);
  if (a === -1 || b === -1 || a === b) return items;

  const next = [...items];
  [next[a], next[b]] = [next[b], next[a]];
  return normalizeOrderIndexes(next);
}

export function reorderItemsByIndex(items, targetId, nextOrderIndex, patch = {}) {
  if (!Array.isArray(items) || items.length === 0) return items;

  const orderedItems = [...items].sort(
    (a, b) => (a.order_index || 0) - (b.order_index || 0)
  );
  const targetItem = orderedItems.find((item) => item._id === targetId);

  if (!targetItem) return orderedItems;

  const clampedOrderIndex = clampOrderIndex(nextOrderIndex, orderedItems.length);
  const withoutTarget = orderedItems.filter((item) => item._id !== targetId);
  withoutTarget.splice(clampedOrderIndex - 1, 0, {
    ...targetItem,
    ...patch,
    order_index: clampedOrderIndex,
  });

  return withoutTarget.map((item, index) => ({
    ...item,
    order_index: index + 1,
  }));
}
