import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

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
export async function deleteR2File(publicUrl) {
  if (!publicUrl || !R2_DOMAIN) return;
  // Strip the domain prefix to get the object key
  const key = publicUrl.replace(`${R2_DOMAIN}/`, '');
  if (!key || key === publicUrl) return; // URL doesn't match our domain
  await r2Client.send(
    new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key })
  );
}
