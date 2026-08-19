import test from 'node:test';
import assert from 'node:assert/strict';
import { submittedOrderIndex } from './orderIndexPayload.js';

test('title save omits order_index when the field is unchanged', () => {
  assert.equal(submittedOrderIndex(3, 3, 6), undefined);
  assert.equal(submittedOrderIndex('2', 2, 8), undefined);
  assert.equal(submittedOrderIndex('', 4, 6), undefined);
  assert.equal(submittedOrderIndex(null, 1, 6), undefined);
});

test('order_index is sent only when the owner changed position', () => {
  assert.equal(submittedOrderIndex(5, 3, 6), 5);
  assert.equal(submittedOrderIndex(1, 4, 6), 1);
  assert.equal(submittedOrderIndex(99, 2, 6), 6);
});
