import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { updateUserDashboard } from '@/lib/data';
import { normalizeInfoMode } from '@/lib/infoMode';
import { NextResponse } from 'next/server';

export async function PATCH(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  await connectDB();
  const { infoText, infoMode, infoText1, infoMode1 } = await request.json();
  const stored = typeof infoText === 'string' ? infoText : '';
  const stored1 = typeof infoText1 === 'string' ? infoText1 : '';
  const mode = normalizeInfoMode(infoMode, stored);
  const mode1 = normalizeInfoMode(infoMode1, stored1);
  const updated = await updateUserDashboard(
    session.user.userId,
    stored,
    mode,
    stored1,
    mode1,
  );
  return NextResponse.json({
    success: true,
    infoText: updated?.dashboard?.infoText ?? stored,
    infoMode: updated?.dashboard?.infoMode ?? mode,
    infoText1: updated?.dashboard?.infoText1 ?? stored1,
    infoMode1: updated?.dashboard?.infoMode1 ?? mode1,
  });
}
