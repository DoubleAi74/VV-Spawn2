import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { getOwnedPostWithPage, movePostToIndex } from '@/lib/data';
import { revalidateDashboardAndPage } from '@/lib/revalidation';
import { NextResponse } from 'next/server';

// Body: { postId, toIndex } — toIndex is an absolute 1-based position.
// See the pages reorder route for why placement is absolute, not a swap.
export async function POST(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  await connectDB();
  const { postId, toIndex } = await request.json();

  if (!postId || !Number.isFinite(Number(toIndex))) {
    return NextResponse.json({ error: 'postId and toIndex are required' }, { status: 400 });
  }

  const owned = await getOwnedPostWithPage(session.user.userId, postId);
  if (!owned) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { page } = owned;

  const ordering = await movePostToIndex(postId, Number(toIndex));
  if (!ordering) {
    return NextResponse.json({ error: 'Reorder failed' }, { status: 409 });
  }

  revalidateDashboardAndPage(page.usernameTag, page.slug);
  return NextResponse.json({ ordering });
}
