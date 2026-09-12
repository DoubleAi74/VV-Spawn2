import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustedPostCols, maxPostColsForWidth, normalizePostCols, postGridClassFor,
  readStoredPostCols, selectedPostCols, subscribeStoredPostCols, visiblePostCols, visitorGridStorageKey, writeStoredPostCols,
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

test('visitor changes update mounted grids synchronously and survive a navigation remount', t => {
  const previous = globalThis.window;
  let stop = () => {};
  const stored = new Map();
  const events = new EventTarget();
  globalThis.window = {
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    localStorage: {
      getItem: key => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value),
      removeItem: key => stored.delete(key),
    },
  };
  t.after(() => {
    stop();
    if (previous === undefined) delete globalThis.window; else globalThis.window = previous;
  });
  const key = visitorGridStorageKey('dashboard:returning-visitor');
  const seen = [];
  const unsubscribe = subscribeStoredPostCols(key, () => seen.push(readStoredPostCols(key)));
  stop = unsubscribe;
  writeStoredPostCols(6, key);
  writeStoredPostCols(3, visitorGridStorageKey('page:another-page'));
  assert.deepEqual(seen, [6], 'only the matching resource is notified');
  unsubscribe();
  assert.equal(readStoredPostCols(key), 6, 'the remounted view can read the preference before any effect');

  const unsubscribeAgain = subscribeStoredPostCols(key, () => seen.push(readStoredPostCols(key)));
  stop = unsubscribeAgain;
  stored.set(key, '2');
  const event = new Event('storage');
  Object.defineProperty(event, 'key', { value: key });
  events.dispatchEvent(event);
  assert.deepEqual(seen, [6, 2], 'other-tab changes update the current view');
  writeStoredPostCols(null, key);
  assert.deepEqual(seen, [6, 2, null]);
});

test('a visitor preference survives navigation when storage writes fail', t => {
  const previous = globalThis.window;
  globalThis.window = { localStorage: {
    getItem: () => '4',
    setItem() { throw new Error('Quota exceeded'); },
    removeItem() { throw new Error('Unavailable'); },
  } };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  const key = visitorGridStorageKey('page:blocked-storage');
  writeStoredPostCols(2, key);
  assert.equal(readStoredPostCols(key), 2, 'the stale persisted value cannot undo the local change');
  writeStoredPostCols(null, key);
  assert.equal(readStoredPostCols(key), null);
});
