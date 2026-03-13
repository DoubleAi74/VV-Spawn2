import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { updateUserDashboard } from '@/lib/data';
import sanitizeHtml from 'sanitize-html';
import { NextResponse } from 'next/server';

const SANITIZE_OPTIONS = {
  allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'blockquote', 'code', 'pre'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
};

export async function PATCH(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  await connectDB();
  const { infoText } = await request.json();
  const clean = sanitizeHtml(infoText || '', SANITIZE_OPTIONS);
  await updateUserDashboard(session.user.userId, clean);
  return NextResponse.json({ success: true });
}
