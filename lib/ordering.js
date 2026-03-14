export function clampOrderIndex(value, maxCount) {
  const safeMax = Math.max(1, Number(maxCount) || 1);
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 1;
  }

  return Math.min(safeMax, Math.max(1, Math.trunc(numericValue)));
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
