import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { updateUserColours } from '@/lib/data';
import { revalidateAllUserThemePaths } from '@/lib/revalidation';
import { NextResponse } from 'next/server';

export async function PATCH(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  await connectDB();
  const body = await request.json();
  const { dashHex, backHex } = body;

  const user = await updateUserColours(session.user.userId, dashHex, backHex);
  await revalidateAllUserThemePaths(session.user.userId, session.user.usernameTag);
  return NextResponse.json({ dashHex: user.dashboard.dashHex, backHex: user.dashboard.backHex });
}
