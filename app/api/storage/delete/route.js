import { auth } from '@/lib/auth';
import { userOwnsFileUrl } from '@/lib/data';
import { deleteR2File } from '@/lib/r2';
import { NextResponse } from 'next/server';

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

  const { fileUrl } = body;

  if (!fileUrl) {
    return NextResponse.json({ error: 'fileUrl is required' }, { status: 400 });
  }

  // A file URL is public, so holding one proves nothing. Resolve it back to a
  // record owned by the caller before deleting anything.
  const owns = await userOwnsFileUrl(session.user.userId, fileUrl);
  if (!owns) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await deleteR2File(fileUrl);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('R2 delete error:', err);
    return NextResponse.json({ error: 'File not found or could not be deleted' }, { status: 404 });
  }
}
