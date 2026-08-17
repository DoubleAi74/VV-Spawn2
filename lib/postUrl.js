/**
 * lib/postUrl.js — what a URL post is allowed to point at.
 *
 * The content of a url post lands in an href in the lightbox. React refuses to
 * render a `javascript:` href, but leaning on a framework guard for input
 * validation is a thin margin — and it does nothing for any other consumer of
 * the field.
 */

const ALLOWED_PROTOCOLS = ['http:', 'https:'];

export function isHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    return ALLOWED_PROTOCOLS.includes(new URL(value.trim()).protocol);
  } catch {
    return false;
  }
}

export const INVALID_POST_URL_MESSAGE = 'Link must start with http:// or https://';
