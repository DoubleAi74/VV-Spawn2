import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustedPostCols, maxPostColsForWidth, normalizePostCols, postGridClassFor,
  readStoredPostCols, selectedPostCols, visiblePostCols, visitorGridStorageKey, writeStoredPostCols,
} from './postGrid.js';

test('legacy or invalid saved values retain the automatic responsive layout', () => {
  for (const value of [undefined, null, '', '4', 0, 9, 1.5, NaN, Infinity]) {
    assert.equal(normalizePostCols(value), null);
  }
  assert.equal(visiblePostCols(null, 390), 2);
  assert.equal(visiblePostCols(null, 768), 3);
  assert.equal(visiblePostCols(null, 1440), 4);
});

test('a shared desktop count is capped for smaller screens without changing the preference', () => {
  const saved = 8;
  assert.equal(visiblePostCols(saved, 390), 2);
  assert.equal(visiblePostCols(saved, 768), 4);
  assert.equal(visiblePostCols(saved, 1440), 8);
  assert.equal(visiblePostCols(1, 390), 1);
  assert.equal(postGridClassFor(saved), 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-8');
  assert.equal(postGridClassFor(3), 'grid-cols-2 sm:grid-cols-3');
  assert.equal(postGridClassFor(null), 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4');
});

test('arrows start from the visible count and respect the current screen limit', () => {
  assert.equal(adjustedPostCols(null, 1, 1440), 5);
  assert.equal(adjustedPostCols(null, 1, 768), 4);
  assert.equal(adjustedPostCols(8, -1, 390), 1);
  assert.equal(adjustedPostCols(8, 1, 390), 2);
  assert.equal(adjustedPostCols(1, -1, 1440), 1);
  assert.equal(adjustedPostCols(8, 1, 1440), maxPostColsForWidth(1440));
});

test('owners follow their published setting; visitors follow it until explicitly overriding', () => {
  assert.equal(selectedPostCols(6, 2, true), 6);
  assert.equal(selectedPostCols(6, null, false), 6);
  assert.equal(selectedPostCols(6, 2, false), 2);
  assert.equal(selectedPostCols(8, 2, false), 2);
  assert.equal(selectedPostCols(8, null, false), 8, 'reset follows the newest shared value');
});

test('visitor overrides are scoped to each dashboard/page and reset removes only that override', t => {
  const previous = globalThis.window;
  const stored = new Map();
  globalThis.window = { localStorage: {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: key => stored.delete(key),
  } };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  const dashboard = visitorGridStorageKey('dashboard:owner-a');
  const firstPage = visitorGridStorageKey('page:one');
  const secondPage = visitorGridStorageKey('page:two');
  writeStoredPostCols(5, dashboard);
  writeStoredPostCols(3, firstPage);
  assert.equal(readStoredPostCols(dashboard), 5);
  assert.equal(readStoredPostCols(firstPage), 3);
  assert.equal(readStoredPostCols(secondPage), null);
  writeStoredPostCols(null, firstPage);
  assert.equal(readStoredPostCols(firstPage), null);
  assert.equal(readStoredPostCols(dashboard), 5);
});
