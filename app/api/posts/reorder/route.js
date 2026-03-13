import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { swapPostOrder } from '@/lib/data';
import Post from '@/lib/models/Post';
import Page from '@/lib/models/Page';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  await connectDB();
  const { postId1, postId2 } = await request.json();

  const [p1, p2] = await Promise.all([
    Post.findById(postId1).lean(),
    Post.findById(postId2).lean(),
  ]);

  if (!p1 || !p2) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

  // Both posts must belong to pages owned by the session user
  const [page1, page2] = await Promise.all([
    Page.findById(p1.pageId).lean(),
    Page.findById(p2.pageId).lean(),
  ]);

  if (
    !page1 || !page2 ||
    page1.userId.toString() !== session.user.userId ||
    page2.userId.toString() !== session.user.userId
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await swapPostOrder(postId1, postId2);
  return NextResponse.json({ success: true });
}
