import { clampOrderIndex } from './ordering.js';

/**
 * Include `order_index` on an edit payload only when the owner changed it.
 * An omitted field is a no-op in `updatePage` / `updatePost`.
 */
export function submittedOrderIndex(nextValue, originalValue, itemCount) {
  if (nextValue === '' || nextValue == null) return undefined;
  const original = clampOrderIndex(originalValue || 1, itemCount || 1);
  const next = clampOrderIndex(nextValue, itemCount || 1);
  return next === original ? undefined : next;
}
