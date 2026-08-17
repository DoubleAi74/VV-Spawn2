/**
 * lib/data.js — All database access functions (server-side only).
 * Client components must never import this file directly.
 * Server components and API route handlers call these functions.
 */

import { connectDB } from '@/lib/db';
import User from '@/lib/models/User';
import Page from '@/lib/models/Page';
import Post from '@/lib/models/Post';
import { clampOrderIndex } from '@/lib/ordering';
import { isReservedUsernameTag } from '@/lib/reservedTags';
import { sanitizeRichText } from '@/lib/sanitize';
import { toBaseSlug } from '@/lib/slug';
import { deleteR2Files } from '@/lib/r2';

// ---------------------------------------------------------------------------
// Slug utilities
//
// toBaseSlug lives in lib/slug.js so the modals can show a preview built by the
// same code that assigns the URL. It is re-exported here because the auth
// routes have always imported it from this module.
// ---------------------------------------------------------------------------

function isDuplicateKeyError(error) {
  return error?.code === 11000;
}

// Raised when a post's page disappears underneath it — the caller deleted the
// page while this create was in flight. Distinguished from a generic failure so
// the route can answer 409 rather than 500. See REL-7.
export const PARENT_PAGE_MISSING = 'PARENT_PAGE_MISSING';

function parentPageMissingError() {
  const error = new Error('Page not found');
  error.code = PARENT_PAGE_MISSING;
  return error;
}

export function isParentPageMissingError(error) {
  return error?.code === PARENT_PAGE_MISSING;
}

function randomSlugSuffix() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function parseRequestedOrderIndex(value) {
  if (value === undefined || value === null || value === '') return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  return Math.trunc(numericValue);
}

// ---------------------------------------------------------------------------
// Ordering
//
// order_index is a projection of list position, not an independent value.
// Every write below reads the whole sibling set, rearranges it as an array,
// then rewrites order_index as 1..n. That makes each operation idempotent and
// self-healing: if the stored indices have drifted (duplicates, gaps), the
// next ordering write repairs them rather than compounding the damage.
//
// SIBLING_SORT must match the sort used by getPagesByUser / getPostsByPage so
// the server and the client always agree on positions, including when two
// documents share an order_index. The _id tiebreak makes that total.
// ---------------------------------------------------------------------------

const SIBLING_SORT = { order_index: 1, _id: 1 };

function buildRenumberOps(orderedItems) {
  const ops = [];
  orderedItems.forEach((item, index) => {
    const desired = index + 1;
    if (item.order_index !== desired) {
      ops.push({
        updateOne: {
          filter: { _id: item._id },
          update: { $set: { order_index: desired } },
        },
      });
    }
  });
  return ops;
}

async function applyOrdering(Model, siblingFilter, rearrange) {
  const items = await Model.find(siblingFilter, { order_index: 1 })
    .sort(SIBLING_SORT)
    .lean();

  if (items.length === 0) return null;

  const next = rearrange(items);
  if (!next) return null;

  const ops = buildRenumberOps(next);
  if (ops.length > 0) {
    await Model.bulkWrite(ops, { ordered: false });
  }

  return next.map((item, index) => ({
    _id: String(item._id),
    order_index: index + 1,
  }));
}

function indexOfId(items, id) {
  return items.findIndex((item) => String(item._id) === String(id));
}

function rearrangeByMove(items, itemId, requestedOrderIndex) {
  const from = indexOfId(items, itemId);
  if (from === -1) return null;

  const target = clampOrderIndex(requestedOrderIndex, items.length);
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(target - 1, 0, moved);
  return next;
}

async function movePageToOrderIndex(pageId, requestedOrderIndex) {
  const page = await Page.findById(pageId, { userId: 1 }).lean();
  if (!page) return null;

  const ordering = await applyOrdering(Page, { userId: page.userId }, (items) =>
    rearrangeByMove(items, pageId, requestedOrderIndex)
  );
  if (!ordering) return null;

  return ordering.find((entry) => entry._id === String(pageId))?.order_index ?? null;
}

async function movePostToOrderIndex(postId, requestedOrderIndex) {
  const post = await Post.findById(postId, { pageId: 1 }).lean();
  if (!post) return null;

  const ordering = await applyOrdering(Post, { pageId: post.pageId }, (items) =>
    rearrangeByMove(items, postId, requestedOrderIndex)
  );
  if (!ordering) return null;

  return ordering.find((entry) => entry._id === String(postId))?.order_index ?? null;
}

async function uniqueUsernameTag(baseTag) {
  await connectDB();
  let tag = baseTag || 'user';
  if (tag.length < 2) tag = tag + '0';
  // A reserved tag is treated exactly like a taken one: the static route would
  // win, leaving the profile unreachable.
  const exists =
    isReservedUsernameTag(tag) || (await User.findOne({ usernameTag: tag }).lean());
  if (!exists) return tag;
  let suffix = 2;
  while (true) {
    const candidate = `${tag}-${suffix}`;
    const taken = await User.findOne({ usernameTag: candidate }).lean();
    if (!taken) return candidate;
    suffix++;
  }
}

async function uniquePageSlug(userId, baseSlug, excludePageId = null) {
  await connectDB();
  let slug = baseSlug || 'page';
  if (slug.length < 2) slug = slug + '0';
  const baseQuery = excludePageId ? { userId, slug, _id: { $ne: excludePageId } } : { userId, slug };
  const exists = await Page.findOne(baseQuery).lean();
  if (!exists) return slug;
  let suffix = 2;
  while (true) {
    const candidate = `${slug}-${suffix}`;
    const candidateQuery = excludePageId ? { userId, slug: candidate, _id: { $ne: excludePageId } } : { userId, slug: candidate };
    const taken = await Page.findOne(candidateQuery).lean();
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

// Never leaves the server. Next serialises client-component props into the RSC
// payload embedded in the page HTML, so anything on the user document that
// reaches a client component is readable in view-source by anyone.
const PRIVATE_USER_FIELDS = { passwordHash: 0, firebaseUid: 0 };

/**
 * The only shape of a user that may be handed to a client component.
 * `email` is rendered to the owner alone, so it is omitted for everyone else
 * rather than being sent and then conditionally hidden.
 */
export function toPublicUser(user, { isOwner = false } = {}) {
  if (!user) return null;
  return {
    usernameTag: user.usernameTag,
    usernameTitle: user.usernameTitle,
    email: isOwner ? user.email || '' : '',
    // Sanitised here rather than in the browser: rows written before the
    // route sanitised still hold tags the allowlist rejects, and shipping
    // sanitize-html to every visitor to re-check content that is already
    // clean on write cost more than the whole page route's own JavaScript.
    dashboard: { infoText: sanitizeRichText(user.dashboard?.infoText || '') },
  };
}

export async function getUserByUsernameTag(tag) {
  await connectDB();
  return User.findOne({ usernameTag: tag }, PRIVATE_USER_FIELDS).lean();
}

export async function getUserById(id) {
  await connectDB();
  return User.findById(id).lean();
}

/**
 * The two hex strings the theme endpoint exists to serve, and nothing else.
 * It used to fetch the entire user document to read them.
 */
export async function getUserTheme(tag) {
  await connectDB();
  return User.findOne(
    { usernameTag: tag },
    { _id: 0, 'dashboard.dashHex': 1, 'dashboard.backHex': 1 }
  ).lean();
}

export async function getAdminUserSummaries() {
  await connectDB();

  const [users, pageStats] = await Promise.all([
    User.find(
      {},
      {
        usernameTitle: 1,
        usernameTag: 1,
        email: 1,
        createdAt: 1,
      }
    )
      .sort({ usernameTag: 1 })
      .lean(),
    Page.aggregate([
      {
        $group: {
          _id: '$userId',
          pageCount: { $sum: 1 },
          postCount: { $sum: { $ifNull: ['$postCount', 0] } },
        },
      },
    ]),
  ]);

  const statsByUserId = new Map(
    pageStats.map((entry) => [
      String(entry._id),
      {
        pageCount: entry.pageCount || 0,
        postCount: entry.postCount || 0,
      },
    ])
  );

  return users.map((user) => {
    const stats = statsByUserId.get(String(user._id)) || {
      pageCount: 0,
      postCount: 0,
    };

    return {
      ...user,
      pageCount: stats.pageCount,
      postCount: stats.postCount,
    };
  });
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

/**
 * True when a public file URL belongs to something this user owns: one of
 * their page thumbnails, or the content or thumbnail of a post on one of their
 * pages. Every uploaded URL on the site is publicly readable, so possession of
 * a URL proves nothing — deletes must resolve it back to a record first.
 *
 * Post carries no userId yet (CLN-3), so the post lookup goes via the user's
 * pages.
 */
export async function userOwnsFileUrl(userId, fileUrl) {
  await connectDB();
  if (!userId || !fileUrl) return false;

  const ownedPages = await Page.find({ userId }, { thumbnail: 1 }).lean();
  if (ownedPages.some((page) => page.thumbnail === fileUrl)) return true;
  if (ownedPages.length === 0) return false;

  const ownedPost = await Post.exists({
    pageId: { $in: ownedPages.map((page) => page._id) },
    $or: [{ content: fileUrl }, { thumbnail: fileUrl }],
  });
  return Boolean(ownedPost);
}

export async function getPagesByUser(userId, includePrivate = false) {
  await connectDB();
  const query = { userId };
  if (!includePrivate) query.isPrivate = false;
  // SIBLING_SORT (not order_index alone) so ties resolve identically here and
  // in the ordering writes — otherwise the client and server disagree on
  // position whenever two documents share an index.
  return Page.find(query).sort(SIBLING_SORT).lean();
}

export async function getPageBySlug(userId, slug) {
  await connectDB();
  return Page.findOne({ userId, slug }).lean();
}

export async function createPage(userId, data) {
  await connectDB();
  const user = await User.findById(userId, { usernameTag: 1 }).lean();

  if (!user) {
    throw new Error('User not found');
  }

  // order_index comes from the pages that actually exist. It used to be
  // max(lastPage + 1, pageCount), so a drifted counter fed straight back into
  // the ordering it was supposed to describe. pageCount is now derived after
  // the write instead of being incremented in advance and unwound on failure.
  const lastPage = await Page.findOne({ userId }, { order_index: 1 })
    .sort({ order_index: -1 })
    .lean();
  const order_index = (lastPage?.order_index || 0) + 1;
  const baseSlug = data.slug || toBaseSlug(data.title);
  let lastError;

  for (let attempt = 0; attempt < 8; attempt++) {
    const slugSeed =
      attempt === 0 ? baseSlug : `${baseSlug || 'page'}-${randomSlugSuffix()}`;
    const slug =
      attempt === 0 ? await uniquePageSlug(userId, slugSeed) : slugSeed;

    try {
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

      await reconcilePageCount(userId);
      return page.toObject();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        lastError = error;
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error('Failed to create unique page slug');
}

export async function updatePage(pageId, data) {
  await connectDB();
  const requestedOrderIndex = parseRequestedOrderIndex(data.order_index);
  if (requestedOrderIndex !== null) {
    await movePageToOrderIndex(pageId, requestedOrderIndex);
  }

  const allowed = ['title', 'description', 'thumbnail', 'blurDataURL', 'isPrivate', 'slug'];
  const update = {};
  for (const key of allowed) {
    if (data[key] !== undefined) update[key] = data[key];
  }

  // Resolve slug: auto-derive from title, or deduplicate an explicit slug
  if (data.slug !== undefined || (data.title !== undefined)) {
    const existing = await Page.findById(pageId, { userId: 1, slug: 1, title: 1 }).lean();
    if (existing) {
      if (data.slug !== undefined) {
        // User explicitly set a slug — deduplicate it so conflicts don't throw
        const baseSlug = toBaseSlug(data.slug) || 'page';
        update.slug = await uniquePageSlug(existing.userId, baseSlug, pageId);
      } else if (data.title !== undefined && data.title !== existing.title) {
        // Title changed with no explicit slug — auto-derive from new title
        const baseSlug = toBaseSlug(data.title);
        update.slug = await uniquePageSlug(existing.userId, baseSlug, pageId);
      }
    }
  }

  if (Object.keys(update).length > 0) {
    return Page.findByIdAndUpdate(pageId, { $set: update }, { new: true }).lean();
  }

  return Page.findById(pageId).lean();
}

export async function deletePage(pageId) {
  await connectDB();
  const page = await Page.findById(pageId).lean();
  if (!page) return null;

  // The parent row goes first, and that ordering is load-bearing. createPost
  // re-reads the page after its insert, so once this line lands no post can
  // survive on this page: a create that has already inserted removes itself,
  // and one that has not yet inserted never will. Clearing the posts first
  // instead left a window where a create that had passed its ownership check
  // inserted after the cascade had swept, orphaning the row and its files.
  // See REL-7.
  await Page.findByIdAndDelete(pageId);

  // Read the children after the parent is gone. Any post inserted after this
  // read either predates the parent delete — in which case deleteMany below
  // catches it — or postdates it, in which case createPost has already undone
  // itself and cleaned up its own files.
  const posts = await Post.find({ pageId }, { content: 1, thumbnail: 1 }).lean();
  const fileUrls = [
    page.thumbnail,
    ...posts.flatMap((post) => [post.content, post.thumbnail]),
  ].filter(Boolean);

  // Database first, so the user's view is correct immediately. Storage cleanup
  // is best-effort: an orphaned file is a much smaller problem than a page that
  // is half deleted because the function ran out of time in the middle of a few
  // hundred sequential deletes.
  await Post.deleteMany({ pageId });
  await Page.updateMany(
    { userId: page.userId, order_index: { $gt: page.order_index || 0 } },
    { $inc: { order_index: -1 } }
  );
  await reconcilePageCount(page.userId);

  await deleteR2Files(fileUrls);

  return page;
}

/**
 * Place a page at an absolute 1-based position and renumber the set to 1..n.
 *
 * Absolute rather than "swap these two" on purpose: a swap is only meaningful
 * against the exact state the caller saw, so a duplicated or out-of-order
 * request silently corrupts the result (applying the same swap twice cancels
 * it). Placement is idempotent — replaying it is harmless.
 *
 * Returns the full new ordering, or null if the page is missing.
 */
export async function movePageToIndex(pageId, toIndex) {
  await connectDB();
  const page = await Page.findById(pageId, { userId: 1 }).lean();
  if (!page) return null;

  return applyOrdering(Page, { userId: page.userId }, (items) =>
    rearrangeByMove(items, pageId, toIndex)
  );
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
  return Post.find({ pageId }).sort(SIBLING_SORT).lean();
}

export async function getPostBySlug(pageId, slug) {
  await connectDB();
  return Post.findOne({ pageId, slug }).lean();
}

export async function createPost(pageId, data) {
  await connectDB();
  const baseSlug = data.slug || toBaseSlug(data.title || data.content_type);
  const page = await Page.findById(pageId, { _id: 1 }).lean();

  if (!page) {
    throw parentPageMissingError();
  }

  // Derived from the posts that exist, not from postCount. See createPage.
  const lastPost = await Post.findOne({ pageId }, { order_index: 1 })
    .sort({ order_index: -1 })
    .lean();
  const order_index = (lastPost?.order_index || 0) + 1;
  let lastError;

  for (let attempt = 0; attempt < 8; attempt++) {
    const slugSeed =
      attempt === 0 ? baseSlug : `${baseSlug || 'post'}-${randomSlugSuffix()}`;
    const slug =
      attempt === 0 ? await uniquePostSlug(pageId, slugSeed) : slugSeed;

    try {
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

      // The page can be deleted between the check above and this insert — a
      // user who deletes a page while an upload is still in flight does
      // exactly that. deletePage removes the Page row before it clears the
      // posts, so a missing parent here means this row landed too late for the
      // cascade to see it and nothing else will ever collect it. Undo the
      // insert rather than leaving an unreachable post and an unreferenced
      // file behind. See REL-7.
      if (!(await Page.exists({ _id: pageId }))) {
        await Post.findByIdAndDelete(post._id);
        await deleteR2Files([data.content, data.thumbnail]);
        throw parentPageMissingError();
      }

      await reconcilePostCount(pageId);
      return post.toObject();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        lastError = error;
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error('Failed to create unique post slug');
}

export async function updatePost(postId, data) {
  await connectDB();
  const requestedOrderIndex = parseRequestedOrderIndex(data.order_index);
  if (requestedOrderIndex !== null) {
    await movePostToOrderIndex(postId, requestedOrderIndex);
  }

  const allowed = ['title', 'description', 'content', 'content_type', 'thumbnail', 'blurDataURL'];
  const update = {};
  for (const key of allowed) {
    if (data[key] !== undefined) update[key] = data[key];
  }

  if (Object.keys(update).length > 0) {
    return Post.findByIdAndUpdate(postId, { $set: update }, { new: true }).lean();
  }

  return Post.findById(postId).lean();
}

export async function deletePost(postId) {
  await connectDB();
  const post = await Post.findById(postId).lean();
  if (!post) return null;

  const fileUrls = [post.content, post.thumbnail].filter(Boolean);

  // Database first; storage cleanup is best-effort. See deletePage.
  await Post.findByIdAndDelete(postId);
  await Post.updateMany(
    { pageId: post.pageId, order_index: { $gt: post.order_index || 0 } },
    { $inc: { order_index: -1 } }
  );
  await reconcilePostCount(post.pageId);

  await deleteR2Files(fileUrls);

  return post;
}

/**
 * Place a post at an absolute 1-based position and renumber the set to 1..n.
 * See movePageToIndex for why this is absolute rather than a swap.
 * Returns the full new ordering, or null if the post is missing.
 */
export async function movePostToIndex(postId, toIndex) {
  await connectDB();
  const post = await Post.findById(postId, { pageId: 1 }).lean();
  if (!post) return null;

  return applyOrdering(Post, { pageId: post.pageId }, (items) =>
    rearrangeByMove(items, postId, toIndex)
  );
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
