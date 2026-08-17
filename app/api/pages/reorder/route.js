import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { movePageToIndex } from '@/lib/data';
import { revalidateDashboardAndPage } from '@/lib/revalidation';
import Page from '@/lib/models/Page';
import { NextResponse } from 'next/server';

// Body: { pageId, toIndex } — toIndex is an absolute 1-based position.
// Absolute placement is idempotent, so a duplicated or replayed request from
// a burst of clicks cannot corrupt the ordering.
export async function POST(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  await connectDB();
  const { pageId, toIndex } = await request.json();

  if (!pageId || !Number.isFinite(Number(toIndex))) {
    return NextResponse.json({ error: 'pageId and toIndex are required' }, { status: 400 });
  }

  const page = await Page.findById(pageId).lean();
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  if (page.userId.toString() !== session.user.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const ordering = await movePageToIndex(pageId, Number(toIndex));
  if (!ordering) {
    return NextResponse.json({ error: 'Reorder failed' }, { status: 409 });
  }

  revalidateDashboardAndPage(page.usernameTag, page.slug);
  return NextResponse.json({ ordering });
}
