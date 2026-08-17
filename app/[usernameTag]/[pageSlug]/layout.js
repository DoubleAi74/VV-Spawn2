import { notFound, permanentRedirect } from 'next/navigation';
import { resolvePageSlug, resolveUsernameTag } from '@/lib/data';

/**
 * The same job one segment down: decide what `/{usernameTag}/{pageSlug}` is
 * while the status is still settable. See the layout above for why this cannot
 * live in the page — `loading.js` in this segment flushes the shell the moment
 * the page suspends.
 *
 * Both lookups are memoised per request (see `lib/data.js`), so the page below
 * re-reading them costs nothing.
 */
export default async function PageSlugLayout({ children, params }) {
  const { usernameTag, pageSlug } = await params;

  // The layout above has already 404'd a tag that never existed; this resolve
  // is the memoised one it performed.
  const { user, redirected: tagRenamed } = await resolveUsernameTag(usernameTag);
  if (!user) notFound();

  const { page, redirected: slugRenamed } = await resolvePageSlug(user._id, pageSlug);
  if (!page) notFound();

  // Either segment may have arrived through its history. One 308 to the fully
  // canonical address, rather than hopping tag and then slug.
  if (tagRenamed || slugRenamed) {
    permanentRedirect(`/${user.usernameTag}/${page.slug}`);
  }

  return children;
}
