/**
 * lib/reservedTags.js — usernameTag values that must not be handed out.
 *
 * usernameTag is the top-level route segment (`/{usernameTag}`), so a tag that
 * collides with a static route or a well-known file loses to that route: the
 * account's profile becomes permanently unreachable, with nothing to explain
 * why. Reserved tags fall through to the numeric-suffix path that already
 * handles ordinary collisions.
 *
 * No imports here on purpose — the unit test loads this file directly under
 * plain node, where the "@/" alias does not resolve.
 */

export const RESERVED_USERNAME_TAGS = [
  'admin',
  'api',
  'login',
  '_next',
  'static',
  'public',
  '.well-known',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'manifest.json',
];

export function isReservedUsernameTag(tag) {
  return RESERVED_USERNAME_TAGS.includes(String(tag || '').trim().toLowerCase());
}
