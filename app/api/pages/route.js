import { auth } from '@/lib/auth';
import { createPage } from '@/lib/data';
import { revalidateDashboardAndPage } from '@/lib/revalidation';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const data = await request.json();

  const page = await createPage(session.user.userId, data);
  revalidateDashboardAndPage(page.usernameTag || session.user.usernameTag, page.slug);
  return NextResponse.json(JSON.parse(JSON.stringify(page)));
}
