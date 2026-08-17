import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { updatePageMeta } from '@/lib/data';
import Page from '@/lib/models/Page';
import { sanitizeRichText } from '@/lib/sanitize';
import { NextResponse } from 'next/server';

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
  const clean1 = sanitizeRichText(infoText1 || '');
  const clean2 = sanitizeRichText(infoText2 || '');

  await updatePageMeta(pageId, clean1, clean2);
  return NextResponse.json({ success: true });
}
