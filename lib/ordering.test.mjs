import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampOrderIndex,
  normalizeOrderIndexes,
  swapItemsByIds,
  reorderItemsByIndex,
} from './ordering.js';

const listOf = (...indexes) =>
  indexes.map((order_index, i) => ({ _id: `id${i + 1}`, order_index }));

const idsOf = (items) => items.map((i) => i._id);
const indexesOf = (items) => items.map((i) => i.order_index);

test('normalizeOrderIndexes rewrites indexes to 1..n', () => {
  assert.deepEqual(indexesOf(normalizeOrderIndexes(listOf(5, 5, 5))), [1, 2, 3]);
  assert.deepEqual(indexesOf(normalizeOrderIndexes(listOf(1, 7, 99))), [1, 2, 3]);
  assert.deepEqual(normalizeOrderIndexes([]), []);
  assert.deepEqual(normalizeOrderIndexes(null), []);
});

test('swapItemsByIds swaps positions and renumbers', () => {
  const result = swapItemsByIds(listOf(1, 2, 3), 'id1', 'id2');
  assert.deepEqual(idsOf(result), ['id2', 'id1', 'id3']);
  assert.deepEqual(indexesOf(result), [1, 2, 3]);
});

// The regression this whole fix exists for: four pages all at order_index 1.
// The old value-swap wrote 1 and 1 — a no-op — so the UI snapped back.
test('swapItemsByIds still reorders when every index is identical', () => {
  const tied = [
    { _id: 'chapter2', order_index: 1 },
    { _id: 'twotype', order_index: 1 },
    { _id: 'mathintro', order_index: 1 },
    { _id: 'galton', order_index: 1 },
  ];

  const moved = swapItemsByIds(tied, 'chapter2', 'twotype');
  assert.deepEqual(idsOf(moved), ['twotype', 'chapter2', 'mathintro', 'galton']);
  assert.deepEqual(indexesOf(moved), [1, 2, 3, 4], 'ties must be resolved to 1..n');
});

test('swapItemsByIds is a no-op for unknown or identical ids', () => {
  const items = listOf(1, 2, 3);
  assert.equal(swapItemsByIds(items, 'id1', 'nope'), items);
  assert.equal(swapItemsByIds(items, 'id1', 'id1'), items);
});

test('repeated swaps stay contiguous', () => {
  let items = listOf(1, 1, 1, 1, 2);
  for (let i = 0; i < 20; i++) {
    const a = items[i % items.length]._id;
    const b = items[(i + 1) % items.length]._id;
    items = swapItemsByIds(items, a, b);
    assert.deepEqual(
      indexesOf(items),
      [1, 2, 3, 4, 5],
      `indexes drifted after swap ${i}`,
    );
    assert.equal(new Set(idsOf(items)).size, 5, 'lost or duplicated an item');
  }
});

test('clampOrderIndex keeps values inside 1..max', () => {
  assert.equal(clampOrderIndex(0, 5), 1);
  assert.equal(clampOrderIndex(9, 5), 5);
  assert.equal(clampOrderIndex('3', 5), 3);
  assert.equal(clampOrderIndex(NaN, 5), 1);
  assert.equal(clampOrderIndex(2.7, 5), 2);
});

test('reorderItemsByIndex moves an item and renumbers', () => {
  const result = reorderItemsByIndex(listOf(1, 2, 3, 4), 'id4', 2);
  assert.deepEqual(idsOf(result), ['id1', 'id4', 'id2', 'id3']);
  assert.deepEqual(indexesOf(result), [1, 2, 3, 4]);
});

test('reorderItemsByIndex clamps an out-of-range target', () => {
  const result = reorderItemsByIndex(listOf(1, 2, 3), 'id1', 99);
  assert.deepEqual(idsOf(result), ['id2', 'id3', 'id1']);
  assert.deepEqual(indexesOf(result), [1, 2, 3]);
});

// Mirrors the server's rearrangeByMove so both sides agree on the result.
test('reorderItemsByIndex recovers from duplicate indexes', () => {
  const result = reorderItemsByIndex(listOf(1, 1, 1), 'id3', 1);
  assert.deepEqual(idsOf(result), ['id3', 'id1', 'id2']);
  assert.deepEqual(indexesOf(result), [1, 2, 3]);
});
