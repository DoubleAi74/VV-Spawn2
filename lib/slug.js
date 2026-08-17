/**
 * lib/slug.js — the one definition of how a title becomes a URL.
 *
 * This lived in `lib/data.js` (server-only, imports mongoose) with three
 * hand-copied duplicates in client components: `CreatePageModal`,
 * `EditPageModal` and, inline, `TitleEdit`. The copies existed only because the
 * client could not import the server module — but a drifted copy means the slug
 * preview shown to the user stops matching the URL they actually get.
 *
 * No imports, so client components, `lib/data.js` and a plain-node test can all
 * use it.
 */

export const MAX_SLUG_LENGTH = 50;

export function toBaseSlug(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_SLUG_LENGTH);
}
