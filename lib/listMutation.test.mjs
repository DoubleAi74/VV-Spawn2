import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyEditFromServer,
  applyEditLocally,
  patchItemById,
  restoreDeletedItem,
  rollbackItemSnapshot,
  shouldMergeServerList,
} from './listMutation.js';

const list = (...ids) =>
  ids.map((id, i) => ({ _id: id, title: id, order_index: i + 1 }));

const idsOf = (items) => items.map((item) => item._id);

test('title-only edit patches fields and leaves order alone', () => {
  const next = applyEditLocally(list('a', 'b', 'c'), 'b', { title: 'Bee' });
  assert.deepEqual(idsOf(next), ['a', 'b', 'c']);
  assert.equal(next[1].title, 'Bee');
  assert.equal(next[1].order_index, 2);
});

test('edit that includes order_index places the row', () => {
  const next = applyEditLocally(list('a', 'b', 'c'), 'c', {
    title: 'Cee',
    order_index: 1,
  });
  assert.deepEqual(idsOf(next), ['c', 'a', 'b']);
  assert.equal(next[0].title, 'Cee');
});

test('server ack does not re-place when a newer generation has moved the list', () => {
  const local = applyEditLocally(list('a', 'b', 'c'), 'c', {
    title: 'Cee',
    order_index: 1,
  });
  // Owner then arrow-moved: c a b → c b a
  const afterMove = [
    { _id: 'c', title: 'Cee', order_index: 1 },
    { _id: 'b', title: 'b', order_index: 2 },
    { _id: 'a', title: 'a', order_index: 3 },
  ];
  const acked = applyEditFromServer(
    afterMove,
    'c',
    { title: 'Cee', order_index: 1 },
    { allowReorder: true, editGeneration: 1, currentGeneration: 2 },
  );
  assert.deepEqual(idsOf(acked), ['c', 'b', 'a']);
  assert.equal(acked[0].title, 'Cee');
  assert.equal(local[0]._id, 'c');
});

test('server ack may re-place when this edit is still the newest generation', () => {
  const acked = applyEditFromServer(
    list('a', 'b', 'c'),
    'c',
    { title: 'Cee', order_index: 1 },
    { allowReorder: true, editGeneration: 4, currentGeneration: 4 },
  );
  assert.deepEqual(idsOf(acked), ['c', 'a', 'b']);
});

test('patchItemById never writes order_index from the patch', () => {
  const next = patchItemById(list('a', 'b'), 'a', {
    title: 'A',
    order_index: 9,
  });
  assert.equal(next[0].title, 'A');
  assert.equal(next[0].order_index, 1);
});

test('restoreDeletedItem reinserts and compactifies 1..n', () => {
  const next = restoreDeletedItem(list('a', 'c'), {
    _id: 'b',
    title: 'b',
    order_index: 2,
  });
  assert.deepEqual(idsOf(next), ['a', 'c', 'b']);
  assert.deepEqual(
    next.map((item) => item.order_index),
    [1, 2, 3],
  );
});

test('rollbackItemSnapshot restores one row without replacing the list', () => {
  const current = [
    { _id: 'a', title: 'A-new', order_index: 1 },
    { _id: 'b', title: 'b', order_index: 2 },
  ];
  const next = rollbackItemSnapshot(current, 'a', {
    _id: 'a',
    title: 'A-old',
    order_index: 1,
  });
  assert.equal(next[0].title, 'A-old');
  assert.equal(next[1].title, 'b');
});

test('a late refresh merge is skipped when the list generation has advanced', () => {
  assert.equal(shouldMergeServerList(3, 3), true);
  assert.equal(shouldMergeServerList(3, 4), false);
  assert.equal(shouldMergeServerList(null, 4), true);
});
