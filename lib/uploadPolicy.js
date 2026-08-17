/**
 * lib/uploadPolicy.js — the two rules of the upload path that are pure.
 *
 * Split out of `lib/uploadFile.js` so a plain-node test can load them: that
 * module is a client module and imports React, which a test runner with no
 * bundler cannot resolve through the `@/` alias. Same reason `lib/slug.js`,
 * `lib/colour.js` and `lib/reservedTags.js` import nothing.
 *
 * A retry policy and a concurrency limit are exactly the sort of rule that
 * decays without anyone noticing — nothing breaks visibly when a 4xx starts
 * being retried three times.
 */

/** Attempts per file, including the first. Deliberately small. */
export const MAX_UPLOAD_ATTEMPTS = 3;

/** Backoff before attempts 2 and 3. */
export const RETRY_DELAYS_MS = [1000, 2000];

/**
 * More than four parallel uploads on a phone connection makes every one of
 * them slower.
 */
export const UPLOAD_CONCURRENCY = 4;

/**
 * Whether a failed attempt is worth repeating.
 *
 * A 4xx is a verdict — the same request will be refused the same way — so it
 * is never retried. 408 and 429 are the exceptions: those status codes are the
 * server asking to be retried. Status 0 means no response arrived at all,
 * which is the case retrying exists for.
 */
export function isRetryableStatus(status) {
  if (status === 0) return true;
  if (status === 408 || status === 429) return true;
  return status >= 500;
}

/**
 * Run `tasks` with at most `limit` in flight, settling every one.
 *
 * Returns results in the order the tasks were given, each
 * `{ status: 'fulfilled', value }` or `{ status: 'rejected', reason }` — one
 * failure must not cancel the files that would have succeeded.
 */
export async function runWithConcurrency(tasks, limit = UPLOAD_CONCURRENCY) {
  const results = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (true) {
      const index = next++;
      if (index >= tasks.length) return;
      try {
        results[index] = { status: 'fulfilled', value: await tasks[index]() };
      } catch (error) {
        results[index] = { status: 'rejected', reason: error };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}
