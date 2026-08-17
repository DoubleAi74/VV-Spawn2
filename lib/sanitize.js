/**
 * lib/sanitize.js — the single definition of what user rich text may contain.
 *
 * The same options object was declared verbatim in seven places (four route
 * handlers and three components). Duplicated allowlists drift, and a drifted
 * allowlist is a security hole that looks like a formatting bug.
 */

import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'b',
  'i',
  'em',
  'strong',
  'a',
  'p',
  'br',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'blockquote',
  'code',
  'pre',
];

/**
 * `target` is allowed on anchors, and a target that opens a new browsing
 * context hands the opened page a live `window.opener` back to ours unless
 * `rel="noopener"` says otherwise. Existing rel values are preserved.
 */
function withNoopener(rel) {
  const parts = String(rel || '')
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.includes('noopener')) parts.push('noopener');
  return parts.join(' ');
}

export const SANITIZE_OPTIONS = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: (tagName, attribs) => {
      if (!attribs.target) return { tagName, attribs };
      return { tagName, attribs: { ...attribs, rel: withNoopener(attribs.rel) } };
    },
  },
};

export function sanitizeRichText(value) {
  return sanitizeHtml(String(value ?? ''), SANITIZE_OPTIONS);
}
