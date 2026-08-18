import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { updatePageMeta } from '@/lib/data';
import { normalizeInfoMode } from '@/lib/infoMode';
import Page from '@/lib/models/Page';
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

  const { infoText1, infoText2, infoMode, infoMode1 } = await request.json();
  const stored1 = typeof infoText1 === 'string' ? infoText1 : '';
  const stored2 = typeof infoText2 === 'string' ? infoText2 : '';
  const mode = normalizeInfoMode(infoMode, stored2);
  const mode1 = normalizeInfoMode(infoMode1, stored1);
  const updated = await updatePageMeta(pageId, stored1, stored2, mode, mode1);
  return NextResponse.json({
    success: true,
    infoText1: updated?.pageMetaData?.infoText1 ?? stored1,
    infoText2: updated?.pageMetaData?.infoText2 ?? stored2,
    infoMode: updated?.pageMetaData?.infoMode ?? mode,
    infoMode1: updated?.pageMetaData?.infoMode1 ?? mode1,
  });
}
