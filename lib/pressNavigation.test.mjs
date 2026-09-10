import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRouteOnPress, shouldSeedOnPress } from './pressNavigation.js';

const press = (overrides = {}) => ({
  pointerType: 'mouse',
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...overrides,
});

test('a plain left mouse press opens on press', () => {
  assert.equal(shouldRouteOnPress(press()), true);
});

test('a finger never routes on press, so a scroll can start on a card', () => {
  assert.equal(shouldRouteOnPress(press({ pointerType: 'touch' })), false);
  assert.equal(shouldSeedOnPress(press({ pointerType: 'touch' })), false);
});

test('a pen never routes on press either — it drags to scroll too', () => {
  assert.equal(shouldRouteOnPress(press({ pointerType: 'pen' })), false);
  assert.equal(shouldSeedOnPress(press({ pointerType: 'pen' })), false);
});

test('an unknown or absent pointerType falls back to waiting for click', () => {
  assert.equal(shouldRouteOnPress(press({ pointerType: '' })), false);
  assert.equal(shouldRouteOnPress(press({ pointerType: undefined })), false);
  assert.equal(shouldRouteOnPress(null), false);
  assert.equal(shouldSeedOnPress(press({ pointerType: '' })), false);
  assert.equal(shouldSeedOnPress(null), false);
});

test('modified clicks stay with the <Link> so the new tab still opens', () => {
  for (const key of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) {
    assert.equal(shouldRouteOnPress(press({ [key]: true })), false, key);
    // The snapshot is still worth seeding: the page does open, in a new tab.
    assert.equal(shouldSeedOnPress(press({ [key]: true })), true, key);
  }
});

test('middle and right presses do not open the page', () => {
  assert.equal(shouldRouteOnPress(press({ button: 1 })), false);
  assert.equal(shouldRouteOnPress(press({ button: 2 })), false);
});
