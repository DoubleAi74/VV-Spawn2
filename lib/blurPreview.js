/** Shared by browser uploads, the server fallback and preview regeneration. */
export const BLUR_PREVIEW_WIDTH = 64;
export const BLUR_PREVIEW_QUALITY = 70;

export function buildBlurPreviewUrl(imageUrl, storageDomain) {
  const source = new URL(imageUrl);
  const storage = new URL(storageDomain);
  if (source.origin !== storage.origin) throw new TypeError('Invalid imageUrl');
  // Resizing supplies the soft preview. Extra blur here would make server
  // previews less detailed than the browser's canvas-generated equivalents.
  return `${storage.origin}/cdn-cgi/image/width=${BLUR_PREVIEW_WIDTH},quality=${BLUR_PREVIEW_QUALITY},format=jpeg${source.pathname}`;
}
