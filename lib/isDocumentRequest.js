import { headers } from 'next/headers';

/**
 * True for a real browser document request (typed URL, refresh, crawler).
 * False for App Router flights and prefetches — those already have a client
 * to show `loading.js`, and blocking them on a database read is what made
 * a card click sit on the old screen until the server answered.
 */
export async function isDocumentRequest() {
  const h = await headers();
  if (h.get('rsc') === '1') return false;
  if (h.get('next-router-prefetch') === '1') return false;
  if (h.has('next-router-segment-prefetch')) return false;
  return true;
}
