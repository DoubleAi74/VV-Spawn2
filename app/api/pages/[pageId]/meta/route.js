import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { updatePageMeta } from '@/lib/data';
import Page from '@/lib/models/Page';
import sanitizeHtml from 'sanitize-html';
import { NextResponse } from 'next/server';

const SANITIZE_OPTIONS = {
  allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'blockquote', 'code', 'pre'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
};

export async function PATCH(request, { params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  await connectDB();
  const { pageId } = await params;

  const page = await Page.findById(pageId).lean();
  if (!page || page.userId.toString() !== session.user.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { infoText1, infoText2 } = await request.json();
  const clean1 = sanitizeHtml(infoText1 || '', SANITIZE_OPTIONS);
  const clean2 = sanitizeHtml(infoText2 || '', SANITIZE_OPTIONS);

  await updatePageMeta(pageId, clean1, clean2);
  return NextResponse.json({ success: true });
}
