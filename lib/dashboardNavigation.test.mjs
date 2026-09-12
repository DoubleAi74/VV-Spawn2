import test from 'node:test';
import assert from 'node:assert/strict';
import { isPageToDashboard } from './dashboardNavigation.js';

test('returning from a page skips the watermark for that profile dashboard', () => {
  assert.equal(isPageToDashboard('/owner/chapter-one', '/owner'), true);
  assert.equal(isPageToDashboard('/owner/chapter-two/', '/owner/'), true);
});

test('initial loads and other navigation flows keep their normal loading background', () => {
  assert.equal(isPageToDashboard(null, '/owner'), false);
  assert.equal(isPageToDashboard('/owner/chapter-one', '/someone-else'), false);
  assert.equal(isPageToDashboard('/owner', '/owner/chapter-one'), false);
  assert.equal(isPageToDashboard('/login', '/owner'), false);
  assert.equal(isPageToDashboard('/owner', '/owner'), false);
  assert.equal(isPageToDashboard('/owner/chapter-one', null), false);
});
