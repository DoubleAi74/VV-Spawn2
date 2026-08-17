/**
 * lib/uploadKeys.js — where an upload is allowed to land (server-side only).
 *
 * The object key must never be built from anything the client sends. It is
 * derived from the authenticated user and, for anything belonging to a page,
 * from a page that has been verified as theirs. The client chooses only which
 * *kind* of upload it is making.
 */

import { connectDB } from '@/lib/db';
import Page from '@/lib/models/Page';

// Photos and thumbnails are decoded and re-encoded by the browser before
// upload, so this list is what processImageForUpload can actually produce,
// plus the two HEIC types that pass through untouched for CDN conversion.
const IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/heic',
  'image/heif',
];

// File posts are a product feature — people attach documents and small web
// pages — so this list is deliberately broad. It exists to keep the bucket to
// things the site serves, not to be a security boundary on its own.
const FILE_TYPES = [
  ...IMAGE_TYPES,
  'application/pdf',
  'application/zip',
  'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/octet-stream',
  'text/html',
  'text/plain',
  'text/markdown',
  'text/csv',
  'audio/mpeg',
  'video/mp4',
];

export const UPLOAD_KINDS = ['photo', 'file', 'page-thumbnail'];

export function isAllowedContentType(kind, contentType) {
  const base = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (!base) return false;
  return kind === 'file' ? FILE_TYPES.includes(base) : IMAGE_TYPES.includes(base);
}

/**
 * Resolve the key prefix for an upload, or explain why it is refused.
 * Returns { prefix } on success, { error, status } otherwise.
 */
export async function resolveUploadPrefix({ userId, kind, pageId }) {
  if (!userId) return { error: 'Unauthorised', status: 401 };
  if (!UPLOAD_KINDS.includes(kind)) return { error: 'Unknown upload kind', status: 400 };

  if (kind === 'page-thumbnail') {
    return { prefix: `users/${userId}/page-thumbnails` };
  }

  if (!pageId) return { error: 'pageId is required', status: 400 };

  await connectDB();
  const page = await Page.findOne({ _id: pageId, userId }, { _id: 1 })
    .lean()
    .catch(() => null); // a malformed id is a refusal, not a crash
  if (!page) return { error: 'Forbidden', status: 403 };

  return {
    prefix: `users/${userId}/pages/${page._id}/${kind === 'file' ? 'files' : 'posts'}`,
  };
}

export function buildObjectKey(prefix, filename) {
  const sanitised = String(filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sanitised}`;
}
