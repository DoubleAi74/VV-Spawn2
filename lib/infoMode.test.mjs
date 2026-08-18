import test from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeHtmlDocument, normalizeInfoMode } from './infoMode.js';

test('looksLikeHtmlDocument is true for a full document', () => {
  assert.equal(looksLikeHtmlDocument('<!DOCTYPE html><html><style></style>'), true);
  assert.equal(looksLikeHtmlDocument('<html lang="en">'), true);
  assert.equal(looksLikeHtmlDocument('<style>body{color:red}</style>'), true);
});

test('looksLikeHtmlDocument is false for a blurb', () => {
  assert.equal(looksLikeHtmlDocument('Just a note'), false);
  assert.equal(looksLikeHtmlDocument('<b>bold</b> and a <a href="https://x.com">link</a>'), false);
});

test('normalizeInfoMode prefers the saved flag', () => {
  assert.equal(normalizeInfoMode('html', 'plain'), 'html');
  assert.equal(normalizeInfoMode('text', '<!DOCTYPE html>'), 'text');
});

test('normalizeInfoMode infers when the flag is missing', () => {
  assert.equal(normalizeInfoMode('', '<!DOCTYPE html><html>'), 'html');
  assert.equal(normalizeInfoMode(undefined, 'hello'), 'text');
});
