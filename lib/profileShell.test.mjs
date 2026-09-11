import test from 'node:test';
import assert from 'node:assert/strict';
import { toProfileShell } from './profileShell.js';

test('the initial shell includes public branding without account or dashboard content', () => {
  const shell = toProfileShell({
    usernameTag: 'new-name', usernameTitle: 'My thesis', email: 'private@example.com',
    passwordHash: 'private', dashboard: {
      dashHex: '#430a0a', backHex: '#bce7f1', infoText1: 'large HTML', gridCols: 4,
    },
  }, 'old-name');
  assert.deepEqual(shell, {
    usernameTag: 'old-name', usernameTitle: 'My thesis',
    dashHex: '#430a0a', backHex: '#bce7f1',
  });
});

test('a profile without custom branding uses the live theme defaults', () => {
  assert.deepEqual(toProfileShell({ usernameTag: 'owner' }, 'owner'), {
    usernameTag: 'owner', usernameTitle: 'owner', dashHex: '#2d3e50', backHex: '#e5e7eb',
  });
});
