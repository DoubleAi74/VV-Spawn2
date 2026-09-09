import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { updateUserDashboard } from '@/lib/data';
import { DASHBOARD_INFO_FIELDS, normalizeInfoValues, parseInfoPatch } from '@/lib/infoFields';
import { infoResponse } from '@/lib/infoResponse';
import User from '@/lib/models/User';
import { isObjectIdOrHexString } from 'mongoose';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Profiles are public. Only the four public info fields leave this endpoint.
export async function GET(request) {
  const userId = new URL(request.url).searchParams.get('userId');
  if (!isObjectIdOrHexString(userId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await connectDB();
  const user = await User.findById(userId, {
    'dashboard.infoText': 1, 'dashboard.infoMode': 1,
    'dashboard.infoText1': 1, 'dashboard.infoMode1': 1,
  }).lean();
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return infoResponse(request, normalizeInfoValues(user.dashboard, DASHBOARD_INFO_FIELDS));
}

export async function PATCH(request) {
  const session = await auth();
  if (!session?.user?.userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  let changes;
  try {
    changes = parseInfoPatch(await request.json(), DASHBOARD_INFO_FIELDS);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const updated = await updateUserDashboard(session.user.userId, changes);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    success: true,
    ...normalizeInfoValues(updated.dashboard, DASHBOARD_INFO_FIELDS),
  });
}
