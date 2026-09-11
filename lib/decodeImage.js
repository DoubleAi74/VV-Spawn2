/** The complete flag alone does not guarantee that the browser has decoded pixels. */
export async function decodeImage(img) {
  if (!img?.complete || img.naturalWidth <= 0) return false;
  try {
    await img.decode?.();
    return img.complete && img.naturalWidth > 0;
  } catch {
    return false;
  }
}
