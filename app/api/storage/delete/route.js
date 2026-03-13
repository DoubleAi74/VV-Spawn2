import { auth } from '@/lib/auth';
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

  try {
    await deleteR2File(fileUrl);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('R2 delete error:', err);
    return NextResponse.json({ error: 'File not found or could not be deleted' }, { status: 404 });
  }
}
