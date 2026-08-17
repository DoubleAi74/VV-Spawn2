import { S3Client, DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_DOMAIN = process.env.NEXT_PUBLIC_R2_DOMAIN;

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export { R2_BUCKET_NAME, R2_DOMAIN };

/**
 * Delete a file from R2 by its public URL.
 * Extracts the object key from the URL.
 */
function toObjectKey(publicUrl) {
  if (!publicUrl || !R2_DOMAIN) return null;
  // Strip the domain prefix to get the object key
  const key = publicUrl.replace(`${R2_DOMAIN}/`, '');
  if (!key || key === publicUrl) return null; // URL doesn't match our domain
  return key;
}

export async function deleteR2File(publicUrl) {
  const key = toObjectKey(publicUrl);
  if (!key) return;
  await r2Client.send(
    new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key })
  );
}

// DeleteObjects takes up to 1,000 keys per call.
const DELETE_BATCH_SIZE = 1000;

/**
 * Delete many files by public URL. A page with 200 photos was 200 sequential
 * round trips to Cloudflare, which is enough to exceed a serverless execution
 * limit and leave the job half done.
 *
 * Best-effort by design: an orphaned object is a far smaller problem than a
 * half-deleted page, so failures are logged and swallowed.
 */
export async function deleteR2Files(publicUrls) {
  const keys = [...new Set((publicUrls || []).map(toObjectKey).filter(Boolean))];
  if (keys.length === 0) return { deleted: 0, failed: 0 };

  let deleted = 0;
  let failed = 0;

  for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
    const batch = keys.slice(i, i + DELETE_BATCH_SIZE);
    try {
      const result = await r2Client.send(
        new DeleteObjectsCommand({
          Bucket: R2_BUCKET_NAME,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        })
      );
      const errors = result?.Errors?.length || 0;
      deleted += batch.length - errors;
      failed += errors;
      if (errors) {
        console.error('R2 batch delete: %d of %d keys failed', errors, batch.length);
      }
    } catch (err) {
      failed += batch.length;
      console.error('R2 batch delete failed:', err.message);
    }
  }

  return { deleted, failed };
}
