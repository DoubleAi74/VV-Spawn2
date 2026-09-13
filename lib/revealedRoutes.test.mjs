import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRevealedStore } from './revealedRoutes.js';

const withStorage = (t, stored = new Map(), overrides = {}) => {
  const previous = globalThis.window;
  globalThis.window = {
    sessionStorage: {
      getItem: key => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value),
      ...overrides,
    },
  };
  t.after(() => {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  });
  return stored;
};

test('parseRevealedStore ignores missing, invalid, and non-object JSON', () => {
  assert.equal(parseRevealedStore(null), null);
  assert.equal(parseRevealedStore(''), null);
  assert.equal(parseRevealedStore('{'), null);
  assert.equal(parseRevealedStore('[]'), null);
  assert.equal(parseRevealedStore('"nope"'), null);
});

test('a route is not revealed until it is marked', async t => {
  withStorage(t);
  const routes = await import('./revealedRoutes.js?fresh');
  assert.equal(routes.hasRevealed('dashboard:adam'), false);
  routes.markRevealed('dashboard:adam');
  assert.equal(routes.hasRevealed('dashboard:adam'), true);
  assert.equal(routes.hasRevealed('dashboard:someone-else'), false);
});

test('the reveal survives a reload so the skeleton and live view agree', async t => {
  const stored = withStorage(t);
  const routes = await import('./revealedRoutes.js?persist');
  routes.markRevealed('dashboard:adam');
  assert.ok(stored.get(routes.REVEALED_STORAGE_KEY));

  const reloaded = await import('./revealedRoutes.js?persisted');
  assert.equal(reloaded.hasRevealed('dashboard:adam'), true);
});

test('a stale reveal is dropped rather than skipping a cover it cannot justify', async t => {
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  const stored = new Map([
    ['volvox:revealedRoutes', JSON.stringify({
      'dashboard:old': twoHoursAgo,
      'dashboard:new': Date.now(),
    })],
  ]);
  withStorage(t, stored);
  const routes = await import('./revealedRoutes.js?stale');
  assert.equal(routes.hasRevealed('dashboard:old'), false);
  assert.equal(routes.hasRevealed('dashboard:new'), true);
});

test('a missing key never counts as revealed', async t => {
  withStorage(t);
  const routes = await import('./revealedRoutes.js?missingkey');
  routes.markRevealed(undefined);
  routes.markRevealed('');
  assert.equal(routes.hasRevealed(undefined), false);
  assert.equal(routes.hasRevealed(''), false);
});

test('unavailable storage still remembers the reveal for this load', async t => {
  withStorage(t, new Map(), {
    getItem() { throw new Error('Unavailable'); },
    setItem() { throw new Error('Unavailable'); },
  });
  const routes = await import('./revealedRoutes.js?unavailable');
  routes.markRevealed('dashboard:adam');
  assert.equal(routes.hasRevealed('dashboard:adam'), true);
});

test('the server never reports a reveal, so hydration cannot disagree', async t => {
  const previous = globalThis.window;
  delete globalThis.window;
  t.after(() => { if (previous !== undefined) globalThis.window = previous; });
  const routes = await import('./revealedRoutes.js?server');
  routes.markRevealed('dashboard:adam');
  assert.equal(routes.hasRevealed('dashboard:adam'), false);
});
