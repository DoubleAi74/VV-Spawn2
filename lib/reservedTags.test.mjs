import test from 'node:test';
import assert from 'node:assert/strict';
import { RESERVED_USERNAME_TAGS, isReservedUsernameTag } from './reservedTags.js';

test('every static route segment that could be claimed is reserved', () => {
  for (const tag of ['admin', 'api', 'login', '_next']) {
    assert.equal(isReservedUsernameTag(tag), true, `${tag} must be reserved`);
  }
  for (const file of ['favicon.ico', 'robots.txt', 'sitemap.xml']) {
    assert.equal(isReservedUsernameTag(file), true, `${file} must be reserved`);
  }
});

test('matching is case-insensitive and ignores surrounding space', () => {
  // Signing up as "Admin" slugifies to "admin", but be robust to callers that
  // have not slugified yet.
  assert.equal(isReservedUsernameTag('Admin'), true);
  assert.equal(isReservedUsernameTag('  LOGIN '), true);
});

test('ordinary tags are not reserved', () => {
  for (const tag of ['adam-aldridge', 'administrator', 'admin-2', 'apiary', 'log', '']) {
    assert.equal(isReservedUsernameTag(tag), false, `${tag} must be allowed`);
  }
  assert.equal(isReservedUsernameTag(null), false);
  assert.equal(isReservedUsernameTag(undefined), false);
});

test('the reserved list is lowercase and free of duplicates', () => {
  assert.deepEqual(
    RESERVED_USERNAME_TAGS,
    RESERVED_USERNAME_TAGS.map((tag) => tag.toLowerCase())
  );
  assert.equal(new Set(RESERVED_USERNAME_TAGS).size, RESERVED_USERNAME_TAGS.length);
});
