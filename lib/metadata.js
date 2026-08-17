/**
 * lib/metadata.js — what a shared link looks like before anyone clicks it.
 *
 * Both public routes inherited the root metadata, so every profile and every
 * page previewed as "Volvox Works — Collect your works" with no image. For a
 * platform whose whole purpose is people sharing a URL to their work, that is
 * the widest gap between what the app does and what it appears to do.
 */

import { FULL_IMAGE_WIDTH, buildImageUrl } from '@/lib/cloudflareLoader';

// OpenGraph consumers want roughly 1200px wide. FULL_IMAGE_WIDTH (1600) is the
// nearer of the two buckets PERF-1 established, and a third bucket would mean a
// third Cloudflare transform billed per image for a preview thumbnail — a cost
// decision, not a detail. So social previews reuse the lightbox's transform.
export const OG_IMAGE_WIDTH = FULL_IMAGE_WIDTH;

const MAX_DESCRIPTION = 200;

/**
 * The site's own origin. Needed for absolute OpenGraph URLs — a scraper cannot
 * resolve a relative one. NEXTAUTH_URL is already the canonical origin for this
 * deployment, so it is used rather than introducing a second source of truth;
 * NEXT_PUBLIC_SITE_URL overrides it if the public origin ever differs.
 */
export function siteOrigin() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}

/**
 * Rich text down to one line of plain prose. Descriptions are stored as
 * sanitised HTML; a preview card wants a sentence.
 */
export function toPlainDescription(html, fallback = '') {
  const text = String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return fallback;
  if (text.length <= MAX_DESCRIPTION) return text;
  return `${text.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…`;
}

/** The OpenGraph image block for a stored thumbnail, or nothing. */
export function ogImages(thumbnail, alt) {
  if (!thumbnail) return undefined;
  const url = buildImageUrl(thumbnail, OG_IMAGE_WIDTH);
  if (!url) return undefined;
  return [{ url, alt: alt || undefined }];
}

/**
 * Assemble the metadata object. `noIndex` is the whole point for private
 * pages: they already 404 for anyone else, but a preview scraper should not be
 * invited to try.
 */
export function buildMetadata({ title, description, path, images, noIndex = false }) {
  const url = `${siteOrigin()}${path}`;

  return {
    metadataBase: new URL(siteOrigin()),
    title,
    description,
    alternates: { canonical: url },
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      type: 'website',
      siteName: 'Volvox Works',
      title,
      description,
      url,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(images ? { images: images.map((image) => image.url) } : {}),
    },
  };
}
