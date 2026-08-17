import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeServerAndOptimistic } from './optimisticMerge.js';

const server = (...ids) =>
  ids.map((id, i) => ({ _id: id, order_index: i + 1 }));

test('server state replaces local state', () => {
  const merged = mergeServerAndOptimistic(server('a', 'b'), server('a'));
  assert.deepEqual(merged.map((item) => item._id), ['a', 'b']);
});

test('an optimistic item the server has not seen yet survives the merge', () => {
  const current = [
    { _id: 'a', order_index: 1 },
    { _id: '_opt_1', order_index: 2, _optimistic: true },
  ];
  const merged = mergeServerAndOptimistic(server('a'), current);
  assert.deepEqual(merged.map((item) => item._id), ['a', '_opt_1']);
});

test('an optimistic item the server now has is dropped, not duplicated', () => {
  // The real row keeps the temporary id only in the failure case; once the
  // server acknowledges the create the client has already swapped the id.
  const current = [
    { _id: 'a', order_index: 1 },
    { _id: 'b', order_index: 2, _optimistic: true },
  ];
  const merged = mergeServerAndOptimistic(server('a', 'b'), current);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((item) => item._id), ['a', 'b']);
  assert.equal(merged.find((item) => item._id === 'b')._optimistic, undefined);
});

test('settled local items are discarded — the server is authoritative', () => {
  // A card deleted on the server must not be resurrected by local state.
  const merged = mergeServerAndOptimistic(server('a'), server('a', 'b'));
  assert.deepEqual(merged.map((item) => item._id), ['a']);
});

test('the result is sorted by order_index', () => {
  const serverItems = [
    { _id: 'c', order_index: 3 },
    { _id: 'a', order_index: 1 },
    { _id: 'b', order_index: 2 },
  ];
  const merged = mergeServerAndOptimistic(serverItems, []);
  assert.deepEqual(merged.map((item) => item._id), ['a', 'b', 'c']);
});

test('an optimistic item sorts into position by its order_index', () => {
  const current = [{ _id: '_opt_1', order_index: 4, _optimistic: true }];
  const merged = mergeServerAndOptimistic(server('a', 'b', 'c'), current);
  assert.deepEqual(merged.map((item) => item._id), ['a', 'b', 'c', '_opt_1']);
});

test('a tie on order_index keeps the server item first', () => {
  // The sort is stable and the optimistic item is appended, so a card still
  // being created never displaces a settled one that claims the same index.
  const current = [{ _id: '_opt_1', order_index: 2, _optimistic: true }];
  const merged = mergeServerAndOptimistic(server('a', 'b', 'c'), current);
  assert.deepEqual(merged.map((item) => item._id), ['a', 'b', '_opt_1', 'c']);
});

test('non-arrays are treated as empty rather than throwing', () => {
  assert.deepEqual(mergeServerAndOptimistic(undefined, undefined), []);
  assert.deepEqual(mergeServerAndOptimistic(null, server('a')), []);
  assert.deepEqual(
    mergeServerAndOptimistic(server('a'), null).map((item) => item._id),
    ['a']
  );
});

test('the inputs are not mutated', () => {
  const serverItems = server('b', 'a');
  serverItems[0].order_index = 2;
  serverItems[1].order_index = 1;
  const snapshot = JSON.stringify(serverItems);
  mergeServerAndOptimistic(serverItems, []);
  assert.equal(JSON.stringify(serverItems), snapshot);
});
