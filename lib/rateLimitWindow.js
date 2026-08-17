/**
 * lib/rateLimitWindow.js — the budgets and the arithmetic, with no database.
 *
 * Split out of `lib/rateLimit.js` so a plain-node test can load them; that
 * module imports mongoose. The budgets are the part most worth pinning down:
 * they are a product decision written as numbers, and nothing fails visibly if
 * one of them drifts.
 */

const MINUTE = 60 * 1000;

export const RATE_LIMITS = {
  // Anything that causes us to send an email, budgeted per address…
  authEmailPerAddress: { limit: 5, windowMs: 15 * MINUTE },
  // …and per source, so one caller cannot fan out across many addresses.
  authEmailPerIp: { limit: 20, windowMs: 15 * MINUTE },
  signupPerIp: { limit: 10, windowMs: 15 * MINUTE },
  loginPerIp: { limit: 20, windowMs: 15 * MINUTE },
  passwordResetConfirmPerIp: { limit: 20, windowMs: 15 * MINUTE },
};

export const TOO_MANY_REQUESTS_MESSAGE =
  'Too many attempts. Please wait a few minutes and try again.';

/**
 * The caller's address, for per-source budgets. `x-forwarded-for` is a list;
 * the first entry is the client. Never null — an unidentifiable caller shares
 * one bucket rather than escaping the budget entirely.
 */
export function clientIp(request) {
  const forwarded = request?.headers?.get?.('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request?.headers?.get?.('x-real-ip') || 'unknown';
}

/**
 * Seconds until the window expires, for the `Retry-After` header. At least 1:
 * `Retry-After: 0` reads as "try again immediately", which is the opposite of
 * what a refusal means.
 */
export function retryAfterSeconds(expiresAt, now = new Date()) {
  return Math.max(1, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 1000));
}
