import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRestoreScroll } from './preserveScroll.js';

test('does not restore a captured 0 after the owner has scrolled', () => {
  // Create went idle at the top; owner then scrolled to delete.
  assert.equal(shouldRestoreScroll(0, 408), false);
});

test('restores only when the viewport was reset to 0', () => {
  assert.equal(shouldRestoreScroll(408, 0), true);
});

test('does not yank a different user-owned y', () => {
  assert.equal(shouldRestoreScroll(408, 200), false);
  assert.equal(shouldRestoreScroll(408, 408), false);
});

test('ignores missing or negative snapshots', () => {
  assert.equal(shouldRestoreScroll(undefined, 0), false);
  assert.equal(shouldRestoreScroll(NaN, 0), false);
  assert.equal(shouldRestoreScroll(-12, 0), false);
});
