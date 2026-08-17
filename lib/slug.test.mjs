import test from 'node:test';
import assert from 'node:assert/strict';

import { MAX_SLUG_LENGTH, toBaseSlug } from './slug.js';

test('lowercases and joins words with single hyphens', () => {
  assert.equal(toBaseSlug('Web Projects'), 'web-projects');
  assert.equal(toBaseSlug('  Neural   Networks  '), 'neural-networks');
});

test('strips punctuation rather than transliterating it', () => {
  assert.equal(toBaseSlug("Adam's PhD (2024): notes!"), 'adams-phd-2024-notes');
  assert.equal(toBaseSlug('C++ / Rust & Go'), 'c-rust-go');
  assert.equal(toBaseSlug('a.b,c;d'), 'abcd');
});

test('collapses and trims hyphens', () => {
  assert.equal(toBaseSlug('--- leading and trailing ---'), 'leading-and-trailing');
  assert.equal(toBaseSlug('a  --  b'), 'a-b');
  assert.equal(toBaseSlug('-'), '');
});

test('drops non-Latin input entirely, leaving whatever Latin remains', () => {
  // The character class is [a-z0-9\s-], so non-Latin scripts do not survive.
  // A page titled only in Japanese slugs to '' and the caller falls back.
  assert.equal(toBaseSlug('こんにちは'), '');
  assert.equal(toBaseSlug('Привет'), '');
  assert.equal(toBaseSlug('Café Möbius'), 'caf-mbius');
  assert.equal(toBaseSlug('日本語 notes'), 'notes');
  assert.equal(toBaseSlug('🎉 party 🎉'), 'party');
});

test('truncates to the maximum length', () => {
  const long = 'word '.repeat(40);
  const slug = toBaseSlug(long);
  assert.equal(slug.length, MAX_SLUG_LENGTH);
  assert.equal(slug, 'word-word-word-word-word-word-word-word-word-word-');
});

test('truncation can leave a trailing hyphen, and that is the stored slug', () => {
  // Worth pinning: the trim runs before the slice, so a cut at a boundary
  // leaves the hyphen. The server and the preview must agree on this exactly.
  assert.equal(toBaseSlug('a'.repeat(49) + ' b'), 'a'.repeat(49) + '-');
});

test('handles empty and missing input without throwing', () => {
  assert.equal(toBaseSlug(''), '');
  assert.equal(toBaseSlug('   '), '');
  assert.equal(toBaseSlug(null), '');
  assert.equal(toBaseSlug(undefined), '');
});

test('is idempotent — slugging a slug changes nothing', () => {
  for (const input of ['Web Projects', "Adam's PhD (2024)", 'Café Möbius', '--- x ---']) {
    const once = toBaseSlug(input);
    assert.equal(toBaseSlug(once), once, input);
  }
});
