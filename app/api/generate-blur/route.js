/**
 * POST /api/generate-blur
 * Server-side fallback for generating a blur placeholder from an image URL.
 * Uses Cloudflare CDN image transforms to produce a small, blurred JPEG.
 * Retries up to 5 times with increasing delays to handle CDN propagation lag.
 * Auth not required — called server-side only.
 */
import { NextResponse } from 'next/server';

const R2_DOMAIN = process.env.NEXT_PUBLIC_R2_DOMAIN;
const MAX_RETRIES = 5;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { imageUrl } = body;
  if (!imageUrl) {
    return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });
  }

  let path;
  try {
    path = new URL(imageUrl).pathname;
  } catch {
    return NextResponse.json({ error: 'Invalid imageUrl' }, { status: 400 });
  }

  const blurUrl = `${R2_DOMAIN}/cdn-cgi/image/width=200,quality=60,blur=2,format=jpeg${path}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(blurUrl);

      if (response.ok) {
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        return NextResponse.json({ blurDataURL: `data:image/jpeg;base64,${base64}` });
      }

      console.warn(`generate-blur: attempt ${attempt}/${MAX_RETRIES} failed (${response.status})`);
    } catch (err) {
      console.warn(`generate-blur: attempt ${attempt}/${MAX_RETRIES} error:`, err.message);
    }

    if (attempt < MAX_RETRIES) {
      await delay(attempt * 1000);
    }
  }

  // All retries exhausted — fall back to raw image bytes
  console.error('generate-blur: all CDN attempts failed, falling back to raw encode');
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const base64 = Buffer.from(buffer).toString('base64');
    return NextResponse.json({ blurDataURL: `data:${contentType};base64,${base64}` });
  } catch (err) {
    console.error('generate-blur: raw fallback also failed:', err);
    return NextResponse.json({ error: 'Failed to generate blur' }, { status: 500 });
  }
}
