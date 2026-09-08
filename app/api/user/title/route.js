import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { getUserById, toBaseSlug, uniqueUsernameTag, updateUserTitle } from '@/lib/data';
import { NextResponse } from 'next/server';

export async function PATCH(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  await connectDB();
  const { usernameTitle } = await request.json();

  if (!usernameTitle?.trim()) {
    return NextResponse.json({ error: 'Display name is required' }, { status: 400 });
  }

  const current = await getUserById(session.user.userId);
  if (!current) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const baseTag = toBaseSlug(usernameTitle.trim());
  let usernameTag = baseTag || 'user';
  // Only generate a new tag if the title has changed enough to produce a different slug.
  // Compare against the DB tag (not the JWT) so a stale session cannot skip the
  // previousTags write or invent a colliding address. The account is excluded
  // from the uniqueness check so it can reclaim one of its own former tags.
  if (usernameTag !== current.usernameTag) {
    usernameTag = await uniqueUsernameTag(usernameTag, session.user.userId);
  } else {
    usernameTag = current.usernameTag;
  }

  const user = await updateUserTitle(session.user.userId, usernameTitle.trim(), usernameTag);
  return NextResponse.json({
    usernameTag: user.usernameTag,
    usernameTitle: user.usernameTitle,
  });
}
