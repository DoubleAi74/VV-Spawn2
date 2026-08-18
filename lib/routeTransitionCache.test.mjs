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

test('sanitizeDashboardSnapshot keeps slug and drops unknown fields', () => {
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
        description: 'secret-adjacent',
      },
    ],
    updatedAt: 123,
  });
  assert.deepEqual(clean, {
    usernameTitle: 'Adam',
    email: 'owner@example.com',
    isOwner: true,
    dashHex: '#430a0a',
    backHex: '#cccccc',
    pages: [
      {
        _id: '1',
        title: 'Web',
        thumbnail: '/t.jpg',
        blurDataURL: 'data:image/jpeg;base64,xx',
        slug: 'web-projects',
      },
    ],
    updatedAt: 123,
  });
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
  assert.equal(huge.infoHeight1, undefined);
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
  assert.equal(huge.infoHeight1, undefined);

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
