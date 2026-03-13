import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { updatePage, deletePage, getPageBySlug } from '@/lib/data';
import Page from '@/lib/models/Page';
import { NextResponse } from 'next/server';

async function ownsPage(userId, pageId) {
  await connectDB();
  const page = await Page.findById(pageId).lean();
  return page && page.userId.toString() === userId;
}

export async function PATCH(request, { params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { pageId } = await params;
  if (!(await ownsPage(session.user.userId, pageId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const data = await request.json();
  const updated = await updatePage(pageId, data);
  return NextResponse.json(JSON.parse(JSON.stringify(updated)));
}

export async function DELETE(request, { params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { pageId } = await params;
  if (!(await ownsPage(session.user.userId, pageId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await deletePage(pageId);
  return NextResponse.json({ success: true });
}
