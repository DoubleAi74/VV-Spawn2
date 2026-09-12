/**
 * POST /api/generate-blur
 * Server-side fallback for generating a blur placeholder from an image URL.
 * Uses Cloudflare CDN image transforms to produce a small JPEG preview.
 * Retries a few times to handle CDN propagation lag after an upload.
 *
 * Requires a session, and the URL must be one of our own R2 objects: this is a
 * server-side fetch of a caller-supplied address, so without both checks it is
 * a read primitive against anything the server can reach.
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildBlurPreviewUrl } from '@/lib/blurPreview';

const R2_DOMAIN = process.env.NEXT_PUBLIC_R2_DOMAIN;
const MAX_RETRIES = 3;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

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

  let blurUrl;
  try {
    blurUrl = buildBlurPreviewUrl(imageUrl, R2_DOMAIN);
  } catch {
    return NextResponse.json({ error: 'Invalid imageUrl' }, { status: 400 });
  }

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
      await delay(attempt * 500);
    }
  }

  // No raw-image fallback: it returned the whole original base64-encoded, which
  // is neither a blur nor a sensible payload. A missing placeholder is handled
  // by every call site.
  console.error('generate-blur: all CDN attempts failed');
  return NextResponse.json({ error: 'Failed to generate blur' }, { status: 502 });
}
