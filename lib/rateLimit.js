/**
 * lib/rateLimit.js — fixed-window rate limiting on a Mongo collection.
 *
 * Nothing throttled the auth endpoints, so anyone could post someone else's
 * address in a loop and send them unlimited email through our Resend account.
 * The budgets below are deliberately generous: they exist to stop a loop, not
 * to inconvenience a person who mistypes a password.
 *
 * Windows are fixed, not sliding. A window starts at the first request and the
 * document expires with it, which the TTL index on RateLimit cleans up.
 */

import { connectDB } from '@/lib/db';
import RateLimit from '@/lib/models/RateLimit';

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

export function clientIp(request) {
  const forwarded = request?.headers?.get?.('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request?.headers?.get?.('x-real-ip') || 'unknown';
}

export function retryAfterSeconds(expiresAt, now = new Date()) {
  return Math.max(1, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 1000));
}

/**
 * Count one request against a budget.
 *
 * Returns { allowed, hits, retryAfter }. On any database problem it returns
 * allowed:true — a rate limiter that locks people out when Mongo hiccups is a
 * worse failure than the one it prevents.
 */
export async function consumeRateLimit({ action, identifier, limit, windowMs }) {
  const key = `${action}:${identifier}`;
  const now = new Date();

  try {
    await connectDB();

    // Increment an existing, unexpired window.
    const live = await RateLimit.findOneAndUpdate(
      { key, expiresAt: { $gt: now } },
      { $inc: { hits: 1 } },
      { new: true }
    ).lean();

    if (live) {
      return {
        allowed: live.hits <= limit,
        hits: live.hits,
        retryAfter: retryAfterSeconds(live.expiresAt, now),
      };
    }

    // No live window: start one. The filter matches an expired document too,
    // so a stale row is reused rather than colliding with the unique key.
    const started = await RateLimit.findOneAndUpdate(
      { key },
      { $set: { hits: 1, expiresAt: new Date(now.getTime() + windowMs) } },
      { upsert: true, new: true }
    ).lean();

    return {
      allowed: true,
      hits: started.hits,
      retryAfter: retryAfterSeconds(started.expiresAt, now),
    };
  } catch (err) {
    console.error('rateLimit: failing open —', err.message);
    return { allowed: true, hits: 0, retryAfter: 0 };
  }
}

/**
 * Apply several budgets to one request. The first refusal wins, and a refusal
 * short-circuits so a blocked caller does not also burn the other budgets.
 */
export async function checkRateLimits(checks) {
  for (const check of checks) {
    const result = await consumeRateLimit(check);
    if (!result.allowed) return result;
  }
  return { allowed: true };
}

export const TOO_MANY_REQUESTS_MESSAGE =
  'Too many attempts. Please wait a few minutes and try again.';
