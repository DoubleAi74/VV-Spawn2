import { createHash } from 'node:crypto';

/** Large HTML documents are transferred only when their content or mode changes. */
export function infoResponse(request, values) {
  const body = JSON.stringify(values);
  const etag = `"${createHash('sha256').update(body).digest('hex')}"`;
  const headers = { 'Cache-Control': 'private, no-store', ETag: etag };
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, {
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
