import { auth } from '@/lib/auth';
import { createPage, getPagesByUser } from '@/lib/data';
import { revalidateDashboardAndPage } from '@/lib/revalidation';
import { NextResponse } from 'next/server';
import { isObjectIdOrHexString } from 'mongoose';

export async function GET(request) {
  const userId = new URL(request.url).searchParams.get('userId');
  if (!isObjectIdOrHexString(userId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const session = await auth();
  const isOwner = session?.user?.userId === userId;
  const pages = await getPagesByUser(userId, isOwner);
  return NextResponse.json(pages, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const data = await request.json();

  const page = await createPage(session.user.userId, data);
  revalidateDashboardAndPage(page.usernameTag || session.user.usernameTag, page.slug);
  return NextResponse.json(JSON.parse(JSON.stringify(page)));
}
