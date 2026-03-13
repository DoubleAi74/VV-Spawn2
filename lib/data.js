/**
 * lib/data.js — All database access functions (server-side only).
 * Client components must never import this file directly.
 * Server components and API route handlers call these functions.
 */

import { connectDB } from '@/lib/db';
import User from '@/lib/models/User';
import Page from '@/lib/models/Page';
import Post from '@/lib/models/Post';
import { deleteR2File } from '@/lib/r2';

// ---------------------------------------------------------------------------
// Slug utilities
// ---------------------------------------------------------------------------

function toBaseSlug(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

async function uniqueUsernameTag(baseTag) {
  await connectDB();
  let tag = baseTag || 'user';
  if (tag.length < 2) tag = tag + '0';
  const exists = await User.findOne({ usernameTag: tag }).lean();
  if (!exists) return tag;
  let suffix = 2;
  while (true) {
    const candidate = `${tag}-${suffix}`;
    const taken = await User.findOne({ usernameTag: candidate }).lean();
    if (!taken) return candidate;
    suffix++;
  }
}

async function uniquePageSlug(userId, baseSlug) {
  await connectDB();
  let slug = baseSlug || 'page';
  if (slug.length < 2) slug = slug + '0';
  const exists = await Page.findOne({ userId, slug }).lean();
  if (!exists) return slug;
  let suffix = 2;
  while (true) {
    const candidate = `${slug}-${suffix}`;
    const taken = await Page.findOne({ userId, slug: candidate }).lean();
    if (!taken) return candidate;
    suffix++;
  }
}

async function uniquePostSlug(pageId, baseSlug) {
  await connectDB();
  let slug = baseSlug || 'post';
  if (slug.length < 2) slug = slug + '0';
  const exists = await Post.findOne({ pageId, slug }).lean();
  if (!exists) return slug;
  let suffix = 2;
  while (true) {
    const candidate = `${slug}-${suffix}`;
    const taken = await Post.findOne({ pageId, slug: candidate }).lean();
    if (!taken) return candidate;
    suffix++;
  }
}

export { toBaseSlug, uniqueUsernameTag, uniquePageSlug, uniquePostSlug };

// ---------------------------------------------------------------------------
// User functions
// ---------------------------------------------------------------------------

export async function getUserByUsernameTag(tag) {
  await connectDB();
  return User.findOne({ usernameTag: tag }).lean();
}

export async function getUserById(id) {
  await connectDB();
  return User.findById(id).lean();
}

export async function updateUserColours(userId, dashHex, backHex) {
  await connectDB();
  return User.findByIdAndUpdate(
    userId,
    { $set: { 'dashboard.dashHex': dashHex, 'dashboard.backHex': backHex } },
    { new: true }
  ).lean();
}

export async function updateUserDashboard(userId, infoText) {
  await connectDB();
  return User.findByIdAndUpdate(
    userId,
    { $set: { 'dashboard.infoText': infoText } },
    { new: true }
  ).lean();
}

export async function updateUserTitle(userId, usernameTitle, usernameTag) {
  await connectDB();
  // Update denormalised usernameTag on all user's pages too
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { usernameTitle, usernameTag } },
    { new: true }
  ).lean();
  await Page.updateMany({ userId }, { $set: { usernameTag } });
  return user;
}

// ---------------------------------------------------------------------------
// Page functions
// ---------------------------------------------------------------------------

export async function getPagesByUser(userId, includePrivate = false) {
  await connectDB();
  const query = { userId };
  if (!includePrivate) query.isPrivate = false;
  return Page.find(query).sort({ order_index: 1 }).lean();
}

export async function getPageBySlug(userId, slug) {
  await connectDB();
  return Page.findOne({ userId, slug }).lean();
}

export async function createPage(userId, data) {
  await connectDB();
  const user = await User.findById(userId).lean();
  const baseSlug = toBaseSlug(data.title);
  const slug = data.slug || await uniquePageSlug(userId, baseSlug);

  // order_index = current pageCount + 1
  const order_index = (user.pageCount || 0) + 1;

  const page = await Page.create({
    userId,
    usernameTag: user.usernameTag,
    slug,
    title: data.title,
    description: data.description || '',
    thumbnail: data.thumbnail || '',
    blurDataURL: data.blurDataURL || '',
    isPrivate: data.isPrivate || false,
    order_index,
  });

  await User.findByIdAndUpdate(userId, { $inc: { pageCount: 1 } });
  return page.toObject();
}

export async function updatePage(pageId, data) {
  await connectDB();
  const allowed = ['title', 'description', 'thumbnail', 'blurDataURL', 'isPrivate', 'slug'];
  const update = {};
  for (const key of allowed) {
    if (data[key] !== undefined) update[key] = data[key];
  }
  return Page.findByIdAndUpdate(pageId, { $set: update }, { new: true }).lean();
}

export async function deletePage(pageId) {
  await connectDB();
  const page = await Page.findById(pageId).lean();
  if (!page) return null;

  // Cascade: delete all child posts and their R2 files
  const posts = await Post.find({ pageId }).lean();
  for (const post of posts) {
    const urls = [post.content, post.thumbnail].filter(Boolean);
    for (const url of urls) {
      try { await deleteR2File(url); } catch (_) {}
    }
  }
  await Post.deleteMany({ pageId });

  // Delete page thumbnail from R2
  if (page.thumbnail) {
    try { await deleteR2File(page.thumbnail); } catch (_) {}
  }

  await Page.findByIdAndDelete(pageId);
  await User.findByIdAndUpdate(page.userId, { $inc: { pageCount: -1 } });
  return page;
}

export async function swapPageOrder(pageId1, pageId2) {
  await connectDB();
  const [p1, p2] = await Promise.all([
    Page.findById(pageId1),
    Page.findById(pageId2),
  ]);
  if (!p1 || !p2) return;
  const tmp = p1.order_index;
  p1.order_index = p2.order_index;
  p2.order_index = tmp;
  await Promise.all([p1.save(), p2.save()]);
}

export async function updatePageMeta(pageId, infoText1, infoText2) {
  await connectDB();
  return Page.findByIdAndUpdate(
    pageId,
    { $set: { 'pageMetaData.infoText1': infoText1, 'pageMetaData.infoText2': infoText2 } },
    { new: true }
  ).lean();
}

// ---------------------------------------------------------------------------
// Post functions
// ---------------------------------------------------------------------------

export async function getPostsByPage(pageId) {
  await connectDB();
  return Post.find({ pageId }).sort({ order_index: 1 }).lean();
}

export async function getPostBySlug(pageId, slug) {
  await connectDB();
  return Post.findOne({ pageId, slug }).lean();
}

export async function createPost(pageId, data) {
  await connectDB();
  const page = await Page.findById(pageId).lean();
  const baseSlug = data.slug || toBaseSlug(data.title || data.content_type);
  const slug = await uniquePostSlug(pageId, baseSlug);
  const order_index = (page.postCount || 0) + 1;

  const post = await Post.create({
    pageId,
    slug,
    title: data.title || '',
    description: data.description || '',
    content: data.content || '',
    content_type: data.content_type,
    thumbnail: data.thumbnail || '',
    blurDataURL: data.blurDataURL || '',
    order_index,
  });

  await Page.findByIdAndUpdate(pageId, { $inc: { postCount: 1 } });
  return post.toObject();
}

export async function updatePost(postId, data) {
  await connectDB();
  const allowed = ['title', 'description', 'content', 'content_type', 'thumbnail', 'blurDataURL'];
  const update = {};
  for (const key of allowed) {
    if (data[key] !== undefined) update[key] = data[key];
  }
  return Post.findByIdAndUpdate(postId, { $set: update }, { new: true }).lean();
}

export async function deletePost(postId) {
  await connectDB();
  const post = await Post.findById(postId).lean();
  if (!post) return null;

  const urls = [post.content, post.thumbnail].filter(Boolean);
  for (const url of urls) {
    try { await deleteR2File(url); } catch (_) {}
  }

  await Post.findByIdAndDelete(postId);
  await Page.findByIdAndUpdate(post.pageId, { $inc: { postCount: -1 } });
  return post;
}

export async function swapPostOrder(postId1, postId2) {
  await connectDB();
  const [p1, p2] = await Promise.all([
    Post.findById(postId1),
    Post.findById(postId2),
  ]);
  if (!p1 || !p2) return;
  const tmp = p1.order_index;
  p1.order_index = p2.order_index;
  p2.order_index = tmp;
  await Promise.all([p1.save(), p2.save()]);
}

// ---------------------------------------------------------------------------
// Reconciliation (fix out-of-sync counters)
// ---------------------------------------------------------------------------

export async function reconcilePageCount(userId) {
  await connectDB();
  const count = await Page.countDocuments({ userId });
  await User.findByIdAndUpdate(userId, { $set: { pageCount: count } });
}

export async function reconcilePostCount(pageId) {
  await connectDB();
  const count = await Post.countDocuments({ pageId });
  await Page.findByIdAndUpdate(pageId, { $set: { postCount: count } });
}
