import test from 'node:test';
import assert from 'node:assert/strict';
import { RATE_LIMITS, clientIp, retryAfterSeconds } from './rateLimitWindow.js';

const headersOf = (map) => ({ headers: { get: (name) => map[name] ?? null } });

test('every budget is a positive limit over a positive window', () => {
  const names = Object.keys(RATE_LIMITS);
  assert.ok(names.length >= 5);
  for (const name of names) {
    const { limit, windowMs } = RATE_LIMITS[name];
    assert.ok(Number.isInteger(limit) && limit > 0, `${name} limit`);
    assert.ok(Number.isInteger(windowMs) && windowMs > 0, `${name} windowMs`);
  }
});

test('the budgets are the ones SEC-8 shipped', () => {
  // Pinned deliberately. These are a product decision written as numbers, and
  // nothing fails visibly if one of them drifts.
  assert.deepEqual(RATE_LIMITS.authEmailPerAddress, { limit: 5, windowMs: 900000 });
  assert.deepEqual(RATE_LIMITS.authEmailPerIp, { limit: 20, windowMs: 900000 });
  assert.deepEqual(RATE_LIMITS.signupPerIp, { limit: 10, windowMs: 900000 });
  assert.deepEqual(RATE_LIMITS.loginPerIp, { limit: 20, windowMs: 900000 });
  assert.deepEqual(RATE_LIMITS.passwordResetConfirmPerIp, { limit: 20, windowMs: 900000 });
});

test('a per-address budget is never looser than the per-IP one it sits inside', () => {
  assert.ok(RATE_LIMITS.authEmailPerAddress.limit <= RATE_LIMITS.authEmailPerIp.limit);
});

test('clientIp takes the first entry of x-forwarded-for', () => {
  assert.equal(
    clientIp(headersOf({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' })),
    '203.0.113.7'
  );
  assert.equal(clientIp(headersOf({ 'x-forwarded-for': '  203.0.113.7  ' })), '203.0.113.7');
});

test('clientIp falls back to x-real-ip, then to a shared bucket', () => {
  assert.equal(clientIp(headersOf({ 'x-real-ip': '203.0.113.9' })), '203.0.113.9');
  assert.equal(clientIp(headersOf({})), 'unknown');
  // An unidentifiable caller shares one bucket rather than escaping the budget.
  assert.equal(clientIp(undefined), 'unknown');
  assert.equal(clientIp({}), 'unknown');
});

test('retryAfterSeconds rounds up to whole seconds', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  assert.equal(retryAfterSeconds(new Date('2026-01-01T00:15:00.000Z'), now), 900);
  assert.equal(retryAfterSeconds(new Date('2026-01-01T00:00:30.400Z'), now), 31);
});

test('retryAfterSeconds never says zero', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  // Retry-After: 0 reads as "try again immediately", which is the opposite of
  // what a refusal means.
  assert.equal(retryAfterSeconds(now, now), 1);
  assert.equal(retryAfterSeconds(new Date('2025-12-31T23:00:00.000Z'), now), 1);
});

test('retryAfterSeconds accepts an ISO string as well as a Date', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  assert.equal(retryAfterSeconds('2026-01-01T00:01:00.000Z', now), 60);
});
