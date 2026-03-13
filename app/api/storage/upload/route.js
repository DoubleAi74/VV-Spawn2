import { auth } from '@/lib/auth';
import { r2Client, R2_BUCKET_NAME, R2_DOMAIN } from '@/lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';

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

  const { filename, contentType, folder, fileSize } = body;

  if (!filename || !contentType || !folder) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (fileSize && fileSize > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'File exceeds the 100 MB maximum size limit' },
      { status: 400 }
    );
  }

  const sanitisedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `${folder}/${Date.now()}-${sanitisedFilename}`;

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const signedUrl = await getSignedUrl(r2Client, command, { expiresIn: 900 }); // 15 min
  const publicUrl = `${R2_DOMAIN}/${key}`;

  return NextResponse.json({ signedUrl, publicUrl });
}
