import { auth } from '@/lib/auth';
import { r2Client, R2_BUCKET_NAME, R2_DOMAIN } from '@/lib/r2';
import { buildObjectKey, isAllowedContentType, resolveUploadPrefix } from '@/lib/uploadKeys';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';

const MAX_BATCH_SIZE = 50;
// The single-upload route has always enforced this; the batch route did not,
// so fifty files of any size could be presigned in one request.
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

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

  const { files, kind = 'photo', pageId } = body;

  if (!Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: 'files array is required' }, { status: 400 });
  }

  if (files.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `Exceeds maximum batch size of ${MAX_BATCH_SIZE}` },
      { status: 400 }
    );
  }

  // One kind and one page for the whole batch, verified once.
  const target = await resolveUploadPrefix({
    userId: session.user.userId,
    kind,
    pageId,
  });
  if (target.error) {
    return NextResponse.json({ error: target.error }, { status: target.status });
  }

  const rejected = files.find((file) => !isAllowedContentType(kind, file?.contentType));
  if (rejected) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  }

  const oversized = files.find((file) => Number(file?.fileSize) > MAX_FILE_SIZE);
  if (oversized) {
    return NextResponse.json(
      { error: 'File exceeds the 100 MB maximum size limit' },
      { status: 400 }
    );
  }

  const urls = await Promise.all(
    files.map(async ({ filename, contentType, clientId }) => {
      const key = buildObjectKey(target.prefix, filename);

      const command = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        ContentType: contentType,
      });

      const signedUrl = await getSignedUrl(r2Client, command, { expiresIn: 900 });
      const publicUrl = `${R2_DOMAIN}/${key}`;

      return { clientId, signedUrl, publicUrl };
    })
  );

  return NextResponse.json({ urls });
}
