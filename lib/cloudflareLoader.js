/**
 * Custom next/image loader for Cloudflare R2, via cdn-cgi/image.
 *
 * Two fixed width buckets, not a full responsive srcset: Cloudflare bills per
 * unique transform, so two variants per image is a predictable cost, while a
 * srcset across every device width is not. The bucket is chosen by the call
 * site — a grid card always asks for CARD_IMAGE_WIDTH and the lightbox always
 * asks for FULL_IMAGE_WIDTH, on every device — rather than by the browser, so
 * the number of distinct transforms per image cannot grow with the number of
 * viewports.
 *
 * The loader used to omit `width` entirely so that a card and the lightbox
 * produced the same URL and the lightbox opened from cache. That is preserved
 * differently: the lightbox layers the card's cached image underneath the full
 * one it is fetching, so it still opens with no blank frame.
 */

/**
 * Grid cards, on every device. Cards are `object-cover` 4:3 crops, so a 16:9
 * source is cropped and scaled up: a 330 CSS-px card on a 2× display needs
 * about 835px of source width. 640 covers a phone comfortably but is visibly
 * soft on a retina desktop — small text inside a thumbnail stops being
 * legible — so the bucket is 960. Measured on the live images, that is a 59%
 * drop in dashboard transfer on a phone against no visible change anywhere.
 */
export const CARD_IMAGE_WIDTH = 960;
/** The lightbox's full-size image. */
export const FULL_IMAGE_WIDTH = 1600;

// The bucket travels on the src as a query parameter, because next/image
// decides for itself which widths to put in a srcset and would otherwise pull
// in a third and fourth transform.
const BUCKET_PARAM = 'w';

/** Tag a src with the bucket the call site wants. Non-R2 sources pass through. */
export function withImageBucket(src, bucket = CARD_IMAGE_WIDTH) {
  if (!src || typeof src !== 'string' || src.startsWith('/')) return src;
  try {
    const url = new URL(src);
    url.searchParams.set(BUCKET_PARAM, String(bucket));
    return url.toString();
  } catch {
    return src;
  }
}

/**
 * The cdn-cgi URL for a source image at a given bucket. `bucket` defaults to
 * whatever `withImageBucket` put on the src, then to the card width.
 */
export function buildImageUrl(src, bucket) {
  if (!src || typeof src !== 'string' || src.startsWith('/')) return src;

  try {
    const url = new URL(src);
    const tagged = Number(url.searchParams.get(BUCKET_PARAM));
    const width =
      bucket || (Number.isFinite(tagged) && tagged > 0 ? tagged : CARD_IMAGE_WIDTH);
    return `${process.env.NEXT_PUBLIC_R2_DOMAIN}/cdn-cgi/image/width=${width},quality=75,format=webp${url.pathname}`;
  } catch {
    return src;
  }
}

export default function cloudflareLoader({ src }) {
  if (typeof src === 'string' && src.startsWith('/')) return src;
  return buildImageUrl(src);
}
