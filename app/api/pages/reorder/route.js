import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { swapPageOrder } from '@/lib/data';
import Page from '@/lib/models/Page';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  await connectDB();
  const { pageId1, pageId2 } = await request.json();

  const [p1, p2] = await Promise.all([
    Page.findById(pageId1).lean(),
    Page.findById(pageId2).lean(),
  ]);

  if (!p1 || !p2) return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  if (
    p1.userId.toString() !== session.user.userId ||
    p2.userId.toString() !== session.user.userId
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await swapPageOrder(pageId1, pageId2);
  return NextResponse.json({ success: true });
}
