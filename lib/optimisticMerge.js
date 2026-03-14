export function mergeServerAndOptimistic(serverItems, currentItems) {
  const safeServerItems = Array.isArray(serverItems) ? serverItems : [];
  const safeCurrentItems = Array.isArray(currentItems) ? currentItems : [];

  const optimisticItems = safeCurrentItems.filter((item) => item?._optimistic);
  const serverIds = new Set(
    safeServerItems.map((item) => String(item?._id || "")),
  );

  const merged = [...safeServerItems];

  for (const item of optimisticItems) {
    const key = String(item?._id || "");
    if (!serverIds.has(key)) {
      merged.push(item);
    }
  }

  return merged.sort(
    (a, b) => (a?.order_index || 0) - (b?.order_index || 0),
  );
}
