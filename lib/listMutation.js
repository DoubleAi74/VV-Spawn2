import { normalizeOrderIndexes, reorderItemsByIndex } from './ordering.js';

export function shouldMergeServerList(refreshGeneration, currentGeneration) {
  if (refreshGeneration == null) return true;
  return refreshGeneration === currentGeneration;
}

export function patchItemById(items, id, patch) {
  if (!Array.isArray(items)) return items;
  const fields = { ...(patch || {}) };
  delete fields.order_index;
  return items.map((item) => (item?._id === id ? { ...item, ...fields } : item));
}

/** Optimistic edit: place only when the payload includes a new order_index. */
export function applyEditLocally(items, id, data) {
  if (!Array.isArray(items)) return items;
  if (data && data.order_index !== undefined) {
    return reorderItemsByIndex(items, id, data.order_index, data);
  }
  return patchItemById(items, id, data);
}

/**
 * Server ack for an edit. Re-place only if this save asked to move and nothing
 * newer has mutated the list since that local edit.
 */
export function applyEditFromServer(
  items,
  id,
  data,
  { allowReorder, editGeneration, currentGeneration } = {},
) {
  if (
    allowReorder &&
    data?.order_index !== undefined &&
    currentGeneration === editGeneration
  ) {
    return reorderItemsByIndex(items, id, data.order_index, data);
  }
  return patchItemById(items, id, data);
}

export function restoreDeletedItem(items, item) {
  const list = Array.isArray(items) ? items : [];
  if (!item) return list;
  if (list.some((entry) => entry?._id === item._id)) return list;
  return normalizeOrderIndexes([...list, item]);
}

export function rollbackItemSnapshot(items, id, snapshot) {
  const list = Array.isArray(items) ? items : [];
  if (!snapshot) return list;
  if (!list.some((entry) => entry?._id === id)) {
    return normalizeOrderIndexes([...list, snapshot]);
  }
  return list.map((entry) => (entry?._id === id ? { ...snapshot } : entry));
}
