import test from 'node:test';
import assert from 'node:assert/strict';
import { decideUpAction } from './upNavigation.js';

test('up-arrow goes back only when this tab came from this profile', () => {
  assert.equal(decideUpAction('/adam-aldridge', '/adam-aldridge'), 'back');
});

test('up-arrow pushes on a shared URL, refresh, or missing key', () => {
  assert.equal(decideUpAction(null, '/adam-aldridge'), 'push');
  assert.equal(decideUpAction('', '/adam-aldridge'), 'push');
  assert.equal(decideUpAction(undefined, '/adam-aldridge'), 'push');
});

test('up-arrow pushes when the stored key is another profile', () => {
  assert.equal(decideUpAction('/someone-else', '/adam-aldridge'), 'push');
});

test('up-arrow pushes when the dashboard href is missing', () => {
  assert.equal(decideUpAction('/adam-aldridge', ''), 'push');
  assert.equal(decideUpAction('/adam-aldridge', null), 'push');
});
