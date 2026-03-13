/**
 * lib/processImage.js — Client-side only image processing.
 * Runs in the browser before any upload. Never import server-side.
 *
 * Responsibilities:
 * - Convert HEIC/HEIF to JPEG via heic2any
 * - Resize images to max 2400px on longest edge
 * - Convert to JPEG at quality 0.9
 * - Generate a base64 blur-data placeholder (tiny thumbnail, 32px wide)
 */

const MAX_EDGE = 2400;
const JPEG_QUALITY = 0.9;
const BLUR_WIDTH = 32;

/**
 * Convert a HEIC/HEIF File to a JPEG Blob using heic2any.
 * Falls back to the original file if conversion is not needed.
 */
async function convertHeicIfNeeded(file) {
  const isHeic =
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    /\.(heic|heif)$/i.test(file.name);

  if (!isHeic) return file;

  const heic2any = (await import('heic2any')).default;
  const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: JPEG_QUALITY });
  return new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
    type: 'image/jpeg',
  });
}

/**
 * Load a File/Blob into an HTMLImageElement.
 */
function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Draw an image onto a canvas at the given dimensions and return a Blob.
 */
function canvasToBlob(img, width, height, quality = JPEG_QUALITY) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Compress an image file:
 * 1. Convert HEIC if needed
 * 2. Resize to max 2400px on longest edge
 * 3. Encode as JPEG at quality 0.9
 *
 * Returns { file: File, width: number, height: number }
 */
export async function compressImage(originalFile) {
  const converted = await convertHeicIfNeeded(originalFile);
  const img = await loadImage(converted);

  let { naturalWidth: w, naturalHeight: h } = img;
  if (w > MAX_EDGE || h > MAX_EDGE) {
    const scale = MAX_EDGE / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const blob = await canvasToBlob(img, w, h);
  const file = new File([blob], originalFile.name.replace(/\.(heic|heif)$/i, '.jpg'), {
    type: 'image/jpeg',
  });
  return { file, width: w, height: h };
}

/**
 * Generate a tiny base64 blur-data placeholder from an image file.
 * Returns a data URL string (JPEG, 32px wide).
 */
export async function generateBlurDataURL(imageFile) {
  const img = await loadImage(imageFile);
  const aspect = img.naturalHeight / img.naturalWidth;
  const bw = BLUR_WIDTH;
  const bh = Math.round(bw * aspect);
  const blob = await canvasToBlob(img, bw, bh, 0.5);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Full pipeline: compress + generate blur in one call.
 * Returns { file, width, height, blurDataURL }
 */
export async function processImageForUpload(originalFile) {
  const { file, width, height } = await compressImage(originalFile);
  const blurDataURL = await generateBlurDataURL(file);
  return { file, width, height, blurDataURL };
}
