import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { toBaseSlug, uniqueUsernameTag, updateUserTitle } from '@/lib/data';
import { NextResponse } from 'next/server';

export async function PATCH(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  await connectDB();
  const { usernameTitle } = await request.json();

  if (!usernameTitle?.trim()) {
    return NextResponse.json({ error: 'Display name is required' }, { status: 400 });
  }

  const baseTag = toBaseSlug(usernameTitle.trim());
  let usernameTag = baseTag || 'user';
  // Only generate a new tag if the title has changed enough to produce a different slug
  if (usernameTag !== session.user.usernameTag) {
    usernameTag = await uniqueUsernameTag(usernameTag);
  } else {
    usernameTag = session.user.usernameTag;
  }

  const user = await updateUserTitle(session.user.userId, usernameTitle.trim(), usernameTag);
  return NextResponse.json({
    usernameTag: user.usernameTag,
    usernameTitle: user.usernameTitle,
  });
}
