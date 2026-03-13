import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { createPage } from '@/lib/data';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  await connectDB();
  const data = await request.json();

  const page = await createPage(session.user.userId, data);
  return NextResponse.json(JSON.parse(JSON.stringify(page)));
}
