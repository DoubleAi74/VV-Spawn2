import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { updatePage, deletePage } from '@/lib/data';
import { revalidateDashboardAndPage, buildPagePath } from '@/lib/revalidation';
import { revalidatePath } from 'next/cache';
import Page from '@/lib/models/Page';
import { NextResponse } from 'next/server';

async function ownsPage(userId, pageId) {
  await connectDB();
  const page = await Page.findById(pageId).lean();
  return page && page.userId.toString() === userId ? page : null;
}

export async function PATCH(request, { params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { pageId } = await params;
  const page = await ownsPage(session.user.userId, pageId);
  if (!page) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const data = await request.json();
  const oldSlug = page.slug;
  const updated = await updatePage(pageId, data);

  if (updated.slug !== oldSlug) {
    const oldPath = buildPagePath(page.usernameTag, oldSlug);
    if (oldPath) revalidatePath(oldPath);
  }
  revalidateDashboardAndPage(updated.usernameTag, updated.slug);

  return NextResponse.json(JSON.parse(JSON.stringify(updated)));
}

export async function DELETE(request, { params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { pageId } = await params;
  const page = await ownsPage(session.user.userId, pageId);
  if (!page) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await deletePage(pageId);
  revalidateDashboardAndPage(page.usernameTag, page.slug);
  return NextResponse.json({ success: true });
}
