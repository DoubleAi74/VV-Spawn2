import { notFound } from 'next/navigation';
import { resolveUsernameTag } from '@/lib/data';
import { isDocumentRequest } from '@/lib/isDocumentRequest';

/**
 * Decides what `/{usernameTag}` *is* before anything renders — but only on a
 * document request. A flight already has `loading.js` on the client; awaiting
 * Mongo here is what made a back-navigation sit on the previous screen.
 *
 * On a document request this still lives in the layout, not the page, because
 * a `loading.js` Suspense boundary flushes the status line the moment the
 * page suspends. `notFound()` below that boundary answered 200. See LNK-3.
 */
export default async function UsernameTagLayout({ children, params }) {
  if (!(await isDocumentRequest())) return children;

  const { usernameTag } = await params;
  const { user } = await resolveUsernameTag(usernameTag);

  if (!user) notFound();

  // A stale tag is *not* redirected here, deliberately. This layout cannot see
  // the segments below it, so redirecting from here would send
  // `/{old-tag}/{old-slug}` to `/{new-tag}` and lose the page. Each route below
  // canonicalises the whole path it can see, in one hop.
  return children;
}
