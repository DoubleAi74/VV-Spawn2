import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { updatePost, deletePost } from '@/lib/data';
import { revalidateDashboardAndPage } from '@/lib/revalidation';
import { INVALID_POST_URL_MESSAGE, isHttpUrl } from '@/lib/postUrl';
import Post from '@/lib/models/Post';
import Page from '@/lib/models/Page';
import { sanitizeRichText } from '@/lib/sanitize';
import { NextResponse } from 'next/server';

async function getOwnedPost(userId, postId) {
  await connectDB();
  const post = await Post.findById(postId).lean();
  if (!post) return null;
  const page = await Page.findById(post.pageId).lean();
  if (!page || page.userId.toString() !== userId) return null;
  return { post, page };
}

export async function PATCH(request, { params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { postId } = await params;
  const ownedPost = await getOwnedPost(session.user.userId, postId);
  if (!ownedPost) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const existingPost = ownedPost.post;

  const data = await request.json();
  if (data.description) {
    data.description = sanitizeRichText(data.description);
  }

  const nextContentType = data.content_type || existingPost.content_type;

  // Only when the content is actually being written — a title-only edit must
  // not fail because of a value that is already stored.
  if (nextContentType === 'url' && data.content !== undefined && !isHttpUrl(data.content)) {
    return NextResponse.json({ error: INVALID_POST_URL_MESSAGE }, { status: 400 });
  }

  const requiresThumbnail = ['photo', 'file', 'url'].includes(nextContentType);
  const fallbackThumbnail =
    existingPost.thumbnail || (nextContentType === 'photo' ? existingPost.content : '');
  const nextThumbnail = data.thumbnail !== undefined ? data.thumbnail : fallbackThumbnail;
  if (requiresThumbnail && !String(nextThumbnail || '').trim()) {
    return NextResponse.json(
      { error: 'Thumbnail is required for this post type' },
      { status: 400 }
    );
  }

  const updated = await updatePost(postId, data);
  return NextResponse.json(JSON.parse(JSON.stringify(updated)));
}

export async function DELETE(request, { params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { postId } = await params;
  const ownedPost = await getOwnedPost(session.user.userId, postId);
  if (!ownedPost) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await deletePost(postId);
  revalidateDashboardAndPage(ownedPost.page.usernameTag, ownedPost.page.slug);
  return NextResponse.json({ success: true });
}
