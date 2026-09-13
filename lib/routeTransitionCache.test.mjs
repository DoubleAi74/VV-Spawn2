import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INFO_SNAPSHOT_MAX_CHARS,
  parseSnapshotStore,
  sanitizeDashboardSnapshot,
  sanitizePageSnapshot,
} from './routeTransitionCache.js';

test('parseSnapshotStore ignores missing, invalid, and non-object JSON', () => {
  assert.equal(parseSnapshotStore(null), null);
  assert.equal(parseSnapshotStore(''), null);
  assert.equal(parseSnapshotStore('{'), null);
  assert.equal(parseSnapshotStore('[]'), null);
  assert.equal(parseSnapshotStore('"nope"'), null);
});

test('parseSnapshotStore returns a plain object of snapshots', () => {
  assert.deepEqual(parseSnapshotStore('{"adam-aldridge":{"pageTitle":"Web"}}'), {
    'adam-aldridge': { pageTitle: 'Web' },
  });
});

test('sanitizeDashboardSnapshot keeps visible card details and drops unknown fields', () => {
  const clean = sanitizeDashboardSnapshot({
    usernameTitle: 'Adam',
    email: 'owner@example.com',
    isOwner: true,
    dashHex: '#430a0a',
    backHex: '#cccccc',
    passwordHash: 'nope',
    pages: [
      {
        _id: '1',
        title: 'Web',
        thumbnail: '/t.jpg',
        blurDataURL: 'data:image/jpeg;base64,xx',
        slug: 'web-projects',
        description: 'Selected projects',
        isPrivate: true,
        internalNotes: 'do not cache',
      },
    ],
    updatedAt: 123,
  });
  assert.deepEqual(clean, {
    usernameTitle: 'Adam',
    email: 'owner@example.com',
    isOwner: true,
    gridCols: null,
    dashHex: '#430a0a',
    backHex: '#cccccc',
    pages: [
      {
        _id: '1',
        title: 'Web',
        description: 'Selected projects',
        isPrivate: true,
        thumbnail: '/t.jpg',
        blurDataURL: 'data:image/jpeg;base64,xx',
        slug: 'web-projects',
      },
    ],
    updatedAt: 123,
  });
});

test('legacy dashboard snapshots default missing descriptions and privacy flags', () => {
  const clean = sanitizeDashboardSnapshot({ pages: [{ title: 'Old preview' }] });
  assert.equal(clean.pages[0].description, '');
  assert.equal(clean.pages[0].isPrivate, false);
});

test('loading snapshots retain per-resource column counts and ignore invalid values', () => {
  assert.equal(sanitizeDashboardSnapshot({ gridCols: 7 }).gridCols, 7);
  assert.equal(sanitizePageSnapshot({ gridCols: 3 }).gridCols, 3);
  assert.equal(sanitizePageSnapshot({ gridCols: 20 }).gridCols, null);
  assert.equal(sanitizeDashboardSnapshot({ gridCols: null }).gridCols, null);
});

test('sanitizeDashboardSnapshot keeps info slots and drops oversize HTML', () => {
  const kept = sanitizeDashboardSnapshot({
    usernameTitle: 'Adam',
    infoText1: 'Above',
    infoMode1: 'text',
    infoText: '<!DOCTYPE html>',
    infoMode: 'html',
    infoHeight: 120.2,
  });
  assert.equal(kept.infoText1, 'Above');
  assert.equal(kept.infoMode1, 'text');
  assert.equal(kept.infoText, '<!DOCTYPE html>');
  assert.equal(kept.infoMode, 'html');
  assert.equal(kept.infoHeight, 120);

  const huge = sanitizeDashboardSnapshot({
    infoText1: 'x'.repeat(INFO_SNAPSHOT_MAX_CHARS + 1),
    infoMode1: 'html',
    infoHeight1: 400,
  });
  assert.equal(huge.infoText1, undefined);
  assert.equal(huge.infoMode1, undefined);
  // The height outlives the text it measured: the live view needs it to size
  // its frame without holding the loading cover up.
  assert.equal(huge.infoHeight1, 400);
});

test('sanitizePageSnapshot keeps thumbs and drops post HTML', () => {
  const clean = sanitizePageSnapshot({
    pageTitle: 'Web projects',
    userEmail: 'owner@example.com',
    isOwner: true,
    dashHex: '#430a0a',
    backHex: '#cccccc',
    posts: [
      {
        _id: 'p1',
        title: 'Card',
        content_type: 'photo',
        thumbnail: '/p.jpg',
        blurDataURL: 'data:image/jpeg;base64,yy',
        content: '<p>full post</p>',
      },
    ],
    updatedAt: 99,
  });
  assert.equal(clean.posts[0].content, undefined);
  assert.deepEqual(clean.posts[0], {
    _id: 'p1',
    title: 'Card',
    content_type: 'photo',
    thumbnail: '/p.jpg',
    blurDataURL: 'data:image/jpeg;base64,yy',
  });
});

test('sanitizePageSnapshot keeps above-grid info and drops oversize HTML', () => {
  const kept = sanitizePageSnapshot({
    pageTitle: 'Web',
    infoText1: 'A growing list',
    infoMode1: 'text',
    infoHeight1: 88.7,
    extra: 'nope',
  });
  assert.equal(kept.infoText1, 'A growing list');
  assert.equal(kept.infoMode1, 'text');
  assert.equal(kept.infoHeight1, 89);
  assert.equal(kept.extra, undefined);

  const huge = sanitizePageSnapshot({
    infoText1: 'x'.repeat(INFO_SNAPSHOT_MAX_CHARS + 1),
    infoMode1: 'html',
    infoHeight1: 400,
  });
  assert.equal(huge.infoText1, undefined);
  assert.equal(huge.infoMode1, undefined);
  // The height outlives the text it measured: the live view needs it to size
  // its frame without holding the loading cover up.
  assert.equal(huge.infoHeight1, 400);

  const junkMode = sanitizePageSnapshot({
    infoText1: 'hi',
    infoMode1: 'markdown',
    infoHeight1: -3,
  });
  assert.equal(junkMode.infoText1, 'hi');
  assert.equal(junkMode.infoMode1, undefined);
  assert.equal(junkMode.infoHeight1, undefined);
});

test('sanitize bounds dashboard pages to 20 and page posts to 30', () => {
  const dash = sanitizeDashboardSnapshot({
    pages: Array.from({ length: 25 }, (_, i) => ({ _id: String(i), slug: `p-${i}` })),
  });
  const page = sanitizePageSnapshot({
    posts: Array.from({ length: 40 }, (_, i) => ({ _id: String(i) })),
  });
  assert.equal(dash.pages.length, 20);
  assert.equal(page.posts.length, 30);
});

test('mounted loading views are notified when dashboard or page column counts change', async () => {
  const cache = await import('./routeTransitionCache.js?subscriptions');
  cache.setDashboardSnapshot('owner', { gridCols: 4 });
  cache.setPageSnapshot('owner', 'one', { gridCols: 4 });
  cache.setPageSnapshot('owner', 'two', { gridCols: 2 });
  const seen = [];
  const unsubscribe = cache.subscribeRouteSnapshots(() => seen.push({
    dashboard: cache.getDashboardSnapshot('owner').gridCols,
    page: cache.getPageSnapshot('owner', 'one').gridCols,
  }));

  cache.setDashboardSnapshot('owner', { gridCols: 6 });
  cache.setPageSnapshot('owner', 'one', { gridCols: 3 });
  cache.setPageSnapshot('owner', 'one', { gridCols: null });
  assert.deepEqual(seen, [
    { dashboard: 6, page: 4 },
    { dashboard: 6, page: 3 },
    { dashboard: 6, page: null },
  ]);
  assert.equal(cache.getPageSnapshot('owner', 'two').gridCols, 2);
  assert.equal(cache.getDashboardSnapshot('owner'), cache.getDashboardSnapshot('owner'),
    'unchanged reads have stable identity for useSyncExternalStore');
  unsubscribe();
  cache.setDashboardSnapshot('owner', { gridCols: 5 });
  assert.equal(seen.length, 3);
});

test('a reload restores the latest row counts even after an earlier server-side read', async t => {
  const cache = await import('./routeTransitionCache.js?reload');
  assert.equal(cache.getDashboardSnapshot('owner'), null);
  const stored = new Map([
    [cache.DASH_SNAPSHOT_STORAGE_KEY, JSON.stringify({ owner: { gridCols: 6, updatedAt: Date.now() } })],
    [cache.PAGE_SNAPSHOT_STORAGE_KEY, JSON.stringify({ 'owner/one': { gridCols: 3, updatedAt: Date.now() } })],
  ]);
  const previous = globalThis.window;
  globalThis.window = { sessionStorage: {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  } };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  assert.equal(cache.getDashboardSnapshot('owner').gridCols, 6);
  assert.equal(cache.getPageSnapshot('owner', 'one').gridCols, 3);
  cache.setDashboardSnapshot('owner', { gridCols: 8 });
  cache.setPageSnapshot('owner', 'one', { gridCols: 2 });

  const reloaded = await import('./routeTransitionCache.js?reloaded');
  assert.equal(reloaded.getDashboardSnapshot('owner').gridCols, 8);
  assert.equal(reloaded.getPageSnapshot('owner', 'one').gridCols, 2);
});

test('loading views still receive layout updates when browser storage is unavailable', async t => {
  const previous = globalThis.window;
  globalThis.window = { sessionStorage: {
    getItem() { throw new Error('Unavailable'); },
    setItem() { throw new Error('Unavailable'); },
  } };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  const cache = await import('./routeTransitionCache.js?unavailable');
  let notifications = 0;
  const unsubscribe = cache.subscribeRouteSnapshots(() => notifications++);
  t.after(unsubscribe);
  cache.setDashboardSnapshot('owner', { gridCols: 7 });
  cache.setPageSnapshot('owner', 'one', { gridCols: 5 });
  assert.equal(notifications, 2);
  assert.equal(cache.getDashboardSnapshot('owner').gridCols, 7);
  assert.equal(cache.getPageSnapshot('owner', 'one').gridCols, 5);
});
