/**
 * Custom next/image loader for Cloudflare R2.
 * Returns the R2 public URL as-is (no CDN transform parameters).
 */
export default function cloudflareLoader({ src }) {
  return src;
}
