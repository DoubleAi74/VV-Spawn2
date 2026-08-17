import { notFound } from 'next/navigation';
import { resolveUsernameTag } from '@/lib/data';

/**
 * Decides what `/{usernameTag}` *is* before anything renders.
 *
 * This lives in a layout rather than in the pages below it because of how the
 * App Router streams. A `loading.js` — or any Suspense boundary — lets React
 * flush the response shell, and therefore the status line, as soon as the
 * content inside it suspends. Anything the page decides after that point can
 * no longer change the status: `notFound()` answered 200 with the not-found
 * body, and `permanentRedirect()` answered 200 with the destination's body
 * served at the old address. Measured, both, against a production build.
 *
 * A layout renders *above* its own segment's Suspense boundary, so the
 * decision is made while the status is still the server's to set. See LNK-3.
 */
export default async function UsernameTagLayout({ children, params }) {
  const { usernameTag } = await params;
  const { user } = await resolveUsernameTag(usernameTag);

  if (!user) notFound();

  // A stale tag is *not* redirected here, deliberately. This layout cannot see
  // the segments below it, so redirecting from here would send
  // `/{old-tag}/{old-slug}` to `/{new-tag}` and lose the page. Each route below
  // canonicalises the whole path it can see, in one hop.
  return children;
}
