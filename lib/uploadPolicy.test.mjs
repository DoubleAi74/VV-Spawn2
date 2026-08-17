import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_UPLOAD_ATTEMPTS,
  RETRY_DELAYS_MS,
  UPLOAD_CONCURRENCY,
  isRetryableStatus,
  runWithConcurrency,
} from './uploadPolicy.js';

test('a 4xx is a verdict and is never retried', () => {
  for (const status of [400, 401, 403, 404, 409, 413, 422]) {
    assert.equal(isRetryableStatus(status), false, `${status} should not retry`);
  }
});

test('408 and 429 are the exceptions — those ask to be retried', () => {
  assert.equal(isRetryableStatus(408), true);
  assert.equal(isRetryableStatus(429), true);
});

test('5xx and "no response at all" are retried', () => {
  for (const status of [0, 500, 502, 503, 504]) {
    assert.equal(isRetryableStatus(status), true, `${status} should retry`);
  }
});

test('a success is not retried', () => {
  for (const status of [200, 201, 204, 304]) {
    assert.equal(isRetryableStatus(status), false, `${status} should not retry`);
  }
});

test('there is one backoff for every retry, and no more', () => {
  assert.equal(RETRY_DELAYS_MS.length, MAX_UPLOAD_ATTEMPTS - 1);
  assert.deepEqual(RETRY_DELAYS_MS, [1000, 2000]);
  // Backoff, not a constant.
  assert.ok(RETRY_DELAYS_MS[1] > RETRY_DELAYS_MS[0]);
});

test('runWithConcurrency preserves the order of the results', async () => {
  const tasks = [30, 5, 20, 1].map((ms, i) => async () => {
    await new Promise((r) => setTimeout(r, ms));
    return i;
  });
  const results = await runWithConcurrency(tasks, 4);
  assert.deepEqual(results.map((r) => r.value), [0, 1, 2, 3]);
});

test('runWithConcurrency never exceeds the limit', async () => {
  let inFlight = 0;
  let peak = 0;
  const tasks = Array.from({ length: 12 }, () => async () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 10));
    inFlight -= 1;
  });
  await runWithConcurrency(tasks, 3);
  assert.equal(peak, 3);
});

test('a failure is isolated to the task that failed', async () => {
  const tasks = [
    async () => 'a',
    async () => {
      throw new Error('the third file');
    },
    async () => 'c',
  ];
  const results = await runWithConcurrency(tasks, 2);
  assert.deepEqual(results.map((r) => r.status), ['fulfilled', 'rejected', 'fulfilled']);
  assert.equal(results[0].value, 'a');
  assert.equal(results[1].reason.message, 'the third file');
  assert.equal(results[2].value, 'c');
});

test('runWithConcurrency handles an empty list and a limit above the count', async () => {
  assert.deepEqual(await runWithConcurrency([], 4), []);
  const results = await runWithConcurrency([async () => 1], 10);
  assert.deepEqual(results, [{ status: 'fulfilled', value: 1 }]);
});

test('the default concurrency matches the queue it shares a connection with', () => {
  // MAX_CONCURRENT_CREATES in lib/useQueue.js is 3; four uploads in flight is
  // the deliberate ceiling here. Both are small on purpose.
  assert.equal(UPLOAD_CONCURRENCY, 4);
});
