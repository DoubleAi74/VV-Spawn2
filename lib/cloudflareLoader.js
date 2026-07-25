/**
 * Custom next/image loader for Cloudflare R2.
 *
 * R2 custom domains serve stored objects directly. The /cdn-cgi/image route
 * is only available when Cloudflare Image Transformations is configured for
 * the hostname; on an unconfigured custom domain it returns 404.
 */
export default function cloudflareLoader({ src }) {
  return src;
}
