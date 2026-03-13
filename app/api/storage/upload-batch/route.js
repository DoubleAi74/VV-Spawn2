import { auth } from '@/lib/auth';
import { r2Client, R2_BUCKET_NAME, R2_DOMAIN } from '@/lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';

const MAX_BATCH_SIZE = 50;

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

  const { files } = body;

  if (!Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: 'files array is required' }, { status: 400 });
  }

  if (files.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `Exceeds maximum batch size of ${MAX_BATCH_SIZE}` },
      { status: 400 }
    );
  }

  const urls = await Promise.all(
    files.map(async ({ filename, contentType, folder, clientId }) => {
      const sanitisedFilename = (filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}-${sanitisedFilename}`;

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
