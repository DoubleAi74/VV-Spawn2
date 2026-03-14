import { revalidatePath } from "next/cache";
import { connectDB } from "@/lib/db";
import Page from "@/lib/models/Page";
import Post from "@/lib/models/Post";

function normalizeSegment(value) {
  return String(value || "").trim();
}

export function buildDashboardPath(usernameTag) {
  const tag = normalizeSegment(usernameTag);
  return tag ? `/${tag}` : null;
}

export function buildPagePath(usernameTag, pageSlug) {
  const tag = normalizeSegment(usernameTag);
  const slug = normalizeSegment(pageSlug);
  return tag && slug ? `/${tag}/${slug}` : null;
}

export function revalidateDashboardAndPage(usernameTag, pageSlug) {
  const dashboardPath = buildDashboardPath(usernameTag);
  const pagePath = buildPagePath(usernameTag, pageSlug);

  if (dashboardPath) revalidatePath(dashboardPath);
  if (pagePath) revalidatePath(pagePath);
}

export async function getPageRevalidationContextByPageId(pageId) {
  if (!pageId) return null;
  await connectDB();
  return Page.findById(pageId, { usernameTag: 1, slug: 1 }).lean();
}

export async function getPageRevalidationContextByPostId(postId) {
  if (!postId) return null;
  await connectDB();

  const post = await Post.findById(postId, { pageId: 1 }).lean();
  if (!post?.pageId) return null;

  return Page.findById(post.pageId, { usernameTag: 1, slug: 1 }).lean();
}

export async function revalidateAllUserThemePaths(userId, usernameTag) {
  const dashboardPath = buildDashboardPath(usernameTag);
  if (dashboardPath) revalidatePath(dashboardPath);

  if (!userId || !usernameTag) return;

  await connectDB();
  const pages = await Page.find({ userId }, { slug: 1 }).lean();

  for (const page of pages) {
    const pagePath = buildPagePath(usernameTag, page.slug);
    if (pagePath) revalidatePath(pagePath);
  }
}
