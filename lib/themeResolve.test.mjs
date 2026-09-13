import test from 'node:test';
import assert from 'node:assert/strict';
import { remoteThemeIsCurrent, resolvePaintTheme } from './themeResolve.js';

test('persisted theme beats an older history snapshot', () => {
  const resolved = resolvePaintTheme({
    snapshot: { dashHex: '#111111', backHex: '#aaaaaa', updatedAt: 10 },
    shell: { dashHex: '#222222', backHex: '#bbbbbb' },
    persisted: { dashHex: '#570e11', backHex: '#aceaf5', updatedAt: 20 },
  });
  assert.deepEqual(resolved, { dashHex: '#570e11', backHex: '#aceaf5' });
});

test('a snapshot written after the last persist still wins', () => {
  const resolved = resolvePaintTheme({
    snapshot: { dashHex: '#111111', backHex: '#aaaaaa', updatedAt: 30 },
    persisted: { dashHex: '#570e11', backHex: '#aceaf5', updatedAt: 20 },
  });
  assert.deepEqual(resolved, { dashHex: '#111111', backHex: '#aaaaaa' });
});

test('remote theme does not override a newer local write', () => {
  assert.equal(remoteThemeIsCurrent(10, 20), false);
  assert.equal(remoteThemeIsCurrent(20, 20), true);
  assert.equal(remoteThemeIsCurrent(30, 20), true);
  assert.equal(remoteThemeIsCurrent(undefined, 20), false);
});
