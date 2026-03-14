"use client";

/**
 * lib/processImage.js — Client-side only image processing.
 * Runs in the browser before any upload. Never import server-side.
 *
 * Strategy:
 * - Attempt native browser decode for all formats (works for Safari/HEIC, all standard formats)
 * - If successful: resize, convert to JPEG, generate blur placeholder client-side
 * - If native decode fails AND file is HEIC: upload raw, flag needsServerBlur for server-side blur
 * - If native decode fails for non-HEIC: upload as-is, no blur
 */

const MAX_EDGE = 1920;
const JPEG_QUALITY = 0.9;
const BLUR_WIDTH = 200;

function isHeicFile(file) {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type === "image/heic" ||
    type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

/**
 * Try to load a file natively via a blob URL.
 * Returns the HTMLImageElement if the browser can decode it, null otherwise.
 * Uses URL.createObjectURL rather than FileReader.readAsDataURL — blob URLs are
 * more reliable for large files and work correctly for HEIC in Safari.
 */
function tryNativeLoad(file) {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (img.width > 0 && img.height > 0) resolve(img);
      else resolve(null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    img.src = objectUrl;
  });
}

/**
 * Generate a blur placeholder from a loaded HTMLImageElement.
 * Returns a base64 data URL (JPEG, 200px wide, quality 0.6).
 */
function generateBlurFromImg(img) {
  const aspect = img.height / img.width;
  const bw = BLUR_WIDTH;
  const bh = Math.round(bw * aspect);
  const canvas = document.createElement("canvas");
  canvas.width = bw;
  canvas.height = bh;
  canvas.getContext("2d").drawImage(img, 0, 0, bw, bh);
  return canvas.toDataURL("image/jpeg", 0.6);
}

/**
 * Process a natively-decoded image: generate blur, resize, convert to JPEG.
 */
function processNativeImage(img, originalFile) {
  return new Promise((resolve) => {
    const blurDataURL = generateBlurFromImg(img);

    let w = img.width;
    let h = img.height;
    if (w > MAX_EDGE || h > MAX_EDGE) {
      const scale = MAX_EDGE / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve({
            file: originalFile,
            width: img.width,
            height: img.height,
            blurDataURL,
            needsServerBlur: false,
          });
          return;
        }
        const newName = originalFile.name.replace(/\.[^/.]+$/, "") + ".jpg";
        const file = new File([blob], newName, {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
        resolve({
          file,
          width: w,
          height: h,
          blurDataURL,
          needsServerBlur: false,
        });
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

/**
 * Full pipeline: attempt native decode, process if successful,
 * otherwise flag for server-side blur (HEIC) or upload as-is.
 *
 * Returns { file, width, height, blurDataURL, needsServerBlur }
 */
export async function processImageForUpload(originalFile) {
  const img = await tryNativeLoad(originalFile);

  if (img) {
    return processNativeImage(img, originalFile);
  }

  if (isHeicFile(originalFile)) {
    // Upload raw HEIC — Cloudflare CDN handles format conversion at serve time via format=auto.
    // Caller must call fetchServerBlur(publicUrl) after the R2 upload completes.
    return {
      file: originalFile,
      width: null,
      height: null,
      blurDataURL: null,
      needsServerBlur: true,
    };
  }

  // Non-HEIC decode failure — upload as-is, no blur
  return {
    file: originalFile,
    width: null,
    height: null,
    blurDataURL: null,
    needsServerBlur: false,
  };
}

/**
 * Fetch a blur placeholder from the server after an image has been uploaded.
 * Uses retry with exponential backoff to handle CDN propagation delays after upload.
 * Returns the blurDataURL string, or null if all attempts fail.
 */
export async function fetchServerBlur(imageUrl, maxRetries = 5) {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch("/api/generate-blur", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });
      if (res.ok) {
        const { blurDataURL } = await res.json();
        return blurDataURL;
      }
      console.warn(
        `fetchServerBlur attempt ${attempt}/${maxRetries} failed: ${res.status}`,
      );
    } catch (err) {
      console.warn(
        `fetchServerBlur attempt ${attempt}/${maxRetries} error:`,
        err.message,
      );
    }
    if (attempt < maxRetries) await delay(attempt * 1000);
  }

  console.error("fetchServerBlur: all attempts failed");
  return null;
}
