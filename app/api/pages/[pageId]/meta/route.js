import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { updatePageMeta } from '@/lib/data';
import { PAGE_INFO_FIELDS, normalizeInfoValues, parseInfoPatch } from '@/lib/infoFields';
import { infoResponse } from '@/lib/infoResponse';
import Page from '@/lib/models/Page';
import { isObjectIdOrHexString } from 'mongoose';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { pageId } = await params;
  if (!isObjectIdOrHexString(pageId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await connectDB();
  const page = await Page.findById(pageId, { pageMetaData: 1, isPrivate: 1, userId: 1 }).lean();
  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (page.isPrivate) {
    const session = await auth();
    if (String(page.userId) !== session?.user?.userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }
  return infoResponse(request, normalizeInfoValues(page.pageMetaData, PAGE_INFO_FIELDS));
}

export async function PATCH(request, { params }) {
  const session = await auth();
  if (!session?.user?.userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { pageId } = await params;
  if (!isObjectIdOrHexString(pageId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  let changes;
  try {
    changes = parseInfoPatch(await request.json(), PAGE_INFO_FIELDS);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const updated = await updatePageMeta(pageId, session.user.userId, changes);
  if (!updated) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json({
    success: true,
    ...normalizeInfoValues(updated.pageMetaData, PAGE_INFO_FIELDS),
  });
}
