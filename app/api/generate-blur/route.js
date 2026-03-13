/**
 * POST /api/generate-blur
 * Server-side fallback for generating a blur placeholder from an image URL.
 * Used when client-side generation is not available (e.g. HEIC server-side processing).
 * Auth not required — called server-side only.
 */
import { NextResponse } from 'next/server';

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

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Encode the raw image bytes as a base64 data URL.
    // This is a lightweight fallback — the client-side pipeline is preferred.
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const base64 = buffer.toString('base64');
    const blurDataURL = `data:${contentType};base64,${base64}`;

    return NextResponse.json({ blurDataURL });
  } catch (err) {
    console.error('generate-blur error:', err);
    return NextResponse.json({ error: 'Failed to generate blur' }, { status: 500 });
  }
}
