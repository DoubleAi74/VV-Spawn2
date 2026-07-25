/**
 * Custom next/image loader for Cloudflare R2.
 * Converts all images to WebP via cdn-cgi/image for smaller file sizes and
 * HEIC compatibility across all browsers.
 * Width is intentionally omitted so that PostCard and PhotoShowModal produce
 * identical URLs for the same image, allowing the browser to serve modal
 * images directly from cache with no network request.
 */
export default function cloudflareLoader({ src }) {
  if (src.startsWith('/')) return src;

  try {
    const path = new URL(src).pathname;
    return `${process.env.NEXT_PUBLIC_R2_DOMAIN}/cdn-cgi/image/quality=75,format=webp${path}`;
  } catch {
    return src;
  }
}
