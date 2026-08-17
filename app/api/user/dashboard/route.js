import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { updateUserDashboard } from '@/lib/data';
import { sanitizeRichText } from '@/lib/sanitize';
import { NextResponse } from 'next/server';

export async function PATCH(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  await connectDB();
  const { infoText } = await request.json();
  const clean = sanitizeRichText(infoText || '');
  await updateUserDashboard(session.user.userId, clean);
  // The editor adopts this, so what it shows is exactly what was stored.
  return NextResponse.json({ success: true, infoText: clean });
}
