import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { createPost, isParentPageMissingError } from '@/lib/data';
import Page from '@/lib/models/Page';
import { revalidateDashboardAndPage } from '@/lib/revalidation';
import { INVALID_POST_URL_MESSAGE, isHttpUrl } from '@/lib/postUrl';
import { sanitizeRichText } from '@/lib/sanitize';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  await connectDB();
  const data = await request.json();
  const { pageId, ...rest } = data;

  if (!pageId) return NextResponse.json({ error: 'pageId is required' }, { status: 400 });

  // Verify ownership
  const page = await Page.findById(pageId).lean();
  if (!page || page.userId.toString() !== session.user.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Sanitise rich text description
  if (rest.description) {
    rest.description = sanitizeRichText(rest.description);
  }

  if (rest.content_type === 'url' && !isHttpUrl(rest.content)) {
    return NextResponse.json({ error: INVALID_POST_URL_MESSAGE }, { status: 400 });
  }

  const requiresThumbnail = ['photo', 'file', 'url'].includes(rest.content_type);
  if (requiresThumbnail && !String(rest.thumbnail || '').trim()) {
    return NextResponse.json(
      { error: 'Thumbnail is required for this post type' },
      { status: 400 }
    );
  }

  let post;
  try {
    post = await createPost(pageId, rest);
  } catch (error) {
    // The page was deleted while this create was in flight. createPost has
    // already undone its own insert and cleaned up the uploaded files, so
    // there is nothing left to report but the conflict itself. See REL-7.
    if (isParentPageMissingError(error)) {
      return NextResponse.json(
        { error: 'That page was deleted while the post was being created' },
        { status: 409 }
      );
    }
    throw error;
  }

  revalidateDashboardAndPage(page.usernameTag, page.slug);
  return NextResponse.json(JSON.parse(JSON.stringify(post)));
}
